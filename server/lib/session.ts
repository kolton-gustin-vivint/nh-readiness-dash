/**
 * Session seam.
 *
 * This is the ONLY file that knows how the signed-in user is established.
 * Everything downstream — the identity gate, every endpoint, the route
 * handler — depends on `getSession()` and nothing else.
 *
 * Production resolves the session from Magistrate. Locally, an explicit
 * DEV_USER_RECORD_ID or DEV_USER_EMAIL short-circuits it so the page can be
 * previewed as a specific pro without a live FPM session — notably Ivan
 * Cervantes, the only pro with complete field-experience data, whose
 * WORK_EMAIL is "IVAN.CERVANTES" with no domain and who therefore cannot be
 * reached by the normal email join.
 *
 * ── Why this seam instead of the package's withSession() ───────────────────
 * Magistrate ships `withSession()`, which wraps a route handler, rejects with
 * 401 before it runs, and passes a typed session on the context. It is the
 * documented approach and it is good. It is not used here because it would
 * bypass the dev overrides above and make local development require a live FPM
 * session. The route handler calls this seam instead, and this seam calls
 * Magistrate, so production behaviour is identical.
 *
 * Known Magistrate limitations, inherited deliberately (logged 2026-10-22):
 * sessions are fixed at 8 hours and it ships no logout control. The mitigating
 * factor here is that a session only ever exposes the signed-in pro's own
 * record.
 */
import { getSession as magistrateGetSession } from '@FO-Enablement-Vivint/magistrate/next';
import { env } from './env';

/**
 * The subset of Magistrate's session this app uses.
 *
 * The full `SessionData` also carries `audience`, `techOrganization` and a
 * numeric `clearance`. `clearance` is deliberately unused: every new hire must
 * reach this page, and §9 of the governance doc grants the NH role "Own",
 * which is a per-record rule that a global clearance level cannot express. The
 * real authorization is the EML record match in `./eml.ts`.
 */
export interface Session {
  email: string;
  firstName?: string;
  lastName?: string;
  /**
   * Dev-only: an EML record id used instead of matching on email. Magistrate
   * never sets this.
   */
  recordId?: string;
}

/**
 * Returns the signed-in user, or null if there is no session.
 *
 * Null means "not signed in" and surfaces as 401, which the client turns into
 * a redirect to /magistrate-auth. It must never surface as an empty page —
 * that silent-failure mode is part of why this app exists rather than an
 * Airtable interface.
 */
export async function getSession(): Promise<Session | null> {
  // Local overrides, impossible in production.
  if (!env.isProd) {
    const recordId = env.devUserRecordId.trim();
    if (recordId) return { email: '', recordId };

    const devEmail = env.devUserEmail.trim();
    if (devEmail) return { email: devEmail };
  }

  const { session } = await magistrateGetSession();
  if (!session?.email) return null;

  return {
    email: session.email,
    firstName: session.firstName,
    lastName: session.lastName,
  };
}

/** True when a local override is standing in for a real session. */
export function isDevIdentity(): boolean {
  return !env.isProd && Boolean(env.devUserRecordId.trim() || env.devUserEmail.trim());
}
