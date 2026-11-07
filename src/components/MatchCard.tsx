import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import type { Match } from '../lib/types';
import { Badge } from './ui';

/** "Sat, 7 Nov 2026" from a YYYY-MM-DD string. Every date in the app is shown this way (en-GB). */
export function formatDate(iso: string, weekday = true): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { ...(weekday ? { weekday: 'short' as const } : {}), day: 'numeric', month: 'short', year: 'numeric' });
}

export function MatchCard({ match, to }: { match: Match; to?: string }) {
  const showScore = match.status === 'final' || match.status === 'live';
  return (
    <Link to={to ?? `/matches/${match.id}`} className="block rounded-xl border border-line bg-white p-4 hover:border-pitch">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
        <span>{match.ageGroup} · {match.competition}</span>
        {match.status === 'live' && <Badge tone="red">Live</Badge>}
        {match.status === 'final' && <Badge>Full time</Badge>}
        {match.status === 'cancelled' && <Badge tone="amber">Cancelled</Badge>}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className="min-w-0 break-words text-right font-semibold">{match.homeName}</span>
        <span className="num min-w-20 text-center text-3xl">{showScore ? `${match.homeScore} - ${match.awayScore}` : 'v'}</span>
        <span className="min-w-0 break-words font-semibold">{match.awayName}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 text-xs text-ink-soft">
        <span>{formatDate(match.date)} · {match.kickoff}</span>
        <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{match.venue}, {match.town}</span>
      </div>
    </Link>
  );
}
