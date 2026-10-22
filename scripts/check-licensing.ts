/**
 * Measures licensing coverage for the pros the New Hire page serves.
 *
 *   npx tsx --env-file=.env scripts/check-licensing.ts
 *
 * The page renders a licensing card from `Field Ops EML 2.0.Licensing` ->
 * `Licensing`. Two separate things can make that card useless:
 *
 *   1. the pro has no linked Licensing records at all, so the card is empty
 *   2. the pro has records, but the fields the card reads are blank
 *
 * This reports both, because they need different fixes.
 *
 * Read-only. It writes nothing.
 */
import 'dotenv/config';
import { FieldOpsEml20, Licensing } from '../server/airtable/index';

const FIELDS = ['licenseName', 'licenseStateAbbr', 'licenseStatusC', 'expirationDateC'] as const;

async function main() {
  const pros: Array<{ id: string; name: string; status: string; licenceIds: string[] }> = [];
  let offset: string | undefined;

  for (let page = 0; page < 60; page++) {
    const res = await FieldOpsEml20.findAll({
      filters: { empStatus: 'Training' },
      fields: ['preferredFullName', 'legalFullName', 'newHireStatus', 'licensing'],
      limit: 100,
      offset,
    });
    for (const r of res.records) {
      const raw = r.licensing;
      const ids = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
      pros.push({
        id: r.id,
        name: String(r.preferredFullName || r.legalFullName || '(no name)'),
        status: String(r.newHireStatus || ''),
        licenceIds: ids,
      });
    }
    if (!res.offset) break;
    offset = res.offset;
  }

  const withLinks = pros.filter(p => p.licenceIds.length > 0);
  const withoutLinks = pros.filter(p => p.licenceIds.length === 0);

  console.log(`in-training pros:            ${pros.length}`);
  console.log(`  with >=1 Licensing link:   ${withLinks.length}`);
  console.log(`  with NO Licensing link:    ${withoutLinks.length}`);

  // Break the no-link group down by new hire status, so we can tell whether
  // "no licence" is expected (brand new) or a real gap (deep in training).
  if (withoutLinks.length) {
    const byStatus = new Map<string, number>();
    for (const p of withoutLinks) byStatus.set(p.status || '(blank)', (byStatus.get(p.status || '(blank)') ?? 0) + 1);
    console.log('\nno-link pros by new hire status:');
    for (const [k, v] of [...byStatus].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(v).padStart(4)}  ${k}`);
    }
  }

  // Now the field fill rate on the records that are actually linked.
  const allIds = [...new Set(withLinks.flatMap(p => p.licenceIds))];
  console.log(`\nlinked Licensing records:    ${allIds.length}`);

  const fill: Record<string, number> = {};
  for (const f of FIELDS) fill[f] = 0;
  const statuses = new Map<string, number>();
  let fetched = 0;

  for (let i = 0; i < allIds.length; i += 100) {
    const chunk = allIds.slice(i, i + 100);
    const page = await Licensing.findAll({
      filters: { id: { in: chunk } },
      fields: [...FIELDS],
      limit: 100,
    });
    for (const r of page.records) {
      fetched++;
      for (const f of FIELDS) {
        const v = (r as unknown as Record<string, unknown>)[f];
        const s = Array.isArray(v) ? v.join('') : v == null ? '' : String(v);
        if (s.trim()) fill[f]++;
      }
      const st = String(r.licenseStatusC || '(blank)');
      statuses.set(st, (statuses.get(st) ?? 0) + 1);
    }
  }

  console.log(`fetched:                     ${fetched}`);
  console.log('\nfield fill rate on linked records:');
  for (const f of FIELDS) {
    const pct = fetched ? ((fill[f] / fetched) * 100).toFixed(1) : '0.0';
    console.log(`  ${f.padEnd(20)} ${String(fill[f]).padStart(5)} / ${fetched}  ${pct}%`);
  }

  console.log('\nLICENSE_STATUS__C values:');
  for (const [k, v] of [...statuses].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(5)}  ${k}`);
  }

  // A few concrete examples to eyeball in the base.
  console.log('\nsample pros WITH links:');
  for (const p of withLinks.slice(0, 5)) console.log(`  ${p.id}  ${p.licenceIds.length} licence(s)  ${p.name}  [${p.status}]`);
  console.log('\nsample pros WITHOUT links:');
  for (const p of withoutLinks.slice(0, 5)) console.log(`  ${p.id}  ${p.name}  [${p.status}]`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
