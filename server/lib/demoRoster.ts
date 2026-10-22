/**
 * The demo roster: every pro in the base who has a readiness event.
 *
 * ----------------------------------------------------------------------------
 * TEMPORARY — DELETE BEFORE GO-LIVE. See src/components/PreviewAs.tsx for the
 * full removal list. This file exists only to populate the "Preview as" box.
 * ----------------------------------------------------------------------------
 *
 * Two deliberate choices:
 *
 * 1. It refuses to run in production. The box it feeds is an auth bypass, so
 *    the guard lives here as well as in the component and in session.ts —
 *    three independent refusals rather than one.
 *
 * 2. It reports *facts* (stage, courses left, work-order gate, event status)
 *    and not the resolved action. Deriving "demonstrates: log a work order"
 *    here would duplicate the precedence in server/lib/nextAction.ts, and a
 *    second copy would drift from the first. The page is the only thing that
 *    decides what the action is; this list just says what is true of the pro.
 */
import { env } from './env';
import { FieldOpsEml20, ReadinessEvent } from '../airtable/index';
import { firstString, firstNumber } from './readiness';

export interface RosterEntry {
  /** `Field Ops EML 2.0` record id — what the preview cookie carries. */
  recordId: string;
  name: string;
  stage: string | null;
  empStatus: string | null;
  /** Distinct event statuses across the pro's cycles, newest cycle first. */
  eventStatuses: string[];
  coursesLeft: number | null;
  /** Null once the install/service minimums are met. */
  woGate: string | null;
  selfAssessmentDue: string | null;
  programWeek: number | null;
}

export async function loadDemoRoster(): Promise<RosterEntry[]> {
  if (env.isProd) return [];

  // Events first: the roster is "pros with something to show", and a pro with
  // no event has no readiness state worth switching to.
  const events = await ReadinessEvent.findAll({
    fields: ['newHire', 'eventStatus', 'cycle'],
    limit: 100,
  });

  const byPro = new Map<string, Array<{ status: string | null; cycle: number | null }>>();
  for (const e of events.records) {
    const proId = firstString(e.newHire);
    if (!proId) continue;
    const list = byPro.get(proId) ?? [];
    list.push({ status: firstString(e.eventStatus), cycle: firstNumber(e.cycle) });
    byPro.set(proId, list);
  }

  const ids = [...byPro.keys()];
  if (!ids.length) return [];

  const pros = await FieldOpsEml20.findAll({
    filters: { id: { in: ids } },
    fields: [
      'preferredFullName',
      'legalFullName',
      'newHireStatus',
      'empStatus',
      'coursesLeft',
      'woExperienceGate',
      'selfAssessmentDue',
      'currentProgramWeek',
    ],
    limit: 100,
  });

  const entries: RosterEntry[] = pros.records.map(p => {
    const cycles = (byPro.get(p.id) ?? []).sort((a, b) => (b.cycle ?? 0) - (a.cycle ?? 0));
    const statuses: string[] = [];
    for (const c of cycles) {
      if (c.status && !statuses.includes(c.status)) statuses.push(c.status);
    }

    const gate = firstString(p.woExperienceGate);

    return {
      recordId: p.id,
      name: firstString(p.preferredFullName) || firstString(p.legalFullName) || p.id,
      stage: firstString(p.newHireStatus),
      empStatus: firstString(p.empStatus),
      eventStatuses: statuses,
      coursesLeft: firstNumber(p.coursesLeft),
      // `WO Experience Gate` reads the string "None" when the minimums are met
      // rather than going blank — verified across 306 pros. Normalise it here
      // so the box does not display "None" as if it were a shortfall.
      woGate: gate && !/^(none|n\/a)$/i.test(gate) ? gate : null,
      selfAssessmentDue: firstString(p.selfAssessmentDue),
      programWeek: firstNumber(p.currentProgramWeek),
    };
  });

  // Most interesting first: furthest through the program, then by name, so
  // the order is stable between reloads during a demo.
  return entries.sort((a, b) => (b.programWeek ?? 0) - (a.programWeek ?? 0) || a.name.localeCompare(b.name));
}
