'use client';

/**
 * TEMPORARY — the "Preview as" box.
 *
 * ============================================================================
 * DELETE BEFORE GO-LIVE. Four files and two call sites:
 *
 *   1. this file                            src/components/PreviewAs.tsx
 *   2. the server actions                   src/components/previewAsActions.ts
 *   3. the roster loader                    server/lib/demoRoster.ts
 *   4. the cookie branch + PREVIEW_AS_COOKIE in server/lib/session.ts
 *      (getSession() and isDevIdentity(); isDevIdentity can go back to being
 *       synchronous, which also reverts the `await` in app/page.tsx)
 *   5. the <PreviewAs> render + roster fetch in app/page.tsx
 *
 * It exists to switch identity instantly during a demo. It is an auth bypass,
 * so it is guarded in all four places rather than one, and it cannot exist in
 * any deployed build: every Vercel build sets NODE_ENV=production, which makes
 * env.isProd true, which makes the roster empty and every action a no-op.
 * ============================================================================
 *
 * Collapsed to a pill by default and anchored bottom-right at z-30, above
 * ActionBar's sticky z-10 — a panel open by default would cover the page's
 * primary call-to-action, which is the one thing a demo needs visible.
 */
import { useState, useTransition } from 'react';
import type { RosterEntry } from '@server/lib/demoRoster';
import { setPreviewAs, clearPreviewAs } from '@/components/previewAsActions';

export default function PreviewAs({
  roster,
  current,
}: {
  roster: RosterEntry[];
  current: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Empty in production, so the box disappears along with the roster.
  if (!roster.length) return null;

  const active = roster.find(r => r.recordId === current);

  // A full reload, not just the server action.
  //
  // revalidatePath() re-runs the server component, but MyReadiness fetches its
  // data client-side via POST /api/* on mount — so revalidation alone swaps the
  // cookie without changing a single number on screen, which looks like the
  // box is broken. Reloading re-runs those fetches under the new cookie.
  function choose(recordId: string) {
    startTransition(async () => {
      await setPreviewAs(recordId);
      window.location.reload();
    });
  }

  function reset() {
    startTransition(async () => {
      await clearPreviewAs();
      window.location.reload();
    });
  }

  return (
    <div className="fixed bottom-3 right-3 z-30 flex flex-col items-end gap-2">
      {open ? (
        <div className="max-h-[60vh] w-[19rem] overflow-y-auto rounded-2xl border border-slate-300 bg-white p-2 shadow-2xl">
          <div className="flex items-baseline justify-between px-1 pb-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview as</p>
            <button onClick={reset} className="text-xs text-slate-500 underline" disabled={pending}>
              Clear
            </button>
          </div>

          <ul className="space-y-1">
            {roster.map(r => {
              const isActive = r.recordId === current;
              return (
                <li key={r.recordId}>
                  <button
                    onClick={() => choose(r.recordId)}
                    disabled={pending}
                    className={`w-full rounded-xl px-2 py-1.5 text-left transition ${
                      isActive ? 'bg-emerald-50 ring-1 ring-emerald-500' : 'hover:bg-slate-100'
                    }`}
                  >
                    <span className="block text-sm font-medium text-slate-800">{r.name}</span>
                    <span className="block text-xs text-slate-500">{describe(r)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <button
        onClick={() => setOpen(o => !o)}
        className="rounded-full bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-lg"
      >
        {pending ? 'Switching…' : `Preview as${active ? `: ${active.name}` : ''}`}
      </button>
    </div>
  );
}

/**
 * The facts about a pro, not the action they will be shown.
 *
 * Deriving the action here would duplicate the precedence in
 * server/lib/nextAction.ts, and the two copies would drift. The page remains
 * the only thing that decides what is due.
 */
function describe(r: RosterEntry): string {
  const bits: string[] = [];
  if (r.stage) bits.push(r.stage);
  if (r.programWeek !== null) bits.push(`wk ${r.programWeek}`);
  if (r.coursesLeft !== null && r.coursesLeft > 0) {
    bits.push(`${r.coursesLeft} course${r.coursesLeft === 1 ? '' : 's'}`);
  }
  if (r.woGate) bits.push('WOs unmet');
  else bits.push('WOs met');
  if (r.eventStatuses.length) bits.push(r.eventStatuses[0]);
  return bits.join(' · ');
}
