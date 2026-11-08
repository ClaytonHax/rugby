export type FormResult = 'W' | 'D' | 'L';
const WORD = { W: 'Won', D: 'Drew', L: 'Lost' } as const;
const TONE = { W: 'bg-green-700 text-white', D: 'bg-gray-600 text-white', L: 'bg-red-700 text-white' } as const;

/** Last 5 results, oldest first, as lettered chips. */
export function FormChips({ results, className = '' }: { results: FormResult[]; className?: string }) {
  const last = results.slice(-5);
  return (
    <span role="img" aria-label={last.length ? `Last ${last.length}: ${last.map((r) => WORD[r]).join(', ')}` : 'No results yet'} className={`inline-flex gap-1 ${className}`}>
      {last.map((r, i) => <span key={i} aria-hidden className={`num inline-flex size-5 items-center justify-center rounded text-xs ${TONE[r]}`}>{r}</span>)}
    </span>
  );
}
