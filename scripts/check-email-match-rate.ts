/**
 * Measures how many in-training pros have a WORK_EMAIL that an SSO session
 * could match, and reports the ones that could not sign in.
 *
 *   npm run email:match
 *
 * This is the single assumption the whole app rests on: the identity gate
 * joins the Magistrate session email to `Field Ops EML 2.0.WORK_EMAIL`. A pro
 * with a blank, malformed or duplicated work email cannot be shown their own
 * readiness, and in an Airtable interface that failure is an empty page with
 * no error. Run this before go-live, not after.
 *
 * Read-only. It writes nothing.
 */
import 'dotenv/config';
import { FieldOpsEml20 } from '../server/airtable/index';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function main() {
  const rows: Array<{ id: string; name: string; email: string; status: string }> = [];
  let offset: string | undefined;

  for (let page = 0; page < 60; page++) {
    const res = await FieldOpsEml20.findAll({
      // Everyone the program currently applies to. A Historical pro still
      // needs access per §8 retention, but they are not the go-live risk.
      filters: { empStatus: 'Training' },
      fields: ['workEmail', 'preferredFullName', 'legalFullName', 'newHireStatus'],
      limit: 100,
      offset,
    });
    for (const r of res.records) {
      rows.push({
        id: r.id,
        name: String(r.preferredFullName || r.legalFullName || '(no name)'),
        email: String(r.workEmail || '').trim(),
        status: String(r.newHireStatus || ''),
      });
    }
    if (!res.hasMore || !res.offset) break;
    offset = res.offset;
  }

  const blank = rows.filter(r => !r.email);
  const malformed = rows.filter(r => r.email && !EMAIL_RE.test(r.email));
  const mixedCase = rows.filter(r => r.email && r.email !== r.email.toLowerCase());

  const byEmail = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.email) continue;
    const key = r.email.toLowerCase();
    byEmail.set(key, [...(byEmail.get(key) ?? []), r.name]);
  }
  const duplicates = [...byEmail.entries()].filter(([, names]) => names.length > 1);

  const usable = rows.length - blank.length - malformed.length - duplicates.reduce((n, [, v]) => n + v.length, 0);

  console.log(`\nIn-training pros: ${rows.length}`);
  console.log(`Could sign in:    ${usable} (${rows.length ? Math.round((usable / rows.length) * 100) : 0}%)`);
  console.log(`Blank WORK_EMAIL: ${blank.length}`);
  console.log(`Malformed:        ${malformed.length}`);
  console.log(`Duplicated:       ${duplicates.length} address(es)`);
  console.log(`Mixed case:       ${mixedCase.length} (handled by the gate's case-insensitive fallback)`);

  const show = (label: string, items: Array<{ name: string; email: string }>) => {
    if (!items.length) return;
    console.log(`\n${label}:`);
    for (const r of items.slice(0, 25)) console.log(`  ${r.name.padEnd(28)} ${r.email || '(blank)'}`);
    if (items.length > 25) console.log(`  … and ${items.length - 25} more`);
  };

  show('Cannot sign in — blank work email', blank);
  show('Cannot sign in — malformed work email', malformed);

  if (duplicates.length) {
    console.log('\nCannot sign in — duplicated work email (the gate refuses rather than guessing):');
    for (const [email, names] of duplicates.slice(0, 25)) console.log(`  ${email} → ${names.join(', ')}`);
  }

  console.log(
    '\nNote: this proves the Airtable side only. It does NOT prove that SSO issues the same\n' +
      'address — that needs one real Magistrate sign-in compared against this list.\n',
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
