/**
 * Identity gate — resolves a session into exactly one `Field Ops EML 2.0` row.
 *
 * Magistrate (or the dev stand-in) says *who* someone is. This decides which
 * record they are, and that record id is the only scope any endpoint in this
 * app may read. The governance doc's §9 access matrix gives the NH role:
 *
 *     WO Forms            Own
 *     NH Self-Assessment  Own
 *     FSM Assessment      No
 *     RM Audit            No
 *     Calibration Results No
 *
 * so "Own" is the whole authorization model and there is no role to branch on.
 * Enforcement is server-side on purpose: the alternative considered was an
 * Airtable interface filtered on the current user, which scopes what a page
 * *renders* without preventing access to the underlying data.
 *
 * The join key is WORK_EMAIL. That is an assumption worth stating plainly:
 * it requires the address SSO provides to equal the one Workday feeds into
 * EML. Where it does not, this returns FORBIDDEN naming the address that
 * failed rather than rendering an empty page. Run `npm run email:match` to
 * measure the match rate across the In Training view before go-live.
 */
import { FieldOpsEml20, type FieldOpsEml20RecordType } from '../airtable/index';
import { ApiError, type RequestUser } from './endpoint';
import type { Session } from './session';

/**
 * EML rows are cached briefly so the two endpoints behind one page load cost a
 * single lookup instead of one each. The trade-off is that a Workday-driven
 * change takes up to this long to show.
 */
const CACHE_TTL_MS = 60_000;

type CacheEntry = { record: FieldOpsEml20RecordType | null; expires: number };
const cache = new Map<string, CacheEntry>();

/** Looks up an EML row by work email, using the short-lived cache. */
export async function findEmlRecord(email: string): Promise<FieldOpsEml20RecordType | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;

  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.record;

  // WORK_EMAIL is not guaranteed to be stored lowercased, so the comparison is
  // done case-insensitively in the formula rather than by equality on the key.
  const record =
    (await FieldOpsEml20.findOne({ filters: { workEmail: email.trim() } })) ??
    (await findEmlRecordCaseInsensitive(key));

  cache.set(key, { record, expires: Date.now() + CACHE_TTL_MS });
  return record;
}

/**
 * Fallback for a casing mismatch between the session address and WORK_EMAIL.
 * Uses a raw formula because the filter object's `contains` would also match
 * `k.gustin@…` inside `mk.gustin@…`.
 */
async function findEmlRecordCaseInsensitive(lowerEmail: string): Promise<FieldOpsEml20RecordType | null> {
  const quoted = JSON.stringify(lowerEmail);
  const page = await FieldOpsEml20.findAll({
    formula: `LOWER({WORK_EMAIL} & "") = ${quoted}`,
    limit: 2,
  });
  // More than one row on the same address means the roster is ambiguous and we
  // must not guess which pro the caller is.
  if (page.records.length > 1) {
    throw new ApiError({
      code: 'CONFLICT',
      message:
        `More than one Field Ops EML 2.0 record carries the work email ${lowerEmail}. ` +
        'Readiness data cannot be shown until the duplicate is resolved.',
    });
  }
  return page.records[0] ?? null;
}

/** Drops a cached row, so the next request re-reads it from Airtable. */
export function forgetEmlRecord(email: string): void {
  cache.delete(email.trim().toLowerCase());
}

/** Fields the gate owns; an EML column of the same name must not win. */
const RESERVED = new Set(['id', 'email', 'roles']);

/**
 * Builds the endpoint `context.user` for a signed-in new hire.
 *
 * Refuses anyone whose session email matches no EML row. It deliberately does
 * NOT refuse on `EMP_STATUS` or `New Hire Status`: a pro who has finished the
 * program still needs to see their own record, and the doc's §8 retention
 * rule keeps readiness records available after they reach Historical.
 */
export async function requireNewHire(session: Session): Promise<RequestUser> {
  // Dev-only path: resolve straight to a record id, bypassing the email join.
  // Unreachable in production because getSession() throws there first.
  if (session.recordId) {
    const byId = await FieldOpsEml20.findOne({ id: session.recordId });
    if (!byId) {
      throw new ApiError({
        code: 'FORBIDDEN',
        message: `No Field Ops EML 2.0 record with id ${session.recordId}.`,
      });
    }
    return buildUser(byId, String(byId.workEmail || '').toLowerCase(), session);
  }

  const email = (session.email || '').trim().toLowerCase();
  if (!email) {
    throw new ApiError({ code: 'UNAUTHORIZED', message: 'Not signed in' });
  }

  const record = await findEmlRecord(email);
  if (!record) {
    throw new ApiError({
      code: 'FORBIDDEN',
      message:
        `No New Hire Readiness record is linked to ${email}. If you have recently ` +
        'joined, your record may not have synced yet — contact your FSM.',
    });
  }

  return buildUser(record, email, session);
}

/** Copies the EML row onto the request user, with the gate's own fields winning. */
function buildUser(record: FieldOpsEml20RecordType, email: string, session: Session): RequestUser {
  const name =
    [session.firstName, session.lastName].filter(Boolean).join(' ') ||
    String(record.preferredFullName || record.legalFullName || '');

  const user: RequestUser = { id: record.id, email, name: name || undefined, roles: ['newHire'] };
  for (const [key, value] of Object.entries(record)) {
    if (RESERVED.has(key)) continue;
    user[key] = value;
  }
  return user;
}
