/**
 * Hand-rolled SVG/CSS charts. No charting library on purpose: this page is
 * read on field devices over mobile data, and recharts or chart.js would be
 * more JavaScript than the rest of the app combined for four small visuals.
 *
 * Each shape answers a different question, which is why they are not all bars:
 *
 *   Donut          part-to-whole over a few categories  (job-type mix)
 *   CountList      ranked magnitudes, many long labels  (experience areas)
 *   Ladder         an ordered progression               (participation)
 *   ProportionBar  one bar split by share               (who you trained with)
 *
 * All of them label their counts, so none depends on the reader estimating an
 * area or an angle.
 */
import type { ReactNode } from 'react';

/**
 * Categorical palette. Fixed hexes rather than Tailwind classes because the
 * slice colours are applied as SVG `stroke`/`fill` attributes and have to be
 * resolvable at render time.
 */
export const PALETTE = ['#059669', '#0284c7', '#d97706', '#7c3aed', '#db2777', '#0f766e', '#64748b'];

type Item = { label?: string; count?: number };

/** Normalises the loose Zod-inferred item shape into usable rows. */
function rows(items: Item[]): Array<{ label: string; count: number }> {
  return items.map(i => ({ label: i.label ?? '', count: i.count ?? 0 })).filter(r => r.label !== '');
}

// ── Donut ───────────────────────────────────────────────────────────────────

const R = 42;
const STROKE = 16;
const CIRC = 2 * Math.PI * R;

/**
 * Part-to-whole over a handful of categories.
 *
 * Slices are drawn as one circle per category with a dash pattern, offset by
 * the running total — simpler and more robust than arc paths, which need
 * large-arc flags and break at exactly 50%.
 */
export function Donut({
  items,
  centerLabel,
  centerValue,
  emptyMessage,
}: {
  items: Item[];
  centerLabel?: string;
  centerValue?: ReactNode;
  emptyMessage: string;
}) {
  const data = rows(items);
  const total = data.reduce((n, d) => n + d.count, 0);

  if (!total) return <p className="card-note">{emptyMessage}</p>;

  let offset = 0;

  return (
    <div className="mt-3 flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0" role="img" aria-label={centerLabel}>
        <g transform="rotate(-90 50 50)">
          {data.map((d, i) => {
            const dash = (d.count / total) * CIRC;
            const el = (
              <circle
                key={d.label}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={STROKE}
                strokeDasharray={`${dash} ${CIRC - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })}
        </g>
        {centerValue !== undefined ? (
          <text
            x="50"
            y="50"
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-slate-900 text-[22px] font-semibold"
          >
            {centerValue}
          </text>
        ) : null}
      </svg>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-baseline gap-2 text-sm">
            <span
              className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-slate-700" title={d.label}>
              {d.label}
            </span>
            <span className="font-semibold tabular-nums text-slate-900">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Ladder ──────────────────────────────────────────────────────────────────

/**
 * An ordered progression, highest rung first so it reads as a ladder.
 *
 * `items` arrives lowest-to-highest (ordered by the base's `Participation
 * Rank`) and is reversed here. `current` is the pro's most recent rung and
 * `best` their highest ever — showing both is the point, because the EML
 * high-water mark alone cannot reveal a regression.
 */
export function Ladder({
  items,
  current,
  best,
  emptyMessage,
}: {
  items: Item[];
  current: string | null;
  best: string | null;
  emptyMessage: string;
}) {
  const data = rows(items);
  if (!data.length) return <p className="card-note">{emptyMessage}</p>;

  const max = Math.max(1, ...data.map(d => d.count));
  const ordered = [...data].reverse();

  return (
    <ul className="mt-3 space-y-1">
      {ordered.map(d => {
        const isCurrent = d.label === current;
        const isBest = d.label === best && !isCurrent;
        return (
          <li key={d.label} className="flex items-center gap-2">
            {/* Rung marker: filled for the current level, ringed for the best. */}
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                isCurrent
                  ? 'bg-emerald-600 ring-2 ring-emerald-200'
                  : isBest
                    ? 'bg-white ring-2 ring-emerald-400'
                    : 'bg-slate-300'
              }`}
              aria-hidden
            />
            <span
              className={`min-w-0 flex-1 truncate text-sm ${
                isCurrent ? 'font-semibold text-slate-900' : 'text-slate-600'
              }`}
              title={d.label}
            >
              {d.label}
            </span>
            {/* Rung width is relative, so the shape of the climb is visible. */}
            <span className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100">
              <span
                className={`block h-full rounded-full ${isCurrent ? 'bg-emerald-600' : 'bg-slate-300'}`}
                style={{ width: `${Math.round((d.count / max) * 100)}%` }}
              />
            </span>
            <span className="w-5 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
              {d.count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Proportion bar ──────────────────────────────────────────────────────────

/**
 * A single bar split by share, with a legend underneath.
 *
 * Used for trainer mix, where the governance question is a ratio — §7 asks the
 * system to "show how much field training occurred directly with the FSM
 * compared with other Pros" — rather than a ranking of individuals.
 *
 * Segments under ~4% get a floor width so a one-work-order trainer does not
 * vanish into a hairline.
 */
export function ProportionBar({
  items,
  emptyMessage,
  footnote,
}: {
  items: Item[];
  emptyMessage: string;
  footnote?: ReactNode;
}) {
  const data = rows(items);
  const total = data.reduce((n, d) => n + d.count, 0);
  if (!total) return <p className="card-note">{emptyMessage}</p>;

  return (
    <div className="mt-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {data.map((d, i) => (
          <span
            key={d.label}
            className="h-full"
            style={{
              width: `${Math.max(4, (d.count / total) * 100)}%`,
              backgroundColor: PALETTE[i % PALETTE.length],
            }}
            title={`${d.label}: ${d.count}`}
          />
        ))}
      </div>

      <ul className="mt-3 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-baseline gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-slate-700" title={d.label}>
              {d.label}
            </span>
            <span className="shrink-0 text-xs text-slate-500">
              {Math.round((d.count / total) * 100)}%
            </span>
            <span className="w-5 shrink-0 text-right font-semibold tabular-nums text-slate-900">
              {d.count}
            </span>
          </li>
        ))}
      </ul>

      {footnote ? <p className="card-note">{footnote}</p> : null}
    </div>
  );
}
