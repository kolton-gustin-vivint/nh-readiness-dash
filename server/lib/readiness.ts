/**
 * Shared readiness helpers.
 *
 * Two recurring hazards in this base are handled here rather than in each
 * endpoint:
 *
 * 1. **Lookup fields arrive as arrays.** `NH Overall Score` on Readiness Event
 *    is a `multipleLookupValues`, so it reads `[88.9]`, not `88.9`. Comparing
 *    one with `=` is the bug that broke `New Hire Status` earlier in this
 *    build — see `first()` / `firstNumber()`.
 *
 * 2. **`AVERAGE(values)` over an all-blank set returns the string `NaN`**, not
 *    a blank. Three EML rollups (`Avg Hands-on`, `Avg TechGenie`,
 *    `Avg Training Quality`) are live with this defect for a pro whose forms
 *    are unanswered. `cleanNumber()` turns `NaN` back into null so the UI
 *    renders an em dash instead of the text "NaN". This is a workaround, not
 *    a fix — the Airtable-side fix is still outstanding.
 */

/** First element of an Airtable lookup/rollup array, or the value itself. */
export function first<T>(v: T | T[] | undefined | null): T | null {
  if (Array.isArray(v)) return v.length ? v[0] : null;
  return v === undefined || v === '' ? null : (v as T);
}

/**
 * Numeric reading of a field that may be a lookup array, a number, a numeric
 * string, or Airtable's literal `NaN`. Returns null for anything unusable so
 * callers never have to test for `NaN` themselves.
 */
export function firstNumber(v: unknown): number | null {
  const raw = Array.isArray(v) ? (v.length ? v[0] : null) : v;
  return cleanNumber(raw);
}

/** Coerces to a finite number, mapping Airtable's `NaN` string and blanks to null. */
export function cleanNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'string' && raw.trim().toLowerCase() === 'nan') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Trimmed string reading of a possibly-array field, or null. */
export function firstString(v: unknown): string | null {
  const raw = Array.isArray(v) ? (v.length ? v[0] : null) : v;
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s === '' ? null : s;
}

/**
 * Boolean reading of a checkbox, or of a lookup/rollup of one.
 *
 * Do NOT use `Boolean(firstString(v))` for these. A lookup of an unchecked
 * checkbox comes back as `[0]` — a non-empty array holding zero — so
 * `firstString` yields the string "0", and `Boolean("0")` is `true`. That
 * inverts the field: every pro whose flag was *off* read as *on*. Observed on
 * `NH Awaiting Reassessment`, where it told pros a reassessment was coming
 * when the flag was 0.
 *
 * Numbers, numeric strings, real booleans and the strings "true"/"false" are
 * all handled; anything unrecognised is false rather than truthy-by-accident.
 */
export function firstFlag(v: unknown): boolean {
  const raw = Array.isArray(v) ? (v.length ? v[0] : null) : v;
  if (raw === null || raw === undefined || raw === '') return false;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;

  const s = String(raw).trim().toLowerCase();
  if (s === '' || s === '0' || s === 'false' || s === 'no') return false;
  if (s === '1' || s === 'true' || s === 'yes' || s === 'checked') return true;

  const n = Number(s);
  return Number.isFinite(n) ? n !== 0 : false;
}

/** Flattens a multi-value field to a clean string array. */
export function stringList(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map(x => String(x).trim()).filter(Boolean);
}

/**
 * `Days In Training` returns `""` for a Historical pro, which makes the field
 * `singleLineText` — so it sorts lexicographically (9 after 28) and arrives as
 * a string. Logged against the Airtable roster too; the structural fix is
 * `BLANK()` instead of `""`.
 */
export const daysInTraining = cleanNumber;

/**
 * `WO Experience Gate` reads `"None"` — not a blank — once the minimums are
 * met. Verified 2026-10-22 across the 306 in-training pros: 305 read
 * "10 install, 6 service" and one reads "None".
 *
 * This matters because the obvious test ("non-empty means a shortfall") marks
 * the one pro who HAS met the minimums as still owing 10 install and 6
 * service. Returns null when the gate is satisfied so callers can treat
 * presence as a genuine shortfall.
 */
export function shortfallText(v: unknown): string | null {
  const s = firstString(v);
  if (!s) return null;
  const normalised = s.trim().toLowerCase();
  if (normalised === 'none' || normalised === 'n/a') return null;
  return s;
}

/**
 * Renders a date consistently regardless of which field it came from.
 *
 * The base mixes raw date formulas (`Self Assessment Due` → `2026-10-21`) with
 * pre-formatted email twins (`TR Reassessment Date (email)` → `October 30,
 * 2026`). Showing both verbatim puts two date formats on one screen, so an
 * ISO value is reformatted and anything already prose is passed through.
 *
 * Parsed as UTC deliberately: `new Date('2026-10-21')` is midnight UTC, and
 * formatting that in a negative-offset timezone renders the 20th. Same class
 * of bug as the `SET_TIMEZONE` fix on `Round Label`.
 */
export function formatDate(v: unknown): string | null {
  const s = firstString(v);
  if (!s) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!iso) return s;

  const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return s;

  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Readiness stages, in program order, for rendering a progress rail.
 *
 * These must match the values `New Hire Status` can return exactly — a label
 * that does not match gets `index: null` and renders with no rail at all.
 *
 * `Historical` is deliberately NOT a rail step. It is the end state for a pro
 * who has left the program, which is not a further point of progress than
 * `Graduated`; it renders as a label-only card via the `index: null` path.
 */
export const READINESS_STAGES = [
  'Training',
  'Readiness Review',
  'Additional Training Required',
  'Graduated',
] as const;

export type ReadinessStage = (typeof READINESS_STAGES)[number];

/** Short rail labels — the full status names do not fit a phone width. */
export const STAGE_SHORT_LABELS: Record<ReadinessStage, string> = {
  Training: 'Training',
  'Readiness Review': 'Review',
  'Additional Training Required': 'Additional Training',
  Graduated: 'Graduated',
};

/** Maps a `New Hire Status` value onto a stage, tolerating an unknown string. */
export function toStage(value: unknown): { label: string; index: number | null } {
  const label = firstString(value) || 'Training';
  const index = READINESS_STAGES.indexOf(label as ReadinessStage);
  return { label, index: index === -1 ? null : index };
}
