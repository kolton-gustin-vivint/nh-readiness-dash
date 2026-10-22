/**
 * The New Hire "My Readiness" page.
 *
 * A server component that renders nothing but the client tree, matching the
 * shx-lead-tracker pattern. When Magistrate is wired up, its SessionProvider
 * wraps <MyReadiness /> here — that is the only change this file needs.
 */
import MyReadiness from '@/MyReadiness';

export default function Page() {
  return <MyReadiness />;
}
