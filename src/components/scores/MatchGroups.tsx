import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Match } from '../../lib/types';
import { MatchRow } from './MatchRow';

/** Matches grouped by competition under tinted band headers, inside one white panel. */
export function MatchGroups({ matches, showDate = false, className = '' }: { matches: Match[]; showDate?: boolean; className?: string }) {
  const groups = useMemo(() => {
    const m = new Map<string, Match[]>();
    for (const x of matches) m.set(x.competition, [...(m.get(x.competition) ?? []), x]);
    return [...m.entries()];
  }, [matches]);
  return (
    <div className={`overflow-hidden rounded-xl bg-white shadow-sm ${className}`}>
      {groups.map(([comp, list]) => (
        <section key={comp} aria-label={comp}>
          <div className="flex min-h-10 items-center justify-between gap-3 bg-band px-3 text-xs font-bold uppercase tracking-wider text-pitch">
            <h3 className="truncate font-sans text-xs tracking-wider">{comp}</h3>
            <Link to="/logs" className="inline-flex min-h-11 shrink-0 items-center font-semibold normal-case tracking-normal underline-offset-2 hover:underline">Log</Link>
          </div>
          {list.map((m) => <MatchRow key={m.id} match={m} showDate={showDate} />)}
        </section>
      ))}
    </div>
  );
}
