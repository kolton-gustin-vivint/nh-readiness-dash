/**
 * Runs both endpoints for a set of identities and prints what the page would
 * show. Covers the states that are easy to get wrong and hard to notice:
 * a pro with no readiness event, one with no work orders, one who has
 * finished, and an address with no EML record at all.
 *
 *   npm run smoke                            # the default identity set
 *   npm run smoke someone@vivint.com ...     # specific addresses
 *
 * Read-only. It calls the endpoints' execute() directly, so it exercises the
 * identity gate and the real Airtable reads but not the HTTP layer.
 */
import 'dotenv/config';
import { requireNewHire } from '../server/lib/eml';
import getMyReadiness from '../server/api/getMyReadiness';
import getMyFieldExperience from '../server/api/getMyFieldExperience';
import { ApiError } from '../server/lib/endpoint';

/** Verified 2026-10-22 against base app3hcKv9U98zhjNt. */
const DEFAULTS: Array<[string, string]> = [
  ['phillip.daigre@vivint.com', 'Taylor Daigre — 16 WOs, minimums met, no areas/trainers recorded'],
  ['tyler.livingston@vivint.com', 'Tyler Livingston — open event, 0 WOs'],
  ['caylen.dozier@vivint.com', 'Caylen Dozier — no readiness event at all'],
  ['mason.boismier@vivint.com', 'Mason Boismier — Historical, must get no action'],
  ['daniel.loan@vivint.com', 'Daniel Loan — Approved while awaiting reassessment'],
  ['nobody-here@vivint.com', 'no EML record — must refuse, not render blank'],
];

async function run(email: string, note: string) {
  console.log(`\n${'─'.repeat(74)}\n${email}  ${note ? `— ${note}` : ''}`);
  let user;
  try {
    user = await requireNewHire({ email });
  } catch (err) {
    const reason = err instanceof ApiError ? `${err.code}: ${err.message}` : String(err);
    console.log(`  REFUSED  ${reason.slice(0, 120)}`);
    return;
  }

  const context = { user, requestId: 'smoke' };
  const r = await getMyReadiness.execute({ input: {}, context });
  const e = await getMyFieldExperience.execute({ input: {}, context });

  console.log(`  header     ${r.name} · ${r.programWeek ?? '—'} · day ${r.daysInTraining ?? '—'}`);
  console.log(`  stage      ${r.stage.label} (step ${r.stage.index ?? 'unmapped'})`);
  console.log(`  licensing  ${r.licensing.length ? r.licensing.map(l => `${l.name} [${l.status}]`).join('; ') : 'none on file'}`);
  console.log(`  ethics     ${r.courses.ethics.complete ? 'complete' : r.courses.ethics.outstanding.join('; ')}`);
  console.log(`  prostart   ${r.courses.prostart.complete ? 'complete' : r.courses.prostart.outstanding.join('; ')}`);
  if (r.courses.other.length) console.log(`  other      ${r.courses.other.join('; ')}`);
  console.log(`  WOs        install ${r.workOrders.install ?? '—'} / service ${r.workOrders.service ?? '—'} / total ${r.workOrders.total ?? '—'}  shortfall=${r.workOrders.shortfall ?? 'met'}`);
  console.log(`  assess     self=${r.assessments.selfAssessmentScore ?? 'not submitted'} due=${r.assessments.selfAssessmentDue ?? '—'}  fsm=${r.assessments.fsmAssessmentStatus ?? '—'}`);
  console.log(`  event      ${r.event ? `${r.event.label ?? ''} ${r.event.status} awaiting=${r.event.awaitingReassessment}` : 'no event'}`);
  console.log(`  focus      ${r.focusThisWeek ? `${r.focusThisWeek.focus} (${r.focusThisWeek.checkInDate})` : 'not set'}`);
  console.log(`  remediate  ${r.remediation ? (r.remediation.developmentFocus ?? '').slice(0, 60) : 'n/a'}`);
  console.log(`  ACTION     ${r.nextAction ? `${r.nextAction.label}  [${r.nextAction.href ? 'link' : 'no link'}] due=${r.nextAction.due ?? '—'}` : 'nothing due'}`);
  console.log(`  experience ${e.totalWorkOrders} WOs · ${e.jobTypes.map(j => `${j.label} ${j.count}`).join(', ') || 'no job types'}`);
  console.log(`             areas ${e.experienceAreas.length} · participation ${e.participation.latest ?? '—'} (${e.participation.trend}) · trainers ${e.trainedWith.length}`);
  if (e.unattributed || e.missingAreas) {
    console.log(`  DATA GAPS  ${e.unattributed} WOs with no person shadowed · ${e.missingAreas} with no areas selected`);
  }
}

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const set: Array<[string, string]> = args.length ? args.map(a => [a, ''] as [string, string]) : DEFAULTS;
  for (const [email, note] of set) await run(email, note);
  console.log();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
