/**
 * Exercises the identity gate without a browser.
 *
 *   npm run auth:check                      # samples a real pro, plus the refusal cases
 *   npm run auth:check someone@vivint.com   # checks specific addresses
 *
 * Read-only. It resolves addresses through the same `requireNewHire` the API
 * route uses, so an ALLOWED line here means that person would see their page.
 */
import 'dotenv/config';
import { requireNewHire } from '../server/lib/eml';
import { FieldOpsEml20 } from '../server/airtable/index';
import { ApiError } from '../server/lib/endpoint';

async function check(email: string, note = '') {
  const label = `${email || '(empty)'}${note ? ` ${note}` : ''}`;
  try {
    const user = await requireNewHire({ email });
    console.log(`  ALLOWED  ${label.padEnd(44)} → ${user.id} ${user.name ?? ''}`);
  } catch (err) {
    const reason = err instanceof ApiError ? `${err.code}: ${err.message}` : String(err);
    console.log(`  REFUSED  ${label.padEnd(44)} → ${reason.slice(0, 90)}`);
  }
}

async function main() {
  const args = process.argv.slice(2).filter(Boolean);

  if (args.length) {
    console.log('\nIdentity gate:');
    for (const email of args) await check(email);
    console.log();
    return;
  }

  // Sample one real in-training pro so the allow path is proven, not assumed.
  const page = await FieldOpsEml20.findAll({
    filters: { empStatus: 'Training' },
    fields: ['workEmail'],
    limit: 1,
  });
  const sample = String(page.records[0]?.workEmail || '');

  console.log('\nIdentity gate:');
  if (sample) await check(sample, '(sampled in-training pro)');
  await check(sample.toUpperCase(), '(case mismatch — should still allow)');
  await check('definitely-not-a-pro@vivint.com', '(no EML row)');
  await check('', '(no session)');
  console.log();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
