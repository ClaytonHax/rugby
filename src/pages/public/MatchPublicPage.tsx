import { collection, doc } from 'firebase/firestore';
import { useParams } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { useCollection, useDoc } from '../../lib/data';
import { SCORE_POINTS, type Match, type ScoreEvent, type ScoreType } from '../../lib/types';
import { formatDate } from '../../components/MatchCard';
import { Badge, Card, EmptyState, PageHeader, SkeletonList } from '../../components/ui';

const LABEL: Record<ScoreType, string> = { try: 'Try', conversion: 'Conversion', penalty: 'Penalty', drop_goal: 'Drop goal', penalty_try: 'Penalty try' };

export default function MatchPublicPage() {
  const { id = '' } = useParams();
  const match = useDoc<Match>(() => doc(db, 'matches', id), [id]);
  const events = useCollection<ScoreEvent>(() => collection(db, 'matches', id, 'events'), [id]);
  if (match.loading) return <SkeletonList rows={2} />;
  const m = match.data;
  if (!m) return <EmptyState title="Match not found" description={match.error ?? 'This match does not exist.'} />;
  const list = [...events.data].sort((a, b) => a.minute - b.minute);
  const showScore = m.status === 'live' || m.status === 'final';
  return (
    <div>
      <PageHeader title={`${m.homeName} v ${m.awayName}`} subtitle={`${m.ageGroup} · ${m.competition} · ${formatDate(m.date)}, ${m.kickoff} · ${m.venue}, ${m.town}`} backTo="/fixtures" />
      <Card className="mb-6 text-center">
        <div className="mb-2 flex justify-center">
          {m.status === 'live' ? <Badge tone="red">Live</Badge> : m.status === 'final' ? <Badge>Full time</Badge> : m.status === 'cancelled' ? <Badge tone="amber">Cancelled</Badge> : <Badge tone="gold">Kickoff {m.kickoff}</Badge>}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <span className="text-right font-display text-xl font-bold md:text-3xl">{m.homeName}</span>
          <span className="num text-6xl md:text-7xl">{showScore ? `${m.homeScore}-${m.awayScore}` : 'v'}</span>
          <span className="text-left font-display text-xl font-bold md:text-3xl">{m.awayName}</span>
        </div>
        {m.referee && <p className="mt-3 text-xs text-ink-soft">Referee: {m.referee}</p>}
      </Card>
      <h2 className="mb-2 text-2xl">Scoring</h2>
      {events.loading ? <SkeletonList rows={2} /> : list.length === 0
        ? <EmptyState title="No scoring yet" description={m.status === 'scheduled' ? 'Scoring appears here during the match.' : 'No points were recorded.'} />
        : (
          <ol className="flex flex-col gap-2">
            {list.map((e) => (
              <li key={e.id} className={`flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 ${e.teamId === m.awayTeamId ? 'flex-row-reverse text-right' : ''}`}>
                <span className="num w-12 text-2xl text-ink-soft">{e.minute}'</span>
                <span className="flex-1"><span className="block font-semibold">{LABEL[e.type]}{e.playerDisplay ? ` · ${e.playerDisplay}` : ''}</span>
                  <span className="text-xs text-ink-soft">{e.teamId === m.homeTeamId ? m.homeName : m.awayName}</span></span>
                <span className="num text-2xl text-pitch">+{SCORE_POINTS[e.type]}</span>
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}
