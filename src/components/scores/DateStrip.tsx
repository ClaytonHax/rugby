import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const shift = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };

function label(date: string, today: string): string {
  if (date === shift(today, -1)) return 'Yesterday';
  if (date === today) return 'Today';
  if (date === shift(today, 1)) return 'Tomorrow';
  return parse(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Scrolling day strip. `value` null means all dates. Days without matches are muted but still selectable. */
export function DateStrip({ dates, value, onChange, className = '' }: {
  dates: string[]; value: string | null; onChange: (date: string | null) => void; className?: string;
}) {
  const [today] = useState(() => iso(new Date()));
  const days = useMemo(() => [...new Set([...dates, today])].sort(), [dates, today]);
  const has = useMemo(() => new Set(dates), [dates]);
  const sel = useRef<HTMLButtonElement>(null);
  useEffect(() => { sel.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' }); }, [value]);
  const idx = value ? days.indexOf(value) : -1;
  const move = (n: number) => {
    if (idx < 0) onChange(n > 0 ? days.find((d) => d >= today) ?? days[days.length - 1] : [...days].reverse().find((d) => d <= today) ?? days[0]);
    else onChange(days[Math.min(days.length - 1, Math.max(0, idx + n))]);
  };
  const nav = 'inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-gray-200 disabled:text-ink-soft/40 disabled:hover:bg-transparent';
  return (
    <div role="group" aria-label="Match date" className={`flex items-center gap-1 ${className}`}>
      <button type="button" className={nav} aria-label="Previous day" onClick={() => move(-1)} disabled={idx === 0}><ChevronLeft className="size-5" aria-hidden /></button>
      <div className="no-scrollbar relative flex min-w-0 flex-1 gap-1 overflow-x-auto">
        <button type="button" aria-pressed={value === null} onClick={() => onChange(null)}
          className={`min-h-11 shrink-0 border-b-[3px] px-3 text-sm font-bold ${value === null ? 'border-gold text-ink' : 'border-transparent text-ink-soft hover:text-ink'}`}>All dates</button>
        {days.map((d) => {
          const on = d === value;
          return (
            <button key={d} ref={on ? sel : undefined} type="button" aria-pressed={on} onClick={() => onChange(d)}
              className={`min-h-11 shrink-0 border-b-[3px] px-3 text-sm ${on ? 'border-gold font-bold text-ink' : `border-transparent hover:text-ink ${has.has(d) ? 'font-semibold text-ink' : 'text-ink-soft'}`}`}>
              {label(d, today)}{!has.has(d) && <span className="sr-only"> (no matches)</span>}
            </button>
          );
        })}
      </div>
      <button type="button" className={nav} aria-label="Next day" onClick={() => move(1)} disabled={idx === days.length - 1}><ChevronRight className="size-5" aria-hidden /></button>
    </div>
  );
}
