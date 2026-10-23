/**
 * Populates `Leader` (fld6a1DtSCSOkiZFp) on `Field Ops EML 2.0` by resolving
 * `Reports To Badge ID` -> `EMPLOYEE_ID` across the whole table.
 *
 * Why this exists: EML had no link-based hierarchy at all. `Reports To`
 * (fldYSm1qr8PnbjWVU) is a *formula* echoing REPORTS_TO_NAME_AND_EMPLOYEE_ID,
 * and `Districts.FSMs`/`RMs` are rollups of EML's own name text, so neither
 * gives a traversable edge. The Portfolio interface needs one: a list page
 * filtered on the current user's direct reports serves an FSM (sees pros) and
 * an RM (sees FSMs) with the same filter, because the hierarchy does the
 * branching instead of role logic.
 *
 * CURRENT hierarchy only. This is deliberately NOT a point-in-time snapshot --
 * it re-resolves on every run and will follow a reorg. That is correct for a
 * roster ("who is on my team now") and wrong for attributing a historical
 * Readiness Event, which must keep reading the stamped `FSM Record` /
 * `RM Record` / `Director Record`. Mixing the two is the exact defect the
 * 2026-10-20 identity-stamping work fixed.
 *
 *   npx tsx scripts/populate-leader-link.ts            # dry run, writes nothing
 *   npx tsx scripts/populate-leader-link.ts --apply    # writes
 *
 * Both modes print an unresolved-badge report. Self-reference (a badge that
 * resolves to the record's own id) is skipped rather than written, because
 * Airtable will accept it and it would make a record its own leader.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TABLE_ID = 'tblHWaOfJYBs6ZTZe';
const LEADER_FIELD = 'fld6a1DtSCSOkiZFp';

const F = {
  employeeId: 'EMPLOYEE_ID',
  badge: 'Reports To Badge ID',
  reportsToName: 'REPORTS_TO_NAME_AND_EMPLOYEE_ID',
  name: 'NAME_AND_EMPLOYEE_ID',
  status: 'EMP_STATUS',
  level: 'Field Level',
} as const;

type Rec = { id: string; fields: Record<string, unknown> };

function loadEnv() {
  const raw = readFileSync(resolve(import.meta.dirname, '../.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
  const key = process.env.AIRTABLE_API_KEY;
  const base = process.env.AIRTABLE_BASE_ID;
  if (!key || !base) throw new Error('AIRTABLE_API_KEY / AIRTABLE_BASE_ID missing from .env');
  return { key, base };
}

const { key, base } = loadEnv();
const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.airtable.com/v0/${base}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json() as Promise<any>;
}

/** Normalises a badge for comparison. Both sides are text and whitespace is real. */
function norm(v: unknown): string {
  return String(v ?? '').trim();
}

async function fetchAll(): Promise<Rec[]> {
  const out: Rec[] = [];
  const fields = Object.values(F).map((f) => `fields[]=${encodeURIComponent(f)}`).join('&');
  let offset: string | undefined;
  do {
    const qs = `${fields}&pageSize=100${offset ? `&offset=${offset}` : ''}`;
    const page = await api(`/${TABLE_ID}?${qs}`);
    out.push(...page.records);
    offset = page.offset;
    process.stderr.write(`\r  fetched ${out.length}`);
  } while (offset);
  process.stderr.write('\n');
  return out;
}

/** Writes in batches of 10, the Airtable per-request record cap. */
async function patch(records: { id: string; fields: Record<string, unknown> }[]) {
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10);
    await api(`/${TABLE_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ records: chunk, typecast: false }),
    });
    process.stderr.write(`\r  wrote ${Math.min(i + 10, records.length)}/${records.length}`);
    await new Promise((r) => setTimeout(r, 220)); // 5 req/s API limit
  }
  process.stderr.write('\n');
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`populate-leader-link — ${apply ? 'APPLY' : 'DRY RUN'}\n`);

  const all = await fetchAll();
  console.log(`EML records: ${all.length}\n`);

  // badge -> record ids. Collected as an array first so a duplicate EMPLOYEE_ID
  // is reported rather than silently resolving to whichever row came last.
  const byBadge = new Map<string, string[]>();
  for (const r of all) {
    const id = norm(r.fields[F.employeeId]);
    if (!id) continue;
    byBadge.set(id, [...(byBadge.get(id) ?? []), r.id]);
  }
  const dupes = [...byBadge].filter(([, ids]) => ids.length > 1);

  const updates: { id: string; fields: Record<string, unknown> }[] = [];
  const noBadge: Rec[] = [];
  const unresolved = new Map<string, Rec[]>();
  const ambiguous: Rec[] = [];
  const selfRef: Rec[] = [];

  for (const r of all) {
    const badge = norm(r.fields[F.badge]);
    if (!badge) { noBadge.push(r); continue; }

    const hits = byBadge.get(badge);
    if (!hits) { unresolved.set(badge, [...(unresolved.get(badge) ?? []), r]); continue; }
    if (hits.length > 1) { ambiguous.push(r); continue; }
    if (hits[0] === r.id) { selfRef.push(r); continue; }

    updates.push({ id: r.id, fields: { [LEADER_FIELD]: [hits[0]] } });
  }

  const pct = (n: number) => `${((n / all.length) * 100).toFixed(1)}%`;
  console.log(`resolved           ${updates.length}  (${pct(updates.length)})`);
  console.log(`no badge           ${noBadge.length}  (${pct(noBadge.length)})`);
  console.log(`badge not in EML   ${[...unresolved.values()].flat().length}  across ${unresolved.size} distinct badges`);
  console.log(`ambiguous badge    ${ambiguous.length}`);
  console.log(`self-reference     ${selfRef.length}`);

  if (dupes.length) {
    console.log(`\nDUPLICATE EMPLOYEE_ID (${dupes.length}) — these make a leader unresolvable:`);
    for (const [badge, ids] of dupes.slice(0, 20)) console.log(`  ${badge} -> ${ids.join(', ')}`);
  }

  if (unresolved.size) {
    // Ranked by blast radius: a missing leader row that many people point at
    // costs a whole team's roster, not one row.
    const ranked = [...unresolved].sort((a, b) => b[1].length - a[1].length);
    console.log(`\nTOP UNRESOLVED BADGES (leader not present in EML):`);
    for (const [badge, recs] of ranked.slice(0, 15)) {
      const example = norm(recs[0].fields[F.reportsToName]) || '(no name)';
      console.log(`  ${badge}  ${recs.length} report(s)  -> ${example}`);
    }
  }

  // The number that actually matters for the interface: can a Leader be reached
  // from an in-training Pro, and from the FSM above them.
  const training = all.filter((r) => norm(r.fields[F.status]) === 'Training');
  const resolvedIds = new Set(updates.map((u) => u.id));
  const trainingResolved = training.filter((r) => resolvedIds.has(r.id)).length;
  console.log(
    `\nin-training pros with a resolvable leader: ${trainingResolved}/${training.length}` +
      ` (${((trainingResolved / Math.max(training.length, 1)) * 100).toFixed(1)}%)`,
  );

  const leaders = all.filter((r) => norm(r.fields[F.level]) === 'Leader');
  const leadersResolved = leaders.filter((r) => resolvedIds.has(r.id)).length;
  console.log(
    `leaders with a resolvable leader (the RM hop): ${leadersResolved}/${leaders.length}` +
      ` (${((leadersResolved / Math.max(leaders.length, 1)) * 100).toFixed(1)}%)`,
  );

  if (!apply) {
    console.log(`\nDry run — nothing written. Re-run with --apply to write ${updates.length} links.`);
    return;
  }

  console.log(`\nwriting ${updates.length} links...`);
  await patch(updates);
  console.log('done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
