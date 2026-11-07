import { useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useMatchesByStatus } from '../../lib/useMatches';
import { MatchCard } from '../../components/MatchCard';
import { EmptyState, LinkButton, PageHeader, SkeletonList } from '../../components/ui';
import type { MatchStatus } from '../../lib/types';

type Tab = 'upcoming' | 'results';
const STATUS: Record<Tab, MatchStatus[]> = { upcoming: ['scheduled', 'live'], results: ['final', 'cancelled'] };

export default function MatchesPage() {
  const { appUser } = useAuth();
  const [tab, setTab] = useState<Tab>('upcoming');
  const matches = useMatchesByStatus(STATUS[tab], tab === 'upcoming' ? 'asc' : 'desc');
  const canCreate = appUser && appUser.role !== 'scorer' && appUser.role !== undefined;

  return (
    <div>
      <PageHeader title="Matches" subtitle="Open a match to build team sheets or score it."
        actions={canCreate && <LinkButton to="/app/matches/new" icon={<Plus className="size-4" />}>New match</LinkButton>} />
      <div role="tablist" className="mb-4 flex gap-2">
        {(['upcoming', 'results'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${tab === t ? 'bg-pitch text-white' : 'border border-line bg-white'}`}>
            {t === 'upcoming' ? 'Upcoming and live' : 'Results'}
          </button>
        ))}
      </div>
      {matches.loading ? <SkeletonList /> : matches.error ? <EmptyState title="Could not load matches" description={matches.error} /> : matches.data.length === 0 ? (
        <EmptyState icon={<CalendarDays className="size-10" />} title={tab === 'upcoming' ? 'No upcoming matches' : 'No results yet'}
          description={tab === 'upcoming' && canCreate ? 'Schedule a match to start building team sheets.' : undefined}
          action={tab === 'upcoming' && canCreate ? <LinkButton to="/app/matches/new">New match</LinkButton> : undefined} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {matches.data.map((m) => <MatchCard key={m.id} match={m} to={`/app/matches/${m.id}`} />)}
        </div>
      )}
    </div>
  );
}
