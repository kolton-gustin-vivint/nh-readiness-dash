/**
 * Readiness stage rail — "Overall readiness stage" from the doc.
 *
 * A four-step rail rather than a chip, because the requirement next to it is
 * "how is my participation progressing" and "what happens next before I can
 * work independently": a pro needs to see where the stage sits in the
 * sequence, not just its name.
 *
 * The stage list and its short labels come from server/lib/readiness.ts so the
 * rail cannot drift from the values `toStage` matches against. `Historical` is
 * not a rail step — it falls through to the label-only card below.
 */
import { READINESS_STAGES, STAGE_SHORT_LABELS } from '@server/lib/readiness';

export default function StageRail({ label, index }: { label: string; index: number | null }) {
  // An unrecognised status is shown as-is with no rail, rather than being
  // forced onto a step it does not belong on.
  if (index === null) {
    return (
      <div className="card">
        <p className="card-label">Readiness stage</p>
        <p className="card-value">{label}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="card-label">Readiness stage</p>
      <p className="card-value">{label}</p>
      <ol className="mt-3 flex gap-1" aria-label="Readiness stages">
        {READINESS_STAGES.map((stage, i) => {
          const done = i < index;
          const current = i === index;
          return (
            <li key={stage} className="flex-1" aria-current={current ? 'step' : undefined}>
              <div
                className={`h-1.5 rounded-full ${
                  current ? 'bg-emerald-600' : done ? 'bg-emerald-300' : 'bg-slate-200'
                }`}
              />
              <span
                className={`mt-1 block text-[10px] leading-tight ${
                  current ? 'font-semibold text-slate-900' : 'text-slate-400'
                }`}
              >
                {STAGE_SHORT_LABELS[stage]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
