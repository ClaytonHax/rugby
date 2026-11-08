import { useMemo, useState } from 'react';
import { collection, doc, query, where } from 'firebase/firestore';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useCollection, useDoc } from '../../lib/data';
import type { Match, School, Team } from '../../lib/types';
import { FormChips, MatchGroups, TeamCrest } from '../../components/scores';
import type { FormResult } from '../../components/scores';
import { EmptyState, ErrorState, SkeletonList, useDocumentTitle } from '../../components/ui';

export default function SchoolPublicPage() {
  const { id = '' } = useParams();
  const school = useDoc<School>(() => doc(db, 'schools', id), [id]);
  const teams = useCollection<Team>(() => query(collection(db, 'teams'), where('schoolId', '==', id)), [id]);
  const matches = useCollection<Match>(() => query(collection(db, 'matches'), where('schoolIds', 'array-contains', id)), [id]);
  const [teamId, setTeamId] = useState<string | null>(null);
  useDocumentTitle(school.data?.name ?? null);
  const scoped = useMemo(() => (teamId ? matches.data.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId) : matches.data), [matches.data, teamId]);
  const { upcoming, recent, form } = useMemo(() => {
    const asc = [...scoped].sort((a, b) => (a.date + a.kickoff).localeCompare(b.date + b.kickoff));
    const mine = (m: Match) => (teamId ? m.homeTeamId === teamId : m.schoolIds[0] === id);
    const form: FormResult[] = asc.filter((m) => m.status === 'final').map((m) => {
      const d = mine(m) ? m.homeScore - m.awayScore : m.awayScore - m.homeScore;
      return d > 0 ? 'W' : d < 0 ? 'L' : 'D';
    });
    const isUp = (m: Match) => m.status === 'scheduled' || m.status === 'live';
    return { upcoming: asc.filter(isUp), recent: asc.filter((m) => !isUp(m)).reverse(), form };
  }, [scoped, teamId, id]);
  if (school.loading) return <SkeletonList rows={2} />;
  if (school.error) return <ErrorState page title="Could not load this school" description={school.error} onRetry={school.retry} />;
  if (!school.data) return <EmptyState page title="School not found" description="This school is not in the directory." />;
  const chip = (on: boolean) => `min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${on ? 'bg-pitch text-white' : 'bg-pitch-50 text-pitch hover:bg-band'}`;
  return (
    <div>
      <section className="mb-4 rounded-xl bg-night px-4 pb-6 pt-2 text-white md:px-8">
        <Link to="/schools" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-white/80 hover:text-white hover:underline"><ArrowLeft className="size-4" aria-hidden /> Back to schools</Link>
        <div className="flex items-center gap-4 md:gap-6">
          <TeamCrest name={school.data.name} size="xl" />
          <div className="min-w-0">
            <h1 className="text-3xl leading-tight md:text-5xl">{school.data.name}</h1>
            <p className="mt-1 text-sm text-white/80">{school.data.town}, {school.data.province}</p>
          </div>
        </div>
      </section>
      <section aria-label="Teams" className="mb-4 rounded-xl bg-white p-3 shadow-sm">
        <h2 className="mb-2 text-2xl">Teams</h2>
        {teams.data.length === 0 ? <p className="text-sm text-ink-soft">No teams listed yet.</p> : (
          <ul className="no-scrollbar flex gap-2 overflow-x-auto">
            <li><button type="button" aria-pressed={teamId === null} onClick={() => setTeamId(null)} className={chip(teamId === null)}>All teams</button></li>
            {teams.data.map((t) => <li key={t.id}><button type="button" aria-pressed={teamId === t.id} onClick={() => setTeamId(teamId === t.id ? null : t.id)} className={chip(teamId === t.id)}>{t.name} ({t.season})</button></li>)}
          </ul>
        )}
        {form.length > 0 && <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft">Form <FormChips results={form} /></p>}
      </section>
      {matches.loading ? <SkeletonList rows={2} /> : scoped.length === 0 ? <EmptyState title="No matches yet" description="Fixtures and results for this school appear here." /> : (
        <div className="flex flex-col gap-4">
          {upcoming.length > 0 && <section><h2 className="mb-2 text-2xl">Upcoming</h2><MatchGroups matches={upcoming} showDate /></section>}
          {recent.length > 0 && <section><h2 className="mb-2 text-2xl">Results</h2><MatchGroups matches={recent} showDate /></section>}
        </div>
      )}
    </div>
  );
}
