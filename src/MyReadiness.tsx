'use client';

/**
 * My Readiness — the whole New Hire page.
 *
 * Both sections come from the doc's NH interface requirements:
 *
 *   My progress          licensing, Ethics and Compliance, ProStart / final
 *                        assessment / manager readiness check, install and
 *                        service WO counts against minimums, overall readiness
 *                        stage and next required action(s), focus for this week
 *   My field experience  job-type counts and distribution, experience areas,
 *                        participation trend, who the pro has trained with
 *
 * The page shows no FSM scores, no confidence gap, no audit data and no
 * calibration metrics. That is §9 of the governance doc, not a layout choice,
 * and it is enforced server-side — those fields are never fetched.
 */
import { useEffect, useState } from 'react';
import {
  getMyFieldExperience,
  getMyReadiness,
  ApiClientError,
  type GetMyFieldExperienceOutputType,
  type GetMyReadinessOutputType,
} from '@/lib/api';
import { Card, CountList, EMPTY, SectionHeading, StatusCard } from '@/components/Cards';
import { Donut, Ladder, ProportionBar } from '@/components/Charts';
import StageRail from '@/components/StageRail';
import ActionBar from '@/components/ActionBar';

type Readiness = GetMyReadinessOutputType;
type Experience = GetMyFieldExperienceOutputType;

export default function MyReadiness() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [experienceFailed, setExperienceFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Independent: a failure in field experience must not take the whole
        // page down with it. Readiness failing is still fatal — it carries the
        // identity gate and the next action.
        const [r, e] = await Promise.allSettled([getMyReadiness({}), getMyFieldExperience({})]);
        if (cancelled) return;
        if (r.status === 'rejected') throw r.reason;
        setReadiness(r.value);
        if (e.status === 'fulfilled') setExperience(e.value);
        else setExperienceFailed(true);
      } catch (err) {
        if (cancelled) return;
        // A 401 (no session) and a 403 (session with no matching EML record)
        // both get shown as text. The empty-page failure mode is the specific
        // thing this app exists to avoid.
        setError(err instanceof ApiClientError ? err.message : 'Something went wrong loading your readiness.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Shell><p className="card-note px-1">Loading your readiness…</p></Shell>;
  if (error) return <Shell><Card><p className="text-sm leading-relaxed text-slate-700">{error}</p></Card></Shell>;
  if (!readiness) return null;

  return (
    <Shell>
      <header className="px-1 pt-1">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{readiness.name || 'My Readiness'}</h1>
        {readiness.finished || readiness.notStarted ? (
          <p className="text-sm text-slate-500">{readiness.finished ? 'Training complete' : 'Starting soon'}</p>
        ) : null}
      </header>

      <StageRail label={readiness.stage.label} index={readiness.stage.index} />

      <SectionHeading>My progress</SectionHeading>

      <LicensingCard licensing={readiness.licensing} />
      <CoursesCards courses={readiness.courses} />
      <AssessmentsCard
        assessments={readiness.assessments}
        event={readiness.event}
        finished={readiness.finished}
      />
      <WorkOrdersCard workOrders={readiness.workOrders} finished={readiness.finished} />
      {readiness.finished ? null : <FocusCard focus={readiness.focusThisWeek} />}
      {readiness.remediation ? <RemediationCard remediation={readiness.remediation} /> : null}

      {experience ? (
        <>
          <SectionHeading>My field experience</SectionHeading>

          {/* Part-to-whole: the doc asks for job-type "counts and distribution". */}
          <Card>
            <p className="card-label">Work orders logged</p>
            <Donut
              items={experience.jobTypes}
              centerLabel="Work orders by job type"
              centerValue={experience.totalWorkOrders}
              emptyMessage="No work orders logged yet."
            />
          </Card>

          {/* Ranked magnitudes with long labels — bars stay the right shape
              here, and the imbalance between areas is the useful signal. */}
          <Card>
            <p className="card-label">Experience areas</p>
            <p className="card-value">{experience.experienceAreas.length}</p>
            <CountList items={experience.experienceAreas} emptyMessage="No experience areas recorded yet." />
            {experience.missingAreas > 0 ? (
              <p className="card-note">
                {experience.missingAreas} {experience.missingAreas === 1 ? 'work order has' : 'work orders have'} no
                areas selected.
              </p>
            ) : null}
          </Card>

          <ParticipationCard participation={experience.participation} />

          {/* A ratio, not a ranking: §7 asks how much training was with the FSM
              compared with other Pros. */}
          <Card>
            <p className="card-label">Who you have trained with</p>
            <ProportionBar
              items={experience.trainedWith}
              emptyMessage="No trainers recorded yet."
              footnote={
                experience.unattributed > 0
                  ? `${experience.unattributed} ${
                      experience.unattributed === 1 ? 'work order does' : 'work orders do'
                    } not record who you worked with, so ${
                      experience.unattributed === 1 ? 'it is' : 'they are'
                    } not counted here.`
                  : undefined
              }
            />
          </Card>
        </>
      ) : experienceFailed ? (
        <>
          <SectionHeading>My field experience</SectionHeading>
          <Card>
            <p className="text-sm leading-relaxed text-slate-700">
              Your field experience could not be loaded right now. The rest of this page is up to date — try again shortly.
            </p>
          </Card>
        </>
      ) : null}

      <ActionBar action={readiness.nextAction} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-page flex-col gap-3 p-3">
      {children}
      <div className="h-2" />
    </main>
  );
}

function LicensingCard({ licensing }: { licensing: Readiness['licensing'] }) {
  if (!licensing.length) {
    // Governance: "Licensing is not a requirement, as we don't want to delay
    // assessing readiness." So this is deliberately neutral and final — no
    // "yet", which reads as something the pro is waiting on. Licensing is
    // intentionally absent from nextAction.ts and readiness.ts for the same
    // reason: it must never produce a due action or hold back a decision.
    return (
      <StatusCard
        label="Licensing"
        value="Not on file"
        note="No licence on record. This does not affect your readiness."
      />
    );
  }

  // Any non-active licence is the headline, because that is the one that
  // blocks. "Active" is only meaningful when it is true of all of them.
  const problem = licensing.find(l => (l.status || '').toLowerCase() !== 'active');
  return (
    <StatusCard
      label="Licensing"
      value={problem ? problem.status || 'Needs attention' : 'Active'}
      tone={problem ? 'warn' : 'good'}
      note={
        licensing.length === 1
          ? [licensing[0].name, licensing[0].state].filter(Boolean).join(' · ')
          : `${licensing.length} licences on file`
      }
    >
      <ul className="mt-2 space-y-1">
        {licensing.map((l, i) => (
          <li key={`${l.name}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-slate-700">{[l.name, l.state].filter(Boolean).join(' · ') || EMPTY}</span>
            <span className="text-slate-500">{l.expires ? `exp ${l.expires}` : l.status || EMPTY}</span>
          </li>
        ))}
      </ul>
    </StatusCard>
  );
}

/**
 * Ethics and Compliance, and ProStart.
 *
 * Two cards because governance §1 names them as two separate requirements and
 * the doc's interface list has them as two separate bullets. The base has no
 * course-family field, so the split is by title prefix — a course titled
 * neither way shows under "Other required courses" rather than being hidden.
 */
function CoursesCards({ courses }: { courses: Readiness['courses'] }) {
  return (
    <>
      <CourseGroupCard label="Ethics and Compliance" group={courses.ethics} />
      <CourseGroupCard label="ProStart" group={courses.prostart} />
      {courses.other.length ? (
        <StatusCard
          label="Other required courses"
          value={`${courses.other.length} outstanding`}
          tone="warn"
        >
          <CourseList titles={courses.other} />
        </StatusCard>
      ) : null}
    </>
  );
}

function CourseGroupCard({
  label,
  group,
}: {
  label: string;
  group: { complete?: boolean; outstanding?: string[] };
}) {
  const outstanding = group.outstanding ?? [];
  const complete = outstanding.length === 0;
  return (
    <StatusCard
      label={label}
      value={complete ? 'Complete' : `${outstanding.length} outstanding`}
      tone={complete ? 'good' : 'warn'}
    >
      {complete ? null : <CourseList titles={outstanding} />}
    </StatusCard>
  );
}

function CourseList({ titles }: { titles: string[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {titles.map((t, i) => (
        <li key={`${t}-${i}`} className="text-sm leading-snug text-slate-700">
          {/* Titles are pipe-delimited paths, e.g. "Ethics | New Hire | Records
              Management". The leading family is already the card heading, so
              only the remainder is shown. */}
          {t.split('|').slice(1).join(' · ').trim() || t}
        </li>
      ))}
    </ul>
  );
}

function AssessmentsCard({
  assessments,
  event,
  finished,
}: {
  assessments: Readiness['assessments'];
  event: Readiness['event'];
  finished: boolean;
}) {
  const submitted = assessments.selfAssessmentScore !== null;

  // These mirror the base. `FSM Assessment Status` and `Self Assessment Sent`
  // record what was actually dispatched, so the page reports that rather than
  // re-deriving eligibility: a pro holding the email should not be told the
  // form does not exist. Whether the form is *offered* is a separate question,
  // decided by the prerequisite gate in server/lib/nextAction.ts.
  //
  // "Not yet due" is a forward-looking claim, and false for someone who has
  // left the program with no event on file. Observed on a Historical pro.
  const selfValue = submitted ? 'Submitted' : assessments.selfAssessmentDue ? 'Due' : finished ? 'No record' : 'Not yet due';
  const fsmValue = assessments.fsmAssessmentStatus || (finished ? 'No record' : 'Not started');

  return (
    <Card>
      <p className="card-label">Assessments</p>
      <dl className="mt-2 space-y-2 text-sm">
        <Row
          term="Your self-assessment"
          value={selfValue}
          detail={assessments.selfAssessmentDue && !submitted ? `due ${assessments.selfAssessmentDue}` : null}
        />
        {/*
          The FSM's assessment STATUS only. Its contents — scores, readiness
          result, confidence gap — are withheld by §9 and are not fetched.
        */}
        <Row
          term="Manager readiness check"
          value={fsmValue}
          detail={assessments.fsmAssessmentDue ? `due ${assessments.fsmAssessmentDue}` : null}
        />
        {event ? (
          <Row
            term="Current round"
            value={event.label || (event.round !== null ? `Round ${event.round}` : EMPTY)}
            detail={event.status}
          />
        ) : null}
      </dl>
    </Card>
  );
}

function WorkOrdersCard({
  workOrders,
  finished,
}: {
  workOrders: Readiness['workOrders'];
  finished: boolean;
}) {
  // `shortfall` is null once the minimums are met — the endpoint normalises the
  // "None" the Airtable field reads in that case, and suppresses it entirely
  // for a pro who has left the program.
  const met = !workOrders.shortfall;
  return (
    <StatusCard
      label="Work order experience"
      value={finished ? 'Program complete' : met ? 'Minimums met' : 'In progress'}
      tone={finished ? 'neutral' : met ? 'good' : 'info'}
      // Only the shortfall is kept: it is a number the pro has to act on.
      // "Minimums met" and "Program complete" already say it in the value.
      note={finished || met ? undefined : `You still need ${workOrders.shortfall} work orders logged.`}
    >
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Stat label="Install" value={workOrders.install} />
        <Stat label="Service" value={workOrders.service} />
        <Stat label="Total" value={workOrders.total} />
      </dl>
      {workOrders.logHref ? (
        <a
          href={workOrders.logHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block rounded-xl border border-emerald-600 px-3 py-2 text-center text-sm font-medium text-emerald-700 active:bg-emerald-50"
        >
          Log a work order
        </a>
      ) : null}
    </StatusCard>
  );
}

function FocusCard({ focus }: { focus: Readiness['focusThisWeek'] }) {
  if (!focus) {
    return (
      <StatusCard
        label="Focus for this week"
        value="Not set yet"
      />
    );
  }
  return (
    <StatusCard
      label="Focus for this week"
      value={focus.focus || 'Not set'}
      tone="info"
      note={focus.action || undefined}
    >
      <p className="mt-2 text-xs text-slate-500">
        {[focus.milestone, focus.checkInDate ? `check-in ${focus.checkInDate}` : null, focus.targetDate ? `target ${focus.targetDate}` : null]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </StatusCard>
  );
}

function RemediationCard({ remediation }: { remediation: NonNullable<Readiness['remediation']> }) {
  return (
    <StatusCard
      label="Additional training"
      value="Development plan open"
      tone="warn"
      note={remediation.developmentFocus || undefined}
    >
      {remediation.requiredActions ? (
        <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{remediation.requiredActions}</p>
      ) : null}
      {remediation.categoriesAssigned.length ? (
        <p className="mt-2 flex flex-wrap gap-1">
          {remediation.categoriesAssigned.map(c => (
            <span key={c} className="chip bg-amber-100 text-amber-900">
              {c}
            </span>
          ))}
        </p>
      ) : null}
      {remediation.reassessmentDate ? (
        <p className="mt-2 text-xs text-slate-500">Reassessment {remediation.reassessmentDate}</p>
      ) : null}
    </StatusCard>
  );
}

function ParticipationCard({ participation }: { participation: Experience['participation'] }) {
  const TREND: Record<Experience['participation']['trend'], { text: string; tone: 'good' | 'warn' | 'neutral' }> = {
    improving: { text: 'Moving towards working independently.', tone: 'good' },
    steady: { text: 'Holding at the same level as your last work order.', tone: 'neutral' },
    slipped: { text: 'Your last work order was at a lower level than the one before.', tone: 'warn' },
    unknown: { text: 'Not enough work orders logged to show a direction yet.', tone: 'neutral' },
  };
  const t = TREND[participation.trend];

  return (
    <StatusCard
      label="Participation"
      value={participation.latest || 'Not recorded'}
      tone={t.tone === 'neutral' ? 'neutral' : t.tone}
      note={t.text}
    >
      {/* An ordered climb rather than a bar list: the filled rung is where the
          pro is now, the ringed one their best so far. */}
      <Ladder
        items={participation.ladder}
        current={participation.latest}
        best={participation.highest}
        emptyMessage="No participation recorded yet."
      />
      {participation.highest && participation.highest !== participation.latest ? (
        <p className="card-note">Your highest so far: {participation.highest}</p>
      ) : null}
    </StatusCard>
  );
}

function Row({ term, value, detail }: { term: string; value: string; detail?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-600">{term}</dt>
      <dd className="text-right">
        <span className="font-medium text-slate-900">{value}</span>
        {detail ? <span className="block text-xs text-slate-500">{detail}</span> : null}
      </dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl bg-slate-50 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-slate-900">{value ?? EMPTY}</dd>
    </div>
  );
}
