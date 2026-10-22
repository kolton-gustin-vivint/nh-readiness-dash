/**
 * getMyReadiness — the "My progress" half of the New Hire page.
 *
 * ── Access ─────────────────────────────────────────────────────────────────
 * The governance doc's §9 matrix gives the NH role `No` on FSM Assessment,
 * RM Audit and Calibration Results. Rather than fetch the event record and
 * omit those fields on the way out, this passes an explicit `fields`
 * projection to Airtable, so restricted values never enter the process at
 * all. Adding a field to `EVENT_FIELDS` is therefore a deliberate access
 * decision, not a UI tweak.
 *
 * Deliberately NOT fetched: fsmOverallScore, fsmReadinessResult,
 * confidenceGap, rmReviewRequired, rmReviewReasons, rmReviewStatus, rmAudits,
 * auditNotReadyReason, approvalRoute, decisionReason, linkCheck,
 * eligibilityException, and every calibration* field.
 *
 * One interpretation is flagged: the doc asks this page to show the "manager
 * readiness check", which is read here as the *status* of the FSM's assessment
 * (sent / submitted / outstanding) and not its contents. Status answers "what
 * happens next before I can work independently"; contents are the thing §9
 * withholds.
 */
import { z } from 'zod';
import { createEndpoint } from '../lib/endpoint';
import { ReadinessEvent, Licensing, FsmProgressCheckIn, RequiredCourses } from '../airtable/index';
import { cleanNumber, firstNumber, firstString, formatDate, shortfallText, stringList, toStage } from '../lib/readiness';
import { resolveNextAction } from '../lib/nextAction';

/**
 * The only Readiness Event fields this app may read. Keys, not Airtable names
 * — the adapter maps them and throws on an unknown key.
 */
const EVENT_FIELDS = [
  'eventStatus',
  'readinessDecision',
  'cycle',
  'cycleLabel',
  'eventOpen',
  'nhOverallScore',
  'trDevelopmentFocus',
  'trRequiredActions',
  'trReassessmentDateEmail',
  'readinessApproved',
  'nhAwaitingReassessment',
  'nhCategoriesAssigned',
  'nhReassessmentForm',
] as const;

const licenceSchema = z.object({
  name: z.string().nullable(),
  state: z.string().nullable(),
  status: z.string().nullable(),
  expires: z.string().nullable(),
});

const courseGroupSchema = z.object({
  complete: z.boolean(),
  outstanding: z.array(z.string()),
});

const outputSchema = z.object({
  name: z.string().nullable(),
  programWeek: z.string().nullable(),
  daysInTraining: z.number().nullable(),
  stage: z.object({ label: z.string(), index: z.number().nullable() }),
  /** True once the pro has left the programme, so the UI stops nagging them. */
  finished: z.boolean(),
  /** True before the hire date, when week and day counts are not yet meaningful. */
  notStarted: z.boolean(),

  licensing: z.array(licenceSchema),

  courses: z.object({
    trainingComplete: z.string().nullable(),
    coursesLeft: z.number().nullable(),
    /** The doc names these as two separate requirements. */
    ethics: courseGroupSchema,
    prostart: courseGroupSchema,
    /** Anything whose title matches neither family prefix. */
    other: z.array(z.string()),
  }),

  assessments: z.object({
    selfAssessmentDue: z.string().nullable(),
    selfAssessmentLink: z.string().nullable(),
    selfAssessmentScore: z.number().nullable(),
    fsmAssessmentStatus: z.string().nullable(),
    fsmAssessmentDue: z.string().nullable(),
  }),

  workOrders: z.object({
    install: z.number().nullable(),
    service: z.number().nullable(),
    total: z.number().nullable(),
    shortfall: z.string().nullable(),
  }),

  focusThisWeek: z
    .object({
      checkInDate: z.string().nullable(),
      milestone: z.string().nullable(),
      focus: z.string().nullable(),
      action: z.string().nullable(),
      targetDate: z.string().nullable(),
    })
    .nullable(),

  remediation: z
    .object({
      developmentFocus: z.string().nullable(),
      requiredActions: z.string().nullable(),
      reassessmentDate: z.string().nullable(),
      categoriesAssigned: z.array(z.string()),
    })
    .nullable(),

  event: z
    .object({
      status: z.string().nullable(),
      decision: z.string().nullable(),
      cycle: z.number().nullable(),
      label: z.string().nullable(),
      awaitingReassessment: z.boolean(),
    })
    .nullable(),

  nextAction: z
    .object({
      label: z.string(),
      because: z.string(),
      href: z.string().nullable(),
      due: z.string().nullable(),
    })
    .nullable(),
});

export default createEndpoint({
  description: "The signed-in new hire's own readiness progress",
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema,
  execute: async ({ context }) => {
    const me = context.user;

    // Links already on the EML row, so no inverse lookup round trip is needed.
    const eventIds = stringList(me.readinessEventsAsNewHire);
    const licenceIds = stringList(me.licensing);
    const checkInIds = stringList(me.checkInsAsNewHire);
    const courseIds = stringList(me.courseNames);

    const [event, licences, checkIn, courses] = await Promise.all([
      latestEvent(eventIds),
      licenceRows(licenceIds),
      latestCheckIn(checkInIds),
      outstandingCourses(courseIds),
    ]);

    const decision = firstString(event?.readinessDecision);
    const isTrainingRequired = decision === 'Training Required' || firstString(event?.eventStatus) === 'Training Required';

    const selfAssessmentScore = firstNumber(event?.nhOverallScore);
    const awaitingReassessment = Boolean(firstString(event?.nhAwaitingReassessment));
    const trainingComplete = firstString(me.newHireTrainingComplete);
    // Null once the minimums are met. The field reads "None", not blank.
    const woShortfall = shortfallText(me.woExperienceGate);
    const requiredActions = firstString(event?.trRequiredActions);
    const reassessmentDate = formatDate(event?.trReassessmentDateEmail);
    const selfAssessmentDue = formatDate(me.selfAssessmentDue);
    const stage = toStage(me.newHireStatus);
    const finished = stage.label === 'Historical';
    // `Days In Training` counts from HIRE_DATE, so a pro whose start date is in
    // the future reads a negative number — live on an `EMP_STATUS = Hired Not
    // Started` record showing "day -5". `Current Program Week` clamps at 1 and
    // so hides the same condition.
    const days = cleanNumber(me.daysInTraining);
    const notStarted = days !== null && days < 0;

    const nextAction = resolveNextAction({
      woExperienceGate: woShortfall,
      trainingComplete,
      selfAssessmentDue,
      selfAssessmentLink: firstString(me.nhSelfAssessmentLink),
      selfAssessmentScore,
      awaitingReassessment,
      reassessmentForm: firstString(event?.nhReassessmentForm),
      reassessmentCategories: stringList(event?.nhCategoriesAssigned),
      eventStatus: firstString(event?.eventStatus),
      decision,
      requiredActions,
      reassessmentDate,
      woFormUrl: process.env.WO_EXPERIENCE_FORM_URL || null,
      proRecordId: me.id,
      stage: stage.label,
    });

    return {
      name: firstString(me.preferredFullName) || firstString(me.legalFullName),
      // Programme week and days-in-training are meaningless once someone has
      // left the programme: `Current Program Week` just keeps counting from
      // the hire date, so a Historical pro reads "Week 153". They are equally
      // meaningless before the start date.
      programWeek: finished || notStarted ? null : programWeek(me.currentProgramWeek),
      daysInTraining: finished || notStarted ? null : days,
      stage,
      finished,
      notStarted,

      licensing: licences,

      courses: {
        trainingComplete,
        coursesLeft: cleanNumber(me.coursesLeft),
        ...courses,
      },

      assessments: {
        selfAssessmentDue,
        selfAssessmentLink: firstString(me.nhSelfAssessmentLink),
        selfAssessmentScore,
        fsmAssessmentStatus: firstString(me.fsmAssessmentStatus),
        fsmAssessmentDue: formatDate(me.fsmAssessmentDue),
      },

      workOrders: {
        install: cleanNumber(me.installWosComplete),
        service: cleanNumber(me.serviceWosComplete),
        total: cleanNumber(me.totalWos),
        // Null once the minimums are met. Also suppressed for a pro who has
        // left the programme, where the gate keeps reporting a shortfall
        // against minimums that no longer apply to them.
        shortfall: finished ? null : woShortfall,
      },

      focusThisWeek: checkIn,

      remediation: isTrainingRequired
        ? {
            developmentFocus: firstString(event?.trDevelopmentFocus),
            requiredActions,
            reassessmentDate,
            categoriesAssigned: stringList(event?.nhCategoriesAssigned),
          }
        : null,

      event: event
        ? {
            status: firstString(event.eventStatus),
            decision,
            cycle: cleanNumber(event.cycle),
            label: firstString(event.cycleLabel),
            awaitingReassessment,
          }
        : null,

      nextAction,
    };
  },
});

/**
 * The pro's most recent event.
 *
 * Sorted on `Cycle` descending rather than on a date, because a reassessment
 * opens a new event and the cycle number is the only field guaranteed to
 * order them. A pro with no event at all is a normal state — someone in their
 * first weeks — and returns null rather than erroring.
 */
async function latestEvent(ids: string[]) {
  if (!ids.length) return null;
  const page = await ReadinessEvent.findAll({
    filters: { id: { in: ids } },
    fields: [...EVENT_FIELDS],
    sort: [{ field: 'cycle', direction: 'desc' }],
    limit: 1,
  });
  return page.records[0] ?? null;
}

/**
 * `Current Program Week` is a bare number, so it renders as "3" on its own.
 * Governance §1 talks in programme weeks, and Austi's definition has week 1 as
 * the partial week containing the hire date.
 */
function programWeek(v: unknown): string | null {
  const n = cleanNumber(v);
  if (n !== null) return `Week ${n}`;
  return firstString(v);
}

/**
 * The pro's outstanding required courses, split into the two families
 * governance §1 names separately: "Ethics and Compliance" and "ProStart".
 *
 * `COURSE_NAMES` is a link field, so it carries record ids and has to be
 * resolved through `Required Courses` to get titles. The two EML lookups that
 * look like they would help — `Required Course (DTH)` and `Required Course
 * (FS)` — are lookups of CHECKBOXES and read `[true]`; they say whether an
 * outstanding course is required in that zone, not which course it is.
 *
 * The split is by title prefix, because the base has no family field. That is
 * a real limitation: a course titled neither way lands in `other` and is
 * counted against neither family. It does at least make the §1 question
 * ("does `New Hire Training Complete` cover both course families?") answerable
 * from the data, which it was not before.
 */
async function outstandingCourses(ids: string[]) {
  const empty = {
    ethics: { complete: true, outstanding: [] as string[] },
    prostart: { complete: true, outstanding: [] as string[] },
    other: [] as string[],
  };
  if (!ids.length) return empty;

  const page = await RequiredCourses.findAll({
    filters: { id: { in: ids } },
    fields: ['name'],
    limit: 100,
  });

  const titles = page.records.map(r => firstString(r.name)).filter((t): t is string => Boolean(t));

  const ethics = titles.filter(t => /^ethics\b/i.test(t));
  const prostart = titles.filter(t => /^prostart\b/i.test(t));
  const other = titles.filter(t => !/^(ethics|prostart)\b/i.test(t));

  return {
    ethics: { complete: ethics.length === 0, outstanding: ethics },
    prostart: { complete: prostart.length === 0, outstanding: prostart },
    other,
  };
}

async function licenceRows(ids: string[]) {  if (!ids.length) return [];
  const page = await Licensing.findAll({
    filters: { id: { in: ids } },
    fields: ['licenseName', 'licenseStateAbbr', 'licenseStatusC', 'expirationDateC'],
    limit: 100,
  });
  return page.records.map(r => ({
    name: firstString(r.licenseName),
    state: firstString(r.licenseStateAbbr),
    status: firstString(r.licenseStatusC),
    expires: formatDate(r.expirationDateC),
  }));
}

/**
 * "Focus for this week (from previous week's progress check)".
 *
 * The FSM submits this form, and it also carries their candid readiness
 * concerns, confidence rating and rating explanation. §9 does not list the
 * check-in in its matrix, so the conservative reading is taken: only the
 * forward-looking focus fields the interface requirement names are read, and
 * the FSM's assessment of the pro is not. Widening this is a programme
 * decision for Austi, not a layout one.
 */
async function latestCheckIn(ids: string[]) {
  if (!ids.length) return null;
  const page = await FsmProgressCheckIn.findAll({
    filters: { id: { in: ids } },
    fields: [
      'checkInDate',
      'checkInMilestone',
      'primaryFocusBeforeNextCheckIn',
      'otherPrimaryFocus',
      'focusAction',
      'focusTargetDate',
    ],
    sort: [{ field: 'checkInDate', direction: 'desc' }],
    limit: 1,
  });
  const row = page.records[0];
  if (!row) return null;

  const named = firstString(row.primaryFocusBeforeNextCheckIn);
  return {
    checkInDate: formatDate(row.checkInDate),
    milestone: firstString(row.checkInMilestone),
    // "Other" is a select option backed by a free-text twin; show the text.
    focus: named === 'Other' ? firstString(row.otherPrimaryFocus) || named : named,
    action: firstString(row.focusAction),
    targetDate: formatDate(row.focusTargetDate),
  };
}
