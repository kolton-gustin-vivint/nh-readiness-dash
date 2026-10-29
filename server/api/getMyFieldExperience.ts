/**
 * getMyFieldExperience — the "My field experience" half of the New Hire page.
 *
 * This is the section that justified building a web app instead of an Airtable
 * interface. All four of the doc's requirements here are group-bys over the
 * pro's WO records:
 *
 *   - "Install, Service, Upgrade, and VHE counts and distribution"
 *   - "Experience areas such as security, cameras, … and job closeout"
 *   - "Participation trend: observed, assisted, completed independently, led"
 *   - "Who the new hire has trained with and the number of recorded WOs with
 *      each person"
 *
 * In Airtable each bucket needs its own rollup field on EML. Here they are one
 * table read and four reduces.
 *
 * Two deliberate departures from the existing Airtable fields:
 *
 * 1. **Counts, not percentages.** The doc lists nine experience areas prefixed
 *    "such as", i.e. an open list, and asks for "counts and distribution". It
 *    never asks for a coverage percentage. `Experience Coverage %` divides by a
 *    fixed denominator of ten, which is an interpretation with no anchor in the
 *    doc, so this page reports areas covered and the count of each.
 *
 * 2. **Blank `Person Shadowed` is reported, not silently bucketed.** The EML
 *    field `% Other Pros` counts a WO with no person shadowed as "other",
 *    because `Is FSM WO` returns false for a blank — so an unanswered form
 *    inflates the other-pros share. Here blanks are counted separately and
 *    surfaced as `unattributed`, because the honest answer to "who have I
 *    trained with" includes "we do not know for N of them".
 */
import { z } from 'zod';
import { createEndpoint } from '../lib/endpoint';
import { NhWoExperience } from '../airtable/index';
import { cleanNumber, firstString, stringList } from '../lib/readiness';

/**
 * The participation ladder is NOT hardcoded.
 *
 * The doc describes it as "observed, assisted, completed independently, led" —
 * four rungs. The base's `Highest Participation` actually has five, with
 * different wording: Mostly Observed / Assisted / Completed Several Tasks
 * Independently / Led Large Portions of the Work / Fully Independent. A
 * hardcoded list built from the doc's phrasing silently dropped 13 of one
 * pro's 16 work orders, because no label matched.
 *
 * So the rungs are derived from the records themselves and ordered by
 * `Participation Rank`, which is the base's own SWITCH over those options.
 * Adding or renaming an option cannot break this.
 */

const countSchema = z.object({ label: z.string(), count: z.number() });

const outputSchema = z.object({
  totalWorkOrders: z.number(),
  jobTypes: z.array(countSchema),
  experienceAreas: z.array(countSchema),
  participation: z.object({
    ladder: z.array(countSchema),
    highest: z.string().nullable(),
    latest: z.string().nullable(),
    trend: z.enum(['improving', 'steady', 'slipped', 'unknown']),
  }),
  trainedWith: z.array(countSchema),
  unattributed: z.number(),
  /** WOs with no experience areas selected — silent zero-coverage submissions. */
  missingAreas: z.number(),
});

export default createEndpoint({
  description: "The signed-in new hire's own field-experience breakdown",
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema,
  execute: async ({ context }) => {
    const rows = await allWoRows(context.user.id);

    const jobTypes = tally(rows.map(r => firstString(r.jobType)));
    const areas = tally(rows.flatMap(r => expandAreas(r)));
    const trainedWith = tally(rows.map(r => firstString(r.shadowedName)));

    return {
      totalWorkOrders: rows.length,
      jobTypes,
      experienceAreas: areas,
      participation: participationTrend(rows),
      trainedWith,
      unattributed: rows.filter(r => !stringList(r.personShadowed).length).length,
      missingAreas: rows.filter(r => !stringList(r.experienceAreas).length).length,
    };
  },
});

/**
 * Every WO record for this pro.
 *
 * Paged to completion rather than capped, because a count that silently stops
 * at 100 is worse than a slow page — Taylor Daigre already has 16 and the
 * minimums are 10 install plus 6 service, so real pros will approach the page
 * size. The 20-page ceiling is a runaway guard, not an expected limit.
 */
async function allWoRows(proRecordId: string) {
  const out: Awaited<ReturnType<typeof NhWoExperience.findAll>>['records'] = [];
  let offset: string | undefined;

  for (let page = 0; page < 20; page++) {
    const res = await NhWoExperience.findAll({
      filters: { employee: { contains: proRecordId } },
      fields: [
        'jobType',
        'experienceAreas',
        'otherExperienceAreas',
        'personShadowed',
        'shadowedName',
        'highestParticipation',
        'participationRank',
        'workOrderDate',
        'submittedAt',
      ],
      sort: [{ field: 'workOrderDate', direction: 'asc' }],
      limit: 100,
      offset,
    });
    out.push(...res.records);
    if (!res.hasMore || !res.offset) break;
    offset = res.offset;
  }
  return out;
}

/**
 * Experience areas for one WO, with `Other` replaced by its free-text twin so
 * the list self-describes rather than showing a bare "Other".
 */
function expandAreas(row: { experienceAreas?: unknown; otherExperienceAreas?: unknown }): string[] {
  const detail = firstString(row.otherExperienceAreas);
  return stringList(row.experienceAreas).map(area => (area === 'Other' && detail ? detail : area));
}

/** Counts occurrences, drops blanks, and sorts by count then label. */
function tally(values: Array<string | null>): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Participation progression.
 *
 * EML's `Max Participation` is a high-water mark, so it cannot show a
 * regression: a pro who worked fully independently once and has since gone
 * back to assisting still reads "Fully Independent". The doc asks how
 * participation is "progressing", so the latest value is reported alongside
 * the highest and the two are compared.
 *
 * `rows` arrives sorted by `Work Order Date` ascending. Records predating the
 * `Work Order Date` field have a blank date and sort first, which is the right
 * place for them — they are the oldest. The field is new, so the back-fill is
 * still outstanding and the trend is weaker the further back it reaches.
 */
function participationTrend(
  rows: Array<{ highestParticipation?: unknown; participationRank?: unknown }>,
) {
  const ranked = rows
    .map(r => ({ label: firstString(r.highestParticipation), rank: cleanNumber(r.participationRank) }))
    .filter((r): r is { label: string; rank: number } => Boolean(r.label) && r.rank !== null);

  // Rungs present in this pro's own records, ordered by the base's rank.
  const counts = new Map<string, { count: number; rank: number }>();
  for (const r of ranked) {
    const hit = counts.get(r.label);
    counts.set(r.label, { count: (hit?.count ?? 0) + 1, rank: r.rank });
  }
  const ladder = [...counts.entries()]
    .sort((a, b) => a[1].rank - b[1].rank)
    .map(([label, v]) => ({ label, count: v.count }));

  if (!ranked.length) {
    return { ladder, highest: null, latest: null, trend: 'unknown' as const };
  }

  const latest = ranked[ranked.length - 1];
  const highestRank = Math.max(...ranked.map(r => r.rank));
  const highest = ranked.find(r => r.rank === highestRank);

  // A single record is a starting point, not a direction.
  let trend: 'improving' | 'steady' | 'slipped' | 'unknown' = 'unknown';
  if (ranked.length >= 2) {
    const previous = ranked[ranked.length - 2];
    const delta = latest.rank - previous.rank;
    trend = delta > 0 ? 'improving' : delta < 0 ? 'slipped' : 'steady';
  }

  return { ladder, highest: highest?.label ?? null, latest: latest.label, trend };
}
