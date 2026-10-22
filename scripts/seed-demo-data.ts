/**
 * Seeds the two states no existing record in the base can demonstrate.
 *
 *   npx tsx --env-file=.env scripts/seed-demo-data.ts
 *   npx tsx --env-file=.env scripts/seed-demo-data.ts --undo
 *
 * ----------------------------------------------------------------------------
 * TEMPORARY, and WRITES to a shared base. Every created record id is appended
 * to scripts/seeded-demo-records.json, and --undo deletes exactly those ids
 * and nothing else. It never updates or deletes a pre-existing record, so the
 * base can always be returned to its current state.
 * ----------------------------------------------------------------------------
 *
 * Why seed at all: every field that drives the page is a formula, lookup or
 * rollup — `WO Experience Gate`, `Event Status`, `Readiness Decision`,
 * `New Hire Status`, `Current Program Week`. States cannot be set directly,
 * only produced by writing the child records underneath and letting Airtable
 * compute. So these are real rows through the real pipeline.
 *
 * The two gaps:
 *
 *   1. `FSM Progress Check-in` has 0 rows, so "Focus for this week" — a named
 *      requirement in the governance doc — can never populate.
 *   2. Only one pro has work-order rows and most lack `Experience Areas` and
 *      `Highest Participation`, so all four charts render near-empty.
 *
 * Choice of pros is deliberate. Adding work-order rows feeds the
 * `Install/Service WOs Complete` rollups, which feed `WO Experience Gate`, so
 * seeding the wrong pro would silently flip them from "Log a work order" to
 * "Minimums met" and destroy that scenario:
 *
 *   - Taylor Daigre already reads gate "None" (minimums met), so extra rows
 *     cannot change his action. He gets the rich set.
 *   - Tyler Livingston gets 3 rows. The minimum is 10 install + 6 service, so
 *     3 leaves him short and his "Log a work order" action survives — while
 *     giving a second, sparser chart state to compare against.
 *   - Jd Cottrell, Daniel Loan, Abdullah Hunter, Kolton Gustin and Brandon
 *     Murakami are left untouched; their scenarios depend on current state.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { FsmProgressCheckIn, NhWoExperience } from '../server/airtable/index';

const LEDGER = new URL('./seeded-demo-records.json', import.meta.url).pathname;

const PRO = {
  taylor: 'reckNdRt1QK4cGdML',
  tyler: 'recP2wREq9X664wVW',
  brandon: 'rec2z6LqLxDOFRasD',
};

/** Active employees used for Submitter / Person Shadowed links. */
const STAFF = {
  sumner: 'recoIl0hs3dK8wPms',
  narciso: 'reca7csUZFlexCVXI',
  rodriguez: 'recisHIZOt3JrWbzw',
  reese: 'recqp1sJx83tyV97p',
};

interface Ledger {
  createdAt: string;
  checkIns: string[];
  woExperience: string[];
}

function readLedger(): Ledger {
  if (!existsSync(LEDGER)) return { createdAt: '', checkIns: [], woExperience: [] };
  return JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;
}

function writeLedger(l: Ledger): void {
  writeFileSync(LEDGER, `${JSON.stringify(l, null, 2)}\n`);
}

/** YYYY-MM-DD, `days` ago (negative for the future). */
function day(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function seed(): Promise<void> {
  const ledger = readLedger();
  if (ledger.checkIns.length || ledger.woExperience.length) {
    console.error(
      `Ledger already records ${ledger.checkIns.length + ledger.woExperience.length} seeded rows.\n` +
        'Run with --undo first, or delete scripts/seeded-demo-records.json if those rows are already gone.',
    );
    process.exit(1);
  }

  // ---- 1. Check-ins -------------------------------------------------------
  // Two contrasting rows. `Check-in Milestone` is a formula and derives
  // itself; EML's `Check-ins (as New Hire)` is the inverse link and populates
  // automatically, which is how getMyReadiness finds these.
  const checkIns = [
    {
      employee: [PRO.taylor],
      submitter: [STAFF.sumner],
      checkInDate: day(3),
      newHireReadinessProgression: 'On Track',
      whatIsTheNewHireDoingWell:
        'Confident on panel swaps and talks the customer through each step without prompting.',
      primaryFocusBeforeNextCheckIn: 'Troubleshooting',
      focusAction: 'Run the diagnostics flow unaided on the next two service calls.',
      focusOwner: [STAFF.sumner],
      focusTargetDate: day(-7),
      confidenceInNewHire: 'Confident',
      readinessConcerns: ['Nothing'],
      attestation: true,
      submittedDate: `${day(3)}T17:00:00.000Z`,
    },
    {
      employee: [PRO.tyler],
      submitter: [STAFF.narciso],
      checkInDate: day(5),
      newHireReadinessProgression: 'Needs Attention',
      whatIsTheNewHireDoingWell: 'Good with customers and keeps the van tidy.',
      primaryFocusBeforeNextCheckIn: 'Independence / Job Flow',
      focusAction: 'Lead the install start-to-finish with me observing only.',
      focusOwner: [STAFF.narciso],
      focusTargetDate: day(-10),
      confidenceInNewHire: 'Somewhat Confident',
      readinessConcerns: ['On-time for Work Orders / Time Clock Adherence'],
      concernAction: 'Agreed a 7:30 start check-in each morning for the next two weeks.',
      concernOwner: [STAFF.narciso],
      concernTargetDate: day(-14),
      attestation: true,
      submittedDate: `${day(5)}T16:30:00.000Z`,
    },
  ];

  for (const row of checkIns) {
    const rec = await FsmProgressCheckIn.create({ record: row as never });
    ledger.checkIns.push(rec.id);
    console.log(`check-in   ${rec.id}  ${row.newHireReadinessProgression}`);
  }

  // ---- 2. Work-order experience ------------------------------------------
  // Varied job types, multiple experience areas per row, participation spread
  // across the real five rungs, and three different people shadowed so the
  // "who you trained with" proportion bar has something to divide.
  const rich = [
    { jobType: 'Install',  areas: ['Panel / Sensors', 'Life Safety', 'Customer Education'], part: 'Mostly Observed',                      shadow: STAFF.sumner,    hands: 'Limited',   genie: 'None', fb: 'Somewhat',          learn: 'Yes', d: 20 },
    { jobType: 'Install',  areas: ['Panel / Sensors', 'Cameras', 'Networking'],             part: 'Assisted',                             shadow: STAFF.sumner,    hands: 'Moderate',  genie: 'Some', fb: 'Yes, consistently', learn: 'Yes', d: 17 },
    { jobType: 'Service',  areas: ['Troubleshooting / Diagnostics', 'Thermostat'],          part: 'Assisted',                             shadow: STAFF.narciso,   hands: 'Moderate',  genie: 'Some', fb: 'Yes, consistently', learn: 'Yes', d: 15 },
    { jobType: 'Install',  areas: ['Door Locks', 'Thermostat', 'Full Systems Test / Job Closeout'], part: 'Completed Several Tasks Independently', shadow: STAFF.narciso, hands: 'Extensive', genie: 'Most', fb: 'Yes, consistently', learn: 'Yes', d: 12 },
    { jobType: 'Service',  areas: ['Troubleshooting / Diagnostics', 'Customer Education'],  part: 'Completed Several Tasks Independently', shadow: STAFF.rodriguez, hands: 'Extensive', genie: 'Most', fb: 'Somewhat',          learn: 'Somewhat', d: 10 },
    { jobType: 'VHE',      areas: ['Cameras', 'Networking'],                                part: 'Led Large Portions of the Work',       shadow: STAFF.rodriguez, hands: 'Extensive', genie: 'All',  fb: 'Yes, consistently', learn: 'Yes', d: 7 },
    { jobType: 'Panel Upgrade (financial upgrade)', areas: ['Panel / Sensors', 'Customer Education'], part: 'Led Large Portions of the Work', shadow: STAFF.sumner, hands: 'Extensive', genie: 'Most', fb: 'Yes, consistently', learn: 'Yes', d: 4 },
    { jobType: 'Install',  areas: ['Panel / Sensors', 'Life Safety', 'Networking', 'Full Systems Test / Job Closeout'], part: 'Fully Independent', shadow: STAFF.sumner, hands: 'Extensive', genie: 'All', fb: 'Yes, consistently', learn: 'Yes', d: 2 },
  ];

  // Deliberately thinner: a second chart state to compare against, and few
  // enough to leave the 10-install / 6-service gate unmet.
  const sparse = [
    { jobType: 'Install', areas: ['Panel / Sensors'],                       part: 'Mostly Observed', shadow: STAFF.narciso, hands: 'Limited', genie: 'None', fb: 'Somewhat',  learn: 'Somewhat', d: 9 },
    { jobType: 'Install', areas: ['Cameras', 'Customer Education'],         part: 'Mostly Observed', shadow: STAFF.narciso, hands: 'Limited', genie: 'None', fb: 'Somewhat',  learn: 'Yes', d: 6 },
    { jobType: 'Service', areas: ['Troubleshooting / Diagnostics'],         part: 'Assisted',        shadow: STAFF.reese,   hands: 'Moderate', genie: 'Some', fb: 'Somewhat', learn: 'Yes', d: 3 },
  ];

  for (const [pro, rows, who] of [
    [PRO.taylor, rich, 'Taylor Daigre'],
    [PRO.tyler, sparse, 'Tyler Livingston'],
  ] as const) {
    for (const r of rows) {
      const rec = await NhWoExperience.create({
        record: {
          employee: [pro],
          personShadowed: [r.shadow],
          jobType: r.jobType,
          experienceAreas: r.areas,
          highestParticipation: r.part,
          handsOnExperience: r.hands,
          techgenieViaWork: r.genie,
          explainedAndProvidedFeedback: r.fb,
          learningOpportunities: r.learn,
          workOrderDate: day(r.d),
        } as never,
      });
      ledger.woExperience.push(rec.id);
      console.log(`wo         ${rec.id}  ${who.padEnd(17)} ${r.jobType} / ${r.part}`);
    }
  }

  ledger.createdAt = new Date().toISOString();
  writeLedger(ledger);
  console.log(
    `\nseeded ${ledger.checkIns.length} check-ins and ${ledger.woExperience.length} work-order rows.\n` +
      'Ledger: scripts/seeded-demo-records.json  (undo with --undo)',
  );
}

async function undo(): Promise<void> {
  const ledger = readLedger();
  const total = ledger.checkIns.length + ledger.woExperience.length;
  if (!total) {
    console.log('Nothing in the ledger to undo.');
    return;
  }

  let removed = 0;
  for (const id of ledger.checkIns) {
    await FsmProgressCheckIn.delete({ id });
    removed++;
  }
  for (const id of ledger.woExperience) {
    await NhWoExperience.delete({ id });
    removed++;
  }

  writeLedger({ createdAt: '', checkIns: [], woExperience: [] });
  console.log(`deleted ${removed} seeded records; ledger cleared.`);
}

const main = process.argv.includes('--undo') ? undo : seed;
main().catch(e => {
  console.error(e);
  process.exit(1);
});
