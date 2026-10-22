# nh-readiness-portal

The New Hire **"My Readiness"** page for the New Hire Readiness program —
a mobile-first web app over Airtable base `app3hcKv9U98zhjNt`.

Built as an app rather than an Airtable interface for two reasons:

1. **Three of the doc's four "My field experience" requirements are group-bys**
   (job-type distribution, trainer tallies, latest weekly focus). In Airtable
   each bucket needs its own rollup field on `Field Ops EML 2.0`; here they are
   one table read and four reduces.
2. **§9 of the governance doc requires record-level permissions.** Server-side
   authorization enforces "Own"; an interface filter only scopes what renders.

---

## Status

| Area | State |
|---|---|
| Airtable layer, schema generator | Done |
| Identity gate (`WORK_EMAIL`) | Done, verified against live data |
| `getMyReadiness`, `getMyFieldExperience` | Done, smoke-tested across 6 identities |
| My Progress + My Field Experience UI | Done, rendered and checked in-browser |
| Single due-action button | Done |
| Edge states (no event, no WOs, Historical, no record) | Done |
| **Authentication** | **Not wired up — uses a dev stand-in. See below.** |
| Deploy | Blocked on authentication |

---

## Setup

```bash
cp .env.example .env     # then fill in AIRTABLE_API_KEY and DEV_USER_EMAIL
npm install
npm run schema:generate  # regenerate if the base changes
npm run dev
```

`DEV_USER_EMAIL` must be an address present in `Field Ops EML 2.0.WORK_EMAIL`,
otherwise every request returns `FORBIDDEN`. Useful identities are listed in
`.env.example`.

`DEV_USER_RECORD_ID` is an alternative that takes an EML record id and skips
the email join. It exists because the pro with the most complete data — Ivan
Cervantes, `rec1tjfPVPaCgavl8` — has `WORK_EMAIL = "IVAN.CERVANTES"` with no
domain, so he is unreachable by email. His address is Workday-sourced, so
editing it in Airtable would likely be overwritten by the next sync. It wins
over `DEV_USER_EMAIL` when both are set, and is unreachable in production
because `getSession()` throws there first.

```bash
npm run auth:check                      # samples a real pro + the refusal cases
npm run auth:check someone@vivint.com   # check specific addresses
npm run smoke                           # both endpoints across 6 edge identities
npm run smoke someone@vivint.com        # one specific pro
npm run email:match                     # how many pros could sign in at all
```

---

## Wiring up Magistrate

Authentication is isolated behind one file, [`server/lib/session.ts`](server/lib/session.ts),
which currently reads `DEV_USER_EMAIL` and **throws in production** so a
deployed build cannot accidentally serve one pro's record to everyone.

Five steps, in order:

1. **Install the package** (needs `NPM_AUTH_TOKEN` in `.env` — the `preinstall`
   script writes `.npmrc` from it):
   ```bash
   npm install @FO-Enablement-Vivint/magistrate
   ```
2. **Add the sign-in route** `app/magistrate-auth/page.tsx`:
   ```tsx
   import AuthenticationPage from '@FO-Enablement-Vivint/magistrate/next';
   export default function Page() { return <AuthenticationPage /> }
   ```
3. **Wrap the tree** in `app/page.tsx` with Magistrate's `SessionProvider`.
4. **Replace the body of `getSession()`** in `server/lib/session.ts` — the
   exact replacement is written out in that file's header comment. Nothing
   downstream changes: the `Session` shape is already the subset of
   Magistrate's session this app uses.
5. **Make a 401 redirect** to `/magistrate-auth` in
   [`src/lib/api.ts`](src/lib/api.ts), which currently surfaces it as text
   (correct for the dev stand-in, wrong once a login page exists).

`next.config.ts` already carries the Turbopack `resolveAlias` for
`next/navigation.js` that Magistrate ≥ 1.0.6 needs — without it API routes fail
to build. That was found the hard way on `shx-lead-tracker`.

**Inherited limitations, accepted deliberately (2026-10-22):** Magistrate
sessions are fixed at 8 hours and it ships no logout control. The mitigating
factor here is that a session only ever exposes the signed-in pro's own record.
At ~306 in-training pros on field devices this is a larger exposure than it was
on SHX, and it is logged rather than fixed.

---

## Access model

The doc's §9 matrix for the NH role:

| Data | NH |
|---|---|
| WO Forms | Own |
| NH Self-Assessment | Own |
| FSM Assessment | **No** |
| RM Audit | **No** |
| Calibration Results | **No** |

Enforced by **not fetching** restricted fields:
[`getMyReadiness.ts`](server/api/getMyReadiness.ts) passes an explicit `fields`
projection to Airtable, so `FSM Overall Score`, `Confidence Gap`,
`RM Review *`, `Eligibility Exception`, `Decision Reason`, `Link Check` and
every `Calibration *` field never enter the process. Adding a field to
`EVENT_FIELDS` is an access decision, not a UI tweak.

One interpretation is flagged in that file: the doc asks this page to show the
"manager readiness check", read here as the **status** of the FSM's assessment
and not its contents.

The weekly check-in is handled the same way — only the forward-looking focus
fields the requirement names are read, not the FSM's readiness concerns,
confidence rating or rating explanation. §9 does not list the check-in, so the
conservative reading was taken. **Widening this is Austi's call.**

---

## Things found in the live data while building

Carried here so they are not rediscovered.

- **The participation ladder in the base is five rungs, not the doc's four, and
  the labels are different.** The doc says "observed, assisted, completed
  independently, led"; `Highest Participation` actually offers Mostly Observed
  / Assisted / Completed Several Tasks Independently / Led Large Portions of
  the Work / Fully Independent. A ladder hardcoded from the doc's wording
  matched nothing and silently dropped 13 of Ivan Cervantes' 16 work orders.
  The rungs are now derived from the records and ordered by the base's own
  `Participation Rank`, so renaming an option cannot break it.
- **`Days In Training` goes negative before the hire date.** An `EMP_STATUS =
  Hired Not Started` pro reads "day -5". `Current Program Week` clamps at 1 and
  so hides the same condition. The page shows "Starting soon" instead.
- **The `FSM Progress Check-in` table is empty — 0 rows.** "Focus for this week
  (from previous week's progress check)" is a named interface requirement that
  therefore cannot populate for anyone, and the card reads "Not set yet" for
  every pro. The code path is written but **untested against real data.**
- **Only 2 pros in the whole base have any WO records** (32 rows total), and
  only one of those two has the experience-area, person-shadowed and
  participation fields filled in. The whole "My field experience" section is
  running on a sample of one.
- **Whole-table work-email health: 6,810 EML rows, 5 unusable.** Four are
  terminated or test records; the fifth is Ivan Cervantes. The earlier
  "305 of 306" figure was the `EMP_STATUS = Training` slice only.
- **`WO Experience Gate` reads `"None"`, not blank, when the minimums are met.**
  Verified across all 306 in-training pros: 305 read `"10 install, 6 service"`,
  one reads `"None"`. The obvious test (non-empty means a shortfall) marks the
  one pro who HAS met the minimums as still owing everything. Handled by
  `shortfallText()`. **This contradicts the project note saying the field
  "blanks when met".**
- **`Required Course (DTH)` and `Required Course (FS)` are lookups of
  CHECKBOXES**, so they read `[true]` — they say whether an outstanding course
  is required in that zone, not which course it is. The titles live in the
  `Required Courses` table behind the `COURSE_NAMES` link.
- **A third course family exists that governance §1 does not name.** §1
  requires "Ethics and Compliance" and "ProStart". Real outstanding courses
  also include `FO | Quarterly Safety Training | …` (live on Caylen Dozier), so
  the page carries an "Other required courses" card. Worth raising: if Quarterly
  Safety Training gates readiness, §1 is incomplete; if it does not, it should
  not be in `COURSES_LEFT`, which `New Hire Training Complete` reads.
- **`Current Program Week` does not clamp, and it is now user-facing.** Caylen
  Dozier reads **Week 44 · day 305** while still `EMP_STATUS = Training`. This
  is the existing "nothing ends a check-in cycle / 107 of 300 Training records
  past day 84" open question, except it is no longer only a comms problem — a
  third of pros will open their own page and see an absurd week number. The
  page renders it faithfully rather than hiding it; **the fix is upstream and it
  is a decision, not a bug.** (`Milestone` clamps at 12; `Current Program Week`
  does not.)
- **A Historical pro is told to log work orders unless you stop them.** The WO
  gate keeps reading "10 install, 6 service" forever for someone who never
  logged any, and `Current Program Week` keeps counting — Mason Boismier reads
  Week 153. The endpoint suppresses the week, the shortfall and the action once
  `New Hire Status` is `Historical`, and the assessment rows read "No record"
  rather than the forward-looking "Not yet due".
- **An event can read `Approved` while `NH Awaiting Reassessment` is true.**
  Live on Daniel Loan. The next-action resolver lets approval win, because
  telling an approved pro to reassess themselves is worse than saying nothing.
  The underlying contradiction is an Airtable-side open question.
- **Cycle-1 events carry no reassessment form URL**, so the action falls back
  to "A reassessment is coming — your FSM will send you the form" rather than a
  button that goes nowhere. Live on Abdullah Hunter.
- **The base mixes raw ISO dates with pre-formatted email twins.**
  `Self Assessment Due` gives `2026-10-21`; `TR Reassessment Date (email)`
  gives `October 30, 2026`. `formatDate()` normalises both, parsing ISO as UTC
  so a negative-offset timezone does not render the previous day.
- **`AVERAGE(values)` over an all-blank set returns the string `NaN`.** Three
  EML rollups are live with this. `cleanNumber()` maps it to null here, but the
  Airtable-side fix is still outstanding.
- **Taylor Daigre's 16 WOs have no `Person Shadowed` and no `Experience
  Areas`.** The page reports these as "16 forms do not record who you worked
  with" rather than silently bucketing them as "other pros", which is what
  EML's `% Other Pros` does.
- **Field-key collision:** `FSM WOs` and `% FSM WOs` both reduce to `fsmWos`,
  so the generator emits `fsmWos` and `fsmWos1`. Check the generated schema
  before using either.
- **These four fields do not exist in the base** despite being recorded as
  built: `Participation Trajectory`, `Latest Participation`,
  `First Participation`, `Experience Coverage %`. All are computed server-side
  here instead, so nothing depends on them.

---

## Charts

Four shapes, one per question, all hand-rolled SVG/CSS in
[`src/components/Charts.tsx`](src/components/Charts.tsx). **No charting
library** — recharts or chart.js would be more JavaScript than the rest of the
app combined, on a page whose stated requirement is mobile-first with limited
scrolling.

| Section | Shape | Why |
|---|---|---|
| Work orders logged | Donut | Part-to-whole over four job types; the doc asks for "counts and **distribution**" |
| Experience areas | Ranked bars | Eight long labels and an uneven spread (Networking 15 vs Customer Education 1) — the imbalance is the signal |
| Participation | Ladder | An ordered progression, not a ranking. Filled rung = current, ringed rung = best ever, because EML's high-water mark alone cannot show a regression |
| Who you trained with | Proportion bar | §7 asks for FSM involvement "compared with other Pros" — a ratio question |

Every chart labels its counts, so none relies on the reader estimating an
angle or an area. The donut draws slices as dashed circles rather than arc
paths, which avoids the large-arc-flag break at exactly 50%.

---

## Still needed

- Whether the page may show the FSM's weekly-check-in concerns (Austi).
- Whether `FO | Quarterly Safety Training` courses should gate readiness, since
  they count towards `COURSES_LEFT` but are not in governance §1 (Austi).
- An upstream answer on stale `EMP_STATUS`, now that program week is shown to
  the pro directly.
- One real Magistrate sign-in compared against `npm run email:match`, to prove
  SSO issues the same address as `WORK_EMAIL`. 305 of 306 pros are matchable on
  the Airtable side; the SSO side is unproven.

---

## Layout

```
app/
  layout.tsx                 html/body, globals.css
  page.tsx                   renders <MyReadiness />
  api/[name]/route.ts        POST /api/<name>, Zod-validated, gate applied once
server/
  lib/session.ts             THE auth seam — swap this for Magistrate
  lib/eml.ts                 identity gate: session email -> one EML record
  lib/readiness.ts           lookup-array, NaN, "None" and date normalisers
  lib/nextAction.ts          single due-action precedence
  lib/airtable.ts            REST adapter, ported from shx-lead-tracker
  airtable/schema.generated.ts   GENERATED — npm run schema:generate
  api/getMyReadiness.ts      My progress + next action
  api/getMyFieldExperience.ts    aggregations Airtable cannot do per-pro
src/
  MyReadiness.tsx            the page
  components/                Cards, StageRail, ActionBar
  lib/api.ts                 typed client, inferred from the endpoints
scripts/
  generate-airtable-schema.ts
  check-eml-gate.ts          npm run auth:check
  check-email-match-rate.ts  npm run email:match
  smoke.ts                   npm run smoke
```
