/**
 * The card vocabulary for this page. Four small components, because the doc
 * asks for "simple status cards" and "plain-language next steps" — anything
 * more elaborate works against the requirement.
 */
import type { ReactNode } from 'react';

/** Em dash for an absent value, so a blank never reads as a zero. */
export const EMPTY = '—';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

/**
 * A labelled status card.
 *
 * `value` is the headline, `note` the plain-language explanation underneath.
 * A null value renders as an em dash rather than being hidden, because a
 * missing requirement is information — the pro needs to know a status is
 * unknown, not have the card silently disappear.
 */
export function StatusCard({
  label,
  value,
  note,
  tone = 'neutral',
  children,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'info';
  children?: ReactNode;
}) {
  const bar = {
    neutral: 'bg-slate-300',
    good: 'bg-emerald-500',
    warn: 'bg-amber-500',
    info: 'bg-sky-500',
  }[tone];

  return (
    <Card className="relative overflow-hidden">
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} aria-hidden />
      <div className="pl-2">
        <p className="card-label">{label}</p>
        <p className="card-value">{value ?? EMPTY}</p>
        {note ? <p className="card-note">{note}</p> : null}
        {children}
      </div>
    </Card>
  );
}

/**
 * A count list — the doc's "counts and distribution" shape.
 *
 * Deliberately not a percentage: the doc's experience-area list is prefixed
 * "such as", so there is no closed denominator to divide by.
 *
 * The item type is loose because this project inherits `strict: false` from
 * shx-lead-tracker, under which Zod infers object properties as optional. The
 * endpoint's own output schema is what actually guarantees these are present.
 */
export function CountList({
  items,
  emptyMessage,
}: {
  items: Array<{ label?: string; count?: number }>;
  emptyMessage: string;
}) {
  const rows = items
    .map(i => ({ label: i.label ?? '', count: i.count ?? 0 }))
    .filter(i => i.label !== '');

  if (!rows.length) {
    return <p className="card-note">{emptyMessage}</p>;
  }

  // Guard against a zero max, which would make the bar width NaN.
  const max = Math.max(1, ...rows.map(i => i.count));

  return (
    <ul className="mt-3 space-y-2">
      {rows.map(item => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-slate-700">{item.label}</span>
            <span className="text-sm font-semibold tabular-nums text-slate-900">{item.count}</span>
          </div>
          {/* A bar rather than a chart: it scales to the widest count and needs
              no library, no axis and no legend. */}
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.round((item.count / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Section heading, used twice: "My progress" and "My field experience". */
export function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="px-1 pt-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h2>;
}
