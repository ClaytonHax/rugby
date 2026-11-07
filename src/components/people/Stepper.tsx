import { Check } from 'lucide-react';

export function Stepper({ steps, current, onSelect, maxReached }: {
  steps: string[]; current: number; maxReached: number; onSelect: (i: number) => void;
}) {
  return (
    <ol className="mb-5 grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Registration steps">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s}>
            <button type="button" disabled={i > maxReached} onClick={() => onSelect(i)} aria-current={active ? 'step' : undefined}
              className={`flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-lg border px-1 text-xs font-semibold sm:flex-row sm:gap-2 sm:text-sm ${
                active ? 'border-pitch bg-pitch text-white' : done ? 'border-pitch/40 bg-pitch-50 text-pitch' : 'border-line bg-white text-ink-soft'
              } disabled:opacity-60`}>
              <span className="num flex size-5 items-center justify-center rounded-full border border-current text-xs">
                {done ? <Check className="size-3" aria-hidden /> : i + 1}
              </span>
              <span className="truncate">{s}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
