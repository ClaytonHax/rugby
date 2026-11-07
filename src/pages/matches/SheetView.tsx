import type { SheetEntry, SheetStatus } from '../../lib/types';
import { Badge, type BadgeTone } from '../../components/ui';

const TONE: Record<SheetStatus, { tone: BadgeTone; label: string }> = {
  draft: { tone: 'neutral', label: 'Draft' },
  submitted: { tone: 'amber', label: 'Submitted' },
  approved: { tone: 'green', label: 'Approved' },
  rejected: { tone: 'red', label: 'Rejected' },
};

export function SheetStatusBadge({ status }: { status: SheetStatus | null }) {
  if (!status) return <Badge>Not started</Badge>;
  return <Badge tone={TONE[status].tone}>{TONE[status].label}</Badge>;
}

/** Read-only list of a sheet: jersey, name, position. Optionally flags over-age and captain. */
export function SheetEntries({ entries, showOverAge = false }: { entries: SheetEntry[]; showOverAge?: boolean }) {
  const sorted = [...entries].sort((a, b) => a.jersey - b.jersey);
  return (
    <ol className="divide-y divide-line rounded-xl border border-line bg-white">
      {sorted.map((e) => (
        <li key={`${e.jersey}-${e.playerId}`} className="flex items-center gap-3 px-3 py-2">
          <span className="num w-9 shrink-0 text-center text-2xl text-pitch">{e.jersey}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{e.name}{e.isCaptain && <span className="ml-2 text-xs font-bold text-gold-dark">(C)</span>}</p>
            <p className="text-xs text-ink-soft">{e.position}{e.jersey > 15 ? ' · replacement' : ''}</p>
          </div>
          {showOverAge && e.overAge && <Badge tone="gold">Over-age</Badge>}
        </li>
      ))}
    </ol>
  );
}
