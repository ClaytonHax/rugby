import type { KeyboardEvent } from 'react';

/** Underlined tabs. Pair with a panel: <div role="tabpanel" id={`${idBase}-panel`} aria-labelledby={`${idBase}-${value}`}>. */
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
    <div role="tablist" aria-label={label} className="no-scrollbar mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t, i) => (
        <button key={t.key} type="button" role="tab" id={`${idBase}-${t.key}`} aria-selected={value === t.key} aria-controls={`${idBase}-panel`}
          tabIndex={value === t.key ? 0 : -1} onClick={() => onChange(t.key)} onKeyDown={(e) => onKey(e, i)}
          className={`-mb-px min-h-11 shrink-0 border-b-[3px] px-4 text-sm font-bold uppercase tracking-wide ${fill ? 'flex-1' : ''} ${value === t.key ? 'border-gold text-ink' : 'border-transparent text-ink-soft hover:text-ink'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
