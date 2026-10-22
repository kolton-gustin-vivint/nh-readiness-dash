/**
 * The sign-in route.
 *
 * `SessionProvider` redirects unauthenticated users here, so this route must
 * exist at exactly this path. It handles the FPM redirect, warrant redemption
 * and cookie access.
 *
 * It must NOT be wrapped in `SessionProvider` — the provider renders a
 * redirect-to-/magistrate-auth client component when there is no session, and
 * that component does not check whether it is already on this path, so a
 * provider above this page is an infinite loop. That is why the provider lives
 * in app/page.tsx rather than the root layout, despite the package README
 * saying to wrap the root layout. See MAGISTRATE.md.
 */
import AuthenticationPage from '@FO-Enablement-Vivint/magistrate/next';

export default function Page() {
  return <AuthenticationPage />;
}
