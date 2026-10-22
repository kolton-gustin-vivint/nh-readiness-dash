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
 */
import { cookies } from 'next/headers';
import { SessionProvider } from '@FO-Enablement-Vivint/magistrate/next';
import { env } from '@server/lib/env';
import { isDevIdentity, PREVIEW_AS_COOKIE } from '@server/lib/session';
import { loadDemoRoster } from '@server/lib/demoRoster';
import MyReadiness from '@/MyReadiness';
import PreviewAs from '@/components/PreviewAs';

export default async function Page() {
  // TEMPORARY: the "Preview as" box. loadDemoRoster() returns [] when
  // env.isProd, which makes the component render nothing, so everything below
  // collapses to `<SessionProvider><MyReadiness /></SessionProvider>` in any
  // deployed build. Delete with the box; see PreviewAs.tsx.
  const roster = await loadDemoRoster();
  const previewing = (await cookies()).get(PREVIEW_AS_COOKIE)?.value ?? null;
  const box = <PreviewAs roster={roster} current={previewing} />;

  if (await isDevIdentity()) {
    return (
      <>
        <MyReadiness />
        {box}
      </>
    );
  }

  // Locally, with no identity chosen, Magistrate is opt-in. The provider's
  // redirect client navigates the whole document to FPM the moment it mounts,
  // which would carry the box away with it — you cannot pick an identity from
  // a page that has already left. So dev gets the box and an explicit sign-in
  // link instead of an automatic bounce. Production is unchanged.
  if (!env.isProd && roster.length) {
    return (
      <main className="mx-auto flex w-full max-w-page flex-col gap-3 p-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="card-label">No identity selected</p>
          <p className="mt-1 text-sm text-slate-600">
            Pick a pro from <span className="font-medium">Preview as</span>, or sign in with your
            own FPM account.
          </p>
          <a
            href="/magistrate-auth"
            className="mt-3 inline-block rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
          >
            Sign in with Magistrate
          </a>
        </div>
        {box}
      </main>
    );
  }

  return (
    <SessionProvider>
      <MyReadiness />
    </SessionProvider>
  );
}
