/**
 * Resolves the one thing the new hire should do next.
 *
 * The doc's interface-style rule is "one clear action button for the tasks
 * currently due", so this returns a single action rather than a list — the
 * ordering below is the precedence, and the first match wins.
 *
 * Deciding this on the server matters for two reasons. The button carries the
 * pro's record id into a prefilled Fillout form, and a client-side decision
 * would mean trusting the browser with which record to prefill. It also keeps
 * the rule in one place instead of spread across card components.
 *
 * Precedence:
 *   0. Nothing, if the pro has left the program (Historical)
 *   1. A reassessment the pro has been assigned and not yet submitted
 *   2. The readiness self-assessment, once due AND once its prerequisites are met
 *   3. Logging a work order, while the experience minimums are unmet
 *   4. Nothing — approved, or waiting on someone else
 *
 * Note the weekly progress check is deliberately absent: per the doc's NH
 * forms table the FSM submits it and the new hire "participates in the
 * conversation", so it is not an action this page can offer.
 */
import { firstString } from './readiness';

export interface NextAction {
  /** Short imperative, e.g. "Log a work order". */
  label: string;
  /** Plain-language reason, shown under the button. */
  because: string;
  /** Absent when the action is informational rather than a form. */
  href: string | null;
  due: string | null;
}

export interface NextActionInput {
  /** Null when the minimums are met — see shortfallText(). */
  woExperienceGate: string | null;
  trainingComplete: string | null;
  selfAssessmentDue: string | null;
  selfAssessmentLink: string | null;
  selfAssessmentScore: number | null;
  /**
   * Whether the self-assessment form's prerequisites are met.
   *
   * Per Austi: the form requires Ethics and Compliance complete, ProStart
   * complete, 10 install work orders and 6 service work orders. `Self
   * Assessment Due` does NOT encode any of that — it returns a date from the
   * program week alone, so it reads "due" for a pro who cannot yet submit.
   * Offering the link anyway sends them to a form they are not eligible for.
   *
   * Derived from the per-family course state rather than `New Hire Training
   * Complete`, because that field also counts a third family (Quarterly
   * Safety Training) which is not one of the two prerequisites.
   */
  selfAssessmentUnlocked: boolean;
  awaitingReassessment: boolean;
  reassessmentForm: string | null;
  reassessmentCategories: string[];
  eventStatus: string | null;
  decision: string | null;
  requiredActions: string | null;
  reassessmentDate: string | null;
  /** Base Fillout URL for the WO Experience form, from WO_EXPERIENCE_FORM_URL. */
  woFormUrl: string | null;
  proRecordId: string;
  /** `New Hire Status`. Historical means the pro has left the program. */
  stage: string | null;
}

export function resolveNextAction(i: NextActionInput): NextAction | null {
  // 0. Out of the program. `WO Experience Gate` keeps reading "10 install, 6
  //    service" forever for someone who never logged any, so without this a
  //    pro who finished months ago is told to go and log a work order. Live on
  //    Mason Boismier (Historical, week 153).
  if (i.stage === 'Historical') return null;

  const approved = i.decision === 'Approved' || i.eventStatus === 'Approved';

  // 1. Assigned a reassessment and it is still outstanding.
  //
  //    Gated on not being approved. Daniel Loan is live evidence that an event
  //    can read `Approved` while `NH Awaiting Reassessment` is still true —
  //    he was approved on round 2 via the Alignment route with a reassessment
  //    outstanding. Telling an approved pro to go and reassess themselves is
  //    worse than saying nothing, so approval wins. The underlying
  //    contradiction is an open question for the Airtable build, not something
  //    this page can resolve.
  if (i.awaitingReassessment && !approved) {
    const categories = i.reassessmentCategories;
    const what = categories.length ? joinWords(categories) : 'part of your self-assessment';

    // No form link means the prefill could not be built — round 1 events carry
    // no reassessment URL. Say who to expect it from rather than rendering a
    // button that goes nowhere.
    if (!i.reassessmentForm) {
      return {
        label: 'A reassessment is coming',
        because: `Your FSM has asked you to re-do ${what}. They will send you the form.`,
        href: null,
        due: i.reassessmentDate,
      };
    }

    return {
      label: 'Complete your reassessment',
      because: `Your FSM has asked you to re-do ${what}.`,
      href: i.reassessmentForm,
      due: i.reassessmentDate,
    };
  }

  // 2. Self-assessment due, prerequisites met, and not yet submitted. A
  //    submitted assessment has a score; the date alone does not prove
  //    submission, since `Self Assessment Due` keeps returning a date after
  //    the form is in.
  //
  //    `selfAssessmentUnlocked` must be checked here and not left to fall
  //    through: this step sits ABOVE the work-order gate, so without it a pro
  //    with 3 of the 16 required work orders was handed the self-assessment
  //    link instead of being told to log work orders. Live on Tyler
  //    Livingston at 2 install / 1 service.
  if (!approved && i.selfAssessmentDue && i.selfAssessmentUnlocked && i.selfAssessmentScore === null) {
    return {
      label: 'Complete your readiness self-assessment',
      because: 'You have reached the point in the program where you rate your own confidence.',
      href: i.selfAssessmentLink,
      due: i.selfAssessmentDue,
    };
  }

  // 3. Work-order minimums unmet. The gate text names what is missing.
  if (!approved && i.woExperienceGate) {
    return {
      label: 'Log a work order',
      because: `You still need ${i.woExperienceGate} work orders logged.`,
      href: woFormHref(i.woFormUrl, i.proRecordId),
      due: null,
    };
  }

  // 4. In remediation with no form outstanding — the actions are the FSM's to
  //    arrange, so this is informational.
  if (!approved && (i.decision === 'Training Required' || i.eventStatus === 'Training Required')) {
    return {
      label: 'Work through your development plan',
      because: i.requiredActions || 'Your FSM has set out additional training before your reassessment.',
      href: null,
      due: i.reassessmentDate,
    };
  }

  // 5. Courses outstanding but nothing else due.
  if (!approved && i.trainingComplete && i.trainingComplete !== 'Complete') {
    return {
      label: 'Finish your required courses',
      because: 'Your required learning has to be complete before a readiness decision can be made.',
      href: null,
      due: null,
    };
  }

  return null;
}

/**
 * The WO form link.
 *
 * Unlike the self-assessment, EML carries no prefilled-link formula for this
 * form, so the base URL comes from the environment. Returns null when it is
 * unset rather than rendering a dead button.
 */
function woFormHref(base: string | null, proRecordId: string): string | null {
  if (!base) return null;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}pro=${encodeURIComponent(proRecordId)}`;
}

/** "a, b and c" */
function joinWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Narrow helper so callers can pass raw Airtable values. */
export function asText(v: unknown): string | null {
  return firstString(v);
}
