/**
 * The one action button.
 *
 * The doc's style rule is "one clear action button for the tasks currently
 * due", so this renders a single action chosen server-side by
 * server/lib/nextAction.ts. It is sticky at the bottom on purpose: the
 * requirement is limited scrolling, and an action that scrolls out of view is
 * an action that does not get taken.
 *
 * Three states:
 *   - an action with a form   -> a link
 *   - an action with no form  -> the same card without a tap target, because
 *                                the next step is someone else's to arrange
 *   - no action               -> nothing rendered
 */
import type { GetMyReadinessOutputType } from '@/lib/api';

type NextAction = GetMyReadinessOutputType['nextAction'];

export default function ActionBar({ action }: { action: NextAction }) {
  if (!action) return null;

  const body = (
    <>
      <span className="block text-base font-semibold">{action.label}</span>
      <span className="mt-0.5 block text-xs font-normal leading-snug opacity-90">{action.because}</span>
      {action.due ? <span className="mt-1 block text-xs font-medium opacity-90">Due {action.due}</span> : null}
    </>
  );

  // Informational: nothing for the pro to open, so it must not look tappable.
  if (!action.href) {
    return (
      <div className="sticky bottom-3 z-10 mt-2">
        <div className="rounded-2xl bg-slate-800 px-4 py-3 text-left text-white shadow-lg">{body}</div>
      </div>
    );
  }

  return (
    <div className="sticky bottom-3 z-10 mt-2">
      <a
        href={action.href}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-2xl bg-emerald-600 px-4 py-3 text-left text-white shadow-lg active:bg-emerald-700"
      >
        {body}
      </a>
    </div>
  );
}
