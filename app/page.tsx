/**
 * The New Hire "My Readiness" page.
 *
 * `SessionProvider` wraps the tree HERE rather than in the root layout.
 *
 * The package README says to wrap the root layout, but the provider renders a
 * redirect-to-/magistrate-auth client component when there is no session, and
 * that component navigates unconditionally — it never checks whether it is
 * already on the auth path. A provider in the root layout therefore also wraps
 * /magistrate-auth, so an unauthenticated visitor loops forever and
 * `AuthenticationPage` never renders. This app has one page, so page-level
 * placement covers exactly what the root layout would have. See MAGISTRATE.md.
 *
 * The provider is skipped when a local dev identity is configured, otherwise
 * local development would require a live FPM session.
 */
import { SessionProvider } from '@FO-Enablement-Vivint/magistrate/next';
import { isDevIdentity } from '@server/lib/session';
import MyReadiness from '@/MyReadiness';

export default function Page() {
  if (isDevIdentity()) return <MyReadiness />;

  return (
    <SessionProvider>
      <MyReadiness />
    </SessionProvider>
  );
}
