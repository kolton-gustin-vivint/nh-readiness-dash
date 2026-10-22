/**
 * Session seam.
 *
 * This is the ONLY file that knows how the signed-in user is established.
 * Everything downstream — the identity gate, every endpoint, the route
 * handler — depends on `getSession()` and nothing else, so swapping the
 * implementation for Magistrate is a change to this file alone.
 *
 * Today it reads DEV_USER_EMAIL. That is a development stand-in, not an auth
 * system, and it fails closed in production (see below).
 *
 * ── Swapping in Magistrate ─────────────────────────────────────────────────
 * 1. npm install @FO-Enablement-Vivint/magistrate  (needs NPM_AUTH_TOKEN)
 * 2. Add app/magistrate-auth/page.tsx rendering its default AuthenticationPage
 * 3. Wrap app/page.tsx's tree in its SessionProvider
 * 4. Replace the body of getSession() below with:
 *
 *      import { getSession as magistrateSession } from '@FO-Enablement-Vivint/magistrate/next';
 *      export async function getSession(): Promise<Session | null> {
 *        const { session } = await magistrateSession();
 *        if (!session?.email) return null;
 *        return { email: session.email, firstName: session.firstName, lastName: session.lastName };
 *      }
 *
 * Nothing else in the app changes. The shape below is deliberately the subset
 * of Magistrate's session that this app uses.
 *
 * Known Magistrate limitations, inherited deliberately (logged 2026-10-22):
 * sessions are fixed at 8 hours and it ships no logout control. The mitigating
 * factor here is that a session only ever exposes the signed-in pro's own
 * record, never anyone else's.
 */
import { env } from './env';

export interface Session {
  email: string;
  firstName?: string;
  lastName?: string;
  /**
   * Dev-only escape hatch: an EML record id to use instead of matching on
   * email. Magistrate never sets this — it exists because some pros cannot be
   * reached by email at all (Ivan Cervantes' WORK_EMAIL is `IVAN.CERVANTES`,
   * with no domain), and those are exactly the records with the most data to
   * preview against.
   */
  recordId?: string;
}

/**
 * Returns the signed-in user, or null if there is no session.
 *
 * Null means "not signed in" and must surface as 401, not as an empty page —
 * an Airtable interface answers a failed identity match with a blank screen
 * and this app exists partly to not do that.
 */
export async function getSession(): Promise<Session | null> {
  // Fail closed. A production build with no Magistrate wired up and a
  // DEV_USER_EMAIL left in the environment would otherwise serve one pro's
  // record to every visitor.
  if (env.isProd) {
    throw new Error(
      'No authentication is configured. server/lib/session.ts still uses the ' +
        'DEV_USER_EMAIL stand-in, which is refused in production. Wire up ' +
        'Magistrate before deploying.',
    );
  }

  // DEV_USER_RECORD_ID wins when both are set, so you can preview a pro whose
  // work email is unusable without editing Workday-sourced data in Airtable.
  const recordId = env.devUserRecordId.trim();
  if (recordId) return { email: '', recordId };

  const email = env.devUserEmail.trim();
  if (!email) return null;

  return { email };
}

/** True when the dev stand-in is in use, so the UI can show a banner. */
export function isDevIdentity(): boolean {
  return !env.isProd;
}
