import { collection, doc, query, where } from 'firebase/firestore';
import { useParams } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { useCollection, useDoc } from '../../lib/data';
import type { Match, School, Team } from '../../lib/types';
import { MatchCard } from '../../components/MatchCard';
import { Card, EmptyState, ErrorState, PageHeader, SkeletonList } from '../../components/ui';

export default function SchoolPublicPage() {
  const { id = '' } = useParams();
  const school = useDoc<School>(() => doc(db, 'schools', id), [id]);
  const teams = useCollection<Team>(() => query(collection(db, 'teams'), where('schoolId', '==', id)), [id]);
  const matches = useCollection<Match>(() => query(collection(db, 'matches'), where('schoolIds', 'array-contains', id)), [id]);
  if (school.loading) return <SkeletonList rows={2} />;
  if (school.error) return <ErrorState page title="Could not load this school" description={school.error} onRetry={school.retry} />;
  if (!school.data) return <EmptyState page title="School not found" description="This school is not in the directory." />;
  const sorted = [...matches.data].sort((a, b) => (b.date + b.kickoff).localeCompare(a.date + a.kickoff));
  return (
    <div>
      <PageHeader title={school.data.name} subtitle={`${school.data.town}, ${school.data.province}`} backTo="/schools" backLabel="Back to schools" />
      <h2 className="mb-2 text-2xl">Teams</h2>
      <Card className="mb-8">
        {teams.data.length === 0 ? <p className="text-sm text-ink-soft">No teams listed yet.</p>
          : <ul className="flex flex-wrap gap-2">{teams.data.map((t) => <li key={t.id} className="rounded-full bg-pitch-50 px-3 py-1 text-sm font-medium text-pitch">{t.name} ({t.season})</li>)}</ul>}
      </Card>
      <h2 className="mb-2 text-2xl">Matches</h2>
      {matches.loading ? <SkeletonList rows={2} /> : sorted.length === 0 ? <EmptyState title="No matches yet" description="Fixtures and results for this school appear here." /> : <div className="grid gap-3 md:grid-cols-2">{sorted.map((m) => <MatchCard key={m.id} match={m} />)}</div>}
    </div>
  );
}
