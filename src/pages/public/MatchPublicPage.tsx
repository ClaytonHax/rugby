import { useState } from 'react';
import { collection, doc } from 'firebase/firestore';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useCollection, useDoc } from '../../lib/data';
import { SCORE_POINTS, type Match, type ScoreEvent, type ScoreType } from '../../lib/types';
import { formatDate } from '../../components/MatchCard';
import { TeamCrest } from '../../components/scores';
import { EmptyState, ErrorState, SkeletonList, Tabs, useDocumentTitle } from '../../components/ui';

const LABEL: Record<ScoreType, string> = { try: 'Try', conversion: 'Conversion', penalty: 'Penalty', drop_goal: 'Drop goal', penalty_try: 'Penalty try' };
const ROWS: Array<[ScoreType, string]> = [['try', 'Tries'], ['conversion', 'Conversions'], ['penalty', 'Penalties'], ['drop_goal', 'Drop goals'], ['penalty_try', 'Penalty tries']];
type Tab = 'summary' | 'timeline';

export default function MatchPublicPage() {
  const { id = '' } = useParams();
  const match = useDoc<Match>(() => doc(db, 'matches', id), [id]);
  const events = useCollection<ScoreEvent>(() => collection(db, 'matches', id, 'events'), [id]);
  const [picked, setTab] = useState<Tab | null>(null);
  const m = match.data;
  useDocumentTitle(m ? `${m.homeName} v ${m.awayName}` : null);
  if (match.loading) return <SkeletonList rows={2} />;
  if (match.error) return <ErrorState page title="Could not load this match" description={match.error} onRetry={match.retry} />;
  if (!m) return <EmptyState page title="Match not found" description="This match does not exist." />;
  const list = [...events.data].sort((a, b) => a.minute - b.minute || (a.createdAt?.toMillis() ?? Infinity) - (b.createdAt?.toMillis() ?? Infinity));
  const showScore = m.status === 'live' || m.status === 'final';
  const tab = picked ?? (showScore ? 'timeline' : 'summary');
  const back = m.status === 'final' ? { to: '/results', label: 'Back to results' } : { to: '/fixtures', label: 'Back to fixtures' };
  const chip = m.status === 'live' ? { t: 'Live', c: 'bg-live text-white' } : m.status === 'final' ? { t: 'Full time', c: 'bg-white/15 text-white' } : m.status === 'cancelled' ? { t: 'Cancelled', c: 'bg-gold text-ink' } : { t: `Kickoff ${m.kickoff}`, c: 'bg-gold text-ink' };
  const count = (teamId: string, type: ScoreType) => list.filter((e) => e.teamId === teamId && e.type === type).length;
  const side = (name: string) => (
    <span aria-hidden className="flex min-w-0 flex-col items-center gap-2 text-center">
      <TeamCrest name={name} size="xl" />
      <span className="font-display text-lg font-bold leading-tight md:text-2xl">{name}</span>
    </span>
  );
  return (
    <div>
      <section className="mb-4 overflow-hidden rounded-xl bg-night text-white">
        <div className="px-4 pb-6 pt-2 md:px-8">
          <Link to={back.to} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-white/80 hover:text-white hover:underline"><ArrowLeft className="size-4" aria-hidden /> {back.label}</Link>
          <h1 className="sr-only">{m.homeName} v {m.awayName}</h1>
          <p className="mb-4 text-center text-xs font-bold uppercase tracking-wider text-white/80">{m.ageGroup} · {m.competition}</p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-8">
            {side(m.homeName)}
            <div className="flex flex-col items-center gap-2">
              <span aria-hidden className="num text-5xl leading-none md:text-7xl">{showScore ? `${m.homeScore} - ${m.awayScore}` : 'v'}</span>
              {showScore && <span className="sr-only">{`${m.homeScore} - ${m.awayScore}`}</span>}
              <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${chip.c}`}>{chip.t}</span>
            </div>
            {side(m.awayName)}
          </div>
          <p className="mt-4 text-center text-sm text-white/80">{formatDate(m.date)}, {m.kickoff} · {m.venue}, {m.town}</p>
        </div>
      </section>
      <div className="rounded-xl bg-white px-3 pt-2 shadow-sm md:px-5">
        <Tabs idBase="match" label="Match" tabs={[{ key: 'summary', label: 'Summary' }, { key: 'timeline', label: 'Timeline' }]} value={tab} onChange={setTab} fill />
        <div role="tabpanel" id="match-panel" aria-labelledby={`match-${tab}`} className="pb-5">
          {events.loading ? <SkeletonList rows={2} /> : events.error ? <ErrorState title="Could not load the scoring" description={events.error} onRetry={events.retry} />
            : tab === 'summary' ? (
              <div className="flex flex-col gap-5">
                {list.length > 0 && (
                  <table className="w-full text-sm">
                    <caption className="sr-only">Scoring summary</caption>
                    <thead><tr className="border-b border-line text-xs uppercase tracking-wider text-ink-soft">
                      <th scope="col" className="py-2 text-left font-bold">Score</th>
                      <th scope="col" className="w-1/4 py-2 text-right font-bold">{m.homeName}</th>
                      <th scope="col" className="w-1/4 py-2 text-right font-bold">{m.awayName}</th>
                    </tr></thead>
                    <tbody>
                      {ROWS.filter(([t]) => count(m.homeTeamId, t) + count(m.awayTeamId, t) > 0).map(([t, l]) => (
                        <tr key={t} className="border-b border-line/70 last:border-0">
                          <th scope="row" className="py-2 text-left font-medium">{l}</th>
                          <td className="num py-2 text-right text-base">{count(m.homeTeamId, t)}</td>
                          <td className="num py-2 text-right text-base">{count(m.awayTeamId, t)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
                  <dt className="text-ink-soft">Competition</dt><dd>{m.competition}</dd>
                  <dt className="text-ink-soft">Age group</dt><dd>{m.ageGroup}</dd>
                  <dt className="text-ink-soft">Date</dt><dd>{formatDate(m.date)}, {m.kickoff}</dd>
                  <dt className="text-ink-soft">Venue</dt><dd>{m.venue}, {m.town}</dd>
                  {m.referee && <><dt className="text-ink-soft">Referee</dt><dd>{m.referee}</dd></>}
                </dl>
                {list.length === 0 && <p className="text-sm text-ink-soft">{m.status === 'scheduled' ? 'Scoring appears here during the match.' : 'No points were recorded.'}</p>}
              </div>
            )
            : list.length === 0 ? <EmptyState title="No scoring yet" description={m.status === 'scheduled' ? 'Scoring appears here during the match.' : 'No points were recorded.'} />
            : (
              <ol className="relative flex flex-col before:absolute before:inset-y-0 before:left-1/2 before:w-px before:bg-line">
                {list.map((e) => {
                  const away = e.teamId === m.awayTeamId;
                  const body = (
                    <span className={`flex min-w-0 flex-col py-2 ${away ? 'items-start text-left' : 'items-end text-right'}`}>
                      <span className="font-semibold">{LABEL[e.type]}{e.playerDisplay ? ` · ${e.playerDisplay}` : ''}</span>
                      <span className="text-xs text-ink-soft">{away ? m.awayName : m.homeName} <span className="num text-sm font-bold text-pitch">+{SCORE_POINTS[e.type]}</span></span>
                    </span>
                  );
                  return (
                    <li key={e.id} className="relative grid grid-cols-[1fr_3.5rem_1fr] items-center gap-2">
                      {away ? <span /> : body}
                      <span className="num relative z-10 mx-auto rounded-full bg-night px-2 py-0.5 text-sm text-white">{e.minute}'</span>
                      {away ? body : <span />}
                    </li>
                  );
                })}
              </ol>
            )}
        </div>
      </div>
    </div>
  );
}
