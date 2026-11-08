export type StatusFilter = 'all' | 'live' | 'scheduled' | 'final';
const PILLS: ReadonlyArray<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' }, { key: 'live', label: 'Live' }, { key: 'final', label: 'Finished' }, { key: 'scheduled', label: 'Scheduled' },
];

/** All / Live / Finished / Scheduled toggle buttons (one pressed at a time). */
export function StatusPills({ value, onChange, counts, hide = [], className = '' }: {
  value: StatusFilter; onChange: (v: StatusFilter) => void; counts?: Partial<Record<StatusFilter, number>>; hide?: StatusFilter[]; className?: string;
}) {
  return (
    <div role="group" aria-label="Filter by status" className={`no-scrollbar flex gap-2 overflow-x-auto ${className}`}>
      {PILLS.filter((p) => !hide.includes(p.key)).map((p) => {
        const on = value === p.key;
        return (
          <button key={p.key} type="button" aria-pressed={on} onClick={() => onChange(p.key)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-xs font-bold uppercase tracking-wide ${on ? 'bg-pitch text-white' : 'bg-gray-200 text-ink hover:bg-gray-300'}`}>
            {p.label}{counts?.[p.key] != null && <span className="ml-1.5 font-semibold opacity-80">{counts[p.key]}</span>}
          </button>
        );
      })}
    </div>
  );
}
