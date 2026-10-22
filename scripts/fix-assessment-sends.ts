/**
 * Clears assessment send dates that should never have been set.
 *
 *   npx tsx --env-file=.env scripts/fix-assessment-sends.ts          # dry run
 *   npx tsx --env-file=.env scripts/fix-assessment-sends.ts --apply
 *   npx tsx --env-file=.env scripts/fix-assessment-sends.ts --undo
 *
 * ----------------------------------------------------------------------------
 * This UPDATES pre-existing records, unlike scripts/seed-demo-data.ts which
 * only inserts. So it snapshots the original values to
 * scripts/assessment-send-snapshot.json first, and --undo writes them back.
 * ----------------------------------------------------------------------------
 *
 * The rule, per Austi: both the readiness self-assessment and the FSM
 * readiness check require Ethics and Compliance complete, ProStart complete,
 * 10 install work orders and 6 service work orders before they are sent.
 *
 * Whatever sets `Self Assessment Sent` and `FSM Assessment Sent Date` does not
 * enforce that. Three pros were sent forms they were not eligible for, which
 * then cascades: `Self Assessment Due` is WORKDAY(sent, 2) and
 * `FSM Assessment Status` is derived from the FSM send date, so one bad write
 * produces a due date and a "Sent"/"Overdue" status out of nothing.
 *
 * This only clears a send date where the pro is ineligible AND has no
 * submitted assessment record. A pro who actually submitted something must
 * keep their send date, or the base would claim a form was submitted that was
 * never sent — a worse inconsistency than the one being fixed.
 *
 * It does not touch the real fix, which is to add the prerequisite check to
 * whichever automation performs the send.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { FieldOpsEml20, RequiredCourses, FsmProgressCheckIn } from '../server/airtable/index';
import { cleanNumber, firstString, stringList } from '../server/lib/readiness';

const SNAPSHOT = new URL('./assessment-send-snapshot.json', import.meta.url).pathname;

const MIN_INSTALL = 10;
const MIN_SERVICE = 6;

interface Snapshot {
  takenAt: string;
  records: Array<{
    id: string;
    name: string;
    selfAssessmentSent: string | null;
    fsmAssessmentSentDate: string | null;
  }>;
}

async function courseTitles(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const page = await RequiredCourses.findAll({ filters: { id: { in: ids } }, fields: ['name'], limit: 100 });
  return page.records.map(r => firstString(r.name)).filter((t): t is string => Boolean(t));
}

async function audit() {
  // Only pros with at least one send date can be in violation.
  const pros = await FieldOpsEml20.findAll({
    filters: { formula: 'OR({Self Assessment Sent}, {FSM Assessment Sent Date})' },
    fields: [
      'preferredFullName',
      'legalFullName',
      'courseNames',
      'installWosComplete',
      'serviceWosComplete',
      'selfAssessmentSent',
      'fsmAssessmentSentDate',
      'nhSelfAssessment',
      'fsmAssessmentsAsPro',
    ],
    limit: 100,
  });

  const rows = [];
  for (const p of pros.records) {
    const titles = await courseTitles(stringList(p.courseNames));
    const ethics = titles.filter(t => /^ethics\b/i.test(t));
    const prostart = titles.filter(t => /^prostart\b/i.test(t));
    const install = cleanNumber(p.installWosComplete) ?? 0;
    const service = cleanNumber(p.serviceWosComplete) ?? 0;

    const blockers: string[] = [];
    if (ethics.length) blockers.push(`${ethics.length} ethics`);
    if (prostart.length) blockers.push(`${prostart.length} prostart`);
    if (install < MIN_INSTALL) blockers.push(`install ${install}/${MIN_INSTALL}`);
    if (service < MIN_SERVICE) blockers.push(`service ${service}/${MIN_SERVICE}`);

    // A submitted assessment must keep its send date.
    const submitted = stringList(p.nhSelfAssessment).length + stringList(p.fsmAssessmentsAsPro).length;

    rows.push({
      id: p.id,
      name: firstString(p.preferredFullName) || firstString(p.legalFullName) || p.id,
      selfAssessmentSent: firstString(p.selfAssessmentSent),
      fsmAssessmentSentDate: firstString(p.fsmAssessmentSentDate),
      blockers,
      submitted,
      fixable: blockers.length > 0 && submitted === 0,
    });
  }
  return rows;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const undo = process.argv.includes('--undo');

  if (undo) {
    if (!existsSync(SNAPSHOT)) {
      console.error('No snapshot to restore from.');
      process.exit(1);
    }
    const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Snapshot;
    for (const r of snap.records) {
      await FieldOpsEml20.update({
        id: r.id,
        record: {
          selfAssessmentSent: r.selfAssessmentSent,
          fsmAssessmentSentDate: r.fsmAssessmentSentDate,
        } as never,
      });
      console.log(`restored ${r.id}  ${r.name}  sa=${r.selfAssessmentSent} fsm=${r.fsmAssessmentSentDate}`);
    }
    console.log(`\nrestored ${snap.records.length} records from ${snap.takenAt}`);
    return;
  }

  const rows = await audit();
  console.log(`pros with a send date: ${rows.length}\n`);
  for (const r of rows) {
    const state = r.fixable
      ? `INELIGIBLE (${r.blockers.join(', ')})`
      : r.blockers.length
        ? `ineligible but has ${r.submitted} submitted record(s) — LEFT ALONE`
        : 'eligible';
    console.log(`${r.name.padEnd(18)} sa=${String(r.selfAssessmentSent).padEnd(12)} fsm=${String(r.fsmAssessmentSentDate).padEnd(12)} ${state}`);
  }

  const fixable = rows.filter(r => r.fixable);
  if (!fixable.length) {
    console.log('\nNothing to fix.');
    return;
  }

  if (!apply) {
    console.log(`\n${fixable.length} record(s) would be cleared. Re-run with --apply.`);
    return;
  }

  const snap: Snapshot = {
    takenAt: new Date().toISOString(),
    records: fixable.map(r => ({
      id: r.id,
      name: r.name,
      selfAssessmentSent: r.selfAssessmentSent,
      fsmAssessmentSentDate: r.fsmAssessmentSentDate,
    })),
  };
  writeFileSync(SNAPSHOT, `${JSON.stringify(snap, null, 2)}\n`);
  console.log(`\nsnapshot written: scripts/assessment-send-snapshot.json`);

  for (const r of fixable) {
    await FieldOpsEml20.update({
      id: r.id,
      record: { selfAssessmentSent: null, fsmAssessmentSentDate: null } as never,
    });
    console.log(`cleared  ${r.id}  ${r.name}`);
  }

  console.log(`\ncleared ${fixable.length} record(s). Undo with --undo.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
