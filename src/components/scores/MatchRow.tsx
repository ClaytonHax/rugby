import { Link } from 'react-router-dom';
import type { Match } from '../../lib/types';
import { formatDate } from '../MatchCard';
import { TeamCrest } from './TeamCrest';

const STATUS_WORD = { scheduled: 'Scheduled', live: 'Live', final: 'Full time', cancelled: 'Cancelled' } as Record<string, string>;

/** Flashscore-style stacked row. Whole row is the link. */
export function MatchRow({ match, to, showDate = false }: { match: Match; to?: string; showDate?: boolean }) {
  const scored = match.status === 'final' || match.status === 'live';
  const final = match.status === 'final';
  const homeWon = final && match.homeScore > match.awayScore;
  const awayWon = final && match.awayScore > match.homeScore;
  const word = STATUS_WORD[match.status] ?? match.status;
  const name = `${match.homeName} v ${match.awayName}${scored ? `, ${match.homeScore} - ${match.awayScore}` : `, ${formatDate(match.date)} ${match.kickoff}`}, ${word}`;
  const side = (won: boolean, lost: boolean) => (won ? 'font-bold text-ink' : lost ? 'text-ink-soft' : 'font-medium text-ink');
  return (
    <Link to={to ?? `/matches/${match.id}`} className="flex min-h-14 items-center gap-3 border-t border-line/70 px-3 py-2 hover:bg-pitch-50/60 first:border-t-0">
      <span className="sr-only">{name}</span>
      <span aria-hidden className="flex w-12 shrink-0 flex-col items-center text-center text-xs leading-tight">
        {match.status === 'live' ? <span className="font-bold text-live">LIVE</span>
          : final ? <span className="font-semibold text-ink-soft">FT</span>
          : match.status === 'cancelled' ? <span className="font-semibold text-gold-dark">CAN</span>
          : <span className="font-semibold text-ink">{match.kickoff}</span>}
        {showDate && <span className="mt-0.5 text-ink-soft">{formatDate(match.date, false).replace(/ \d{4}$/, '')}</span>}
      </span>
      <span aria-hidden className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <span className={`flex min-w-0 items-center gap-2 ${side(homeWon, awayWon)}`}><TeamCrest name={match.homeName} size="sm" /><span className="truncate">{match.homeName}</span></span>
        <span className={`flex min-w-0 items-center gap-2 ${side(awayWon, homeWon)}`}><TeamCrest name={match.awayName} size="sm" /><span className="truncate">{match.awayName}</span></span>
      </span>
      <span aria-hidden className="num flex w-8 shrink-0 flex-col items-end gap-1 text-base leading-5">
        <span className={match.status === 'live' ? 'text-live' : side(homeWon, awayWon)}>{scored ? match.homeScore : '-'}</span>
        <span className={match.status === 'live' ? 'text-live' : side(awayWon, homeWon)}>{scored ? match.awayScore : '-'}</span>
      </span>
      <span aria-hidden className="hidden w-44 shrink-0 truncate border-l border-line pl-3 text-xs text-ink-soft md:block">{match.venue}, {match.town}</span>
    </Link>
  );
}
