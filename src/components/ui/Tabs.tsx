import type { KeyboardEvent } from 'react';

/** Segmented tabs. Pair with a panel: <div role="tabpanel" id={`${idBase}-panel`} aria-labelledby={`${idBase}-${value}`}>. */
export function Tabs<K extends string>({ idBase, label, tabs, value, onChange, fill = false }: {
  idBase: string; label: string; tabs: ReadonlyArray<{ key: K; label: string }>; value: K; onChange: (key: K) => void; fill?: boolean;
}) {
  function onKey(e: KeyboardEvent, i: number) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = tabs[(i + step + tabs.length) % tabs.length].key;
    onChange(next);
    document.getElementById(`${idBase}-${next}`)?.focus();
  }
  return (
    <div role="tablist" aria-label={label} className="mb-4 flex gap-2">
      {tabs.map((t, i) => (
        <button key={t.key} type="button" role="tab" id={`${idBase}-${t.key}`} aria-selected={value === t.key} aria-controls={`${idBase}-panel`}
          tabIndex={value === t.key ? 0 : -1} onClick={() => onChange(t.key)} onKeyDown={(e) => onKey(e, i)}
          className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${fill ? 'flex-1' : ''} ${value === t.key ? 'bg-pitch text-white' : 'border border-line bg-white hover:bg-chalk'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
