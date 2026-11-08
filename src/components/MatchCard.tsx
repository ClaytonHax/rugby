import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import type { Match } from '../lib/types';
import { Badge } from './ui';
import { TeamCrest } from './scores/TeamCrest';

/** "Sat, 7 Nov 2026" from a YYYY-MM-DD string. Every date in the app is shown this way (en-GB). */
export function formatDate(iso: string, weekday = true): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { ...(weekday ? { weekday: 'short' as const } : {}), day: 'numeric', month: 'short', year: 'numeric' });
}

export function MatchCard({ match, to }: { match: Match; to?: string }) {
  const showScore = match.status === 'final' || match.status === 'live';
  return (
    <Link to={to ?? `/matches/${match.id}`} className="block rounded-xl bg-white p-4 shadow-sm hover:bg-pitch-50/60">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        <span>{match.ageGroup} · {match.competition}</span>
        {match.status === 'live' && <span className="rounded-full bg-live px-2.5 py-0.5 text-xs font-bold text-white">Live</span>}
        {match.status === 'final' && <Badge>Full time</Badge>}
        {match.status === 'cancelled' && <Badge tone="amber">Cancelled</Badge>}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className="flex min-w-0 items-center justify-end gap-2 text-right font-semibold"><span className="min-w-0 break-words">{match.homeName}</span><TeamCrest name={match.homeName} size="md" /></span>
        <span className="num min-w-20 text-center text-3xl">{showScore ? `${match.homeScore} - ${match.awayScore}` : 'v'}</span>
        <span className="flex min-w-0 items-center gap-2 font-semibold"><TeamCrest name={match.awayName} size="md" /><span className="min-w-0 break-words">{match.awayName}</span></span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 text-xs text-ink-soft">
        <span>{formatDate(match.date)} · {match.kickoff}</span>
        <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{match.venue}, {match.town}</span>
      </div>
    </Link>
  );
}
