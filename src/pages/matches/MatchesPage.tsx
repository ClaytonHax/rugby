import { useMemo, useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useMatchesByStatus } from '../../lib/useMatches';
import { useSessionState } from '../../lib/useSessionState';
import { MatchRow } from '../../components/scores';
import { EmptyState, ErrorState, LinkButton, PageHeader, Select, SkeletonList, Tabs } from '../../components/ui';
import { AGE_GROUPS, type MatchStatus } from '../../lib/types';

type Tab = 'upcoming' | 'results';
const STATUS: Record<Tab, MatchStatus[]> = { upcoming: ['scheduled', 'live'], results: ['final', 'cancelled'] };

export default function MatchesPage() {
  const { appUser } = useAuth();
  const [tab, setTab] = useSessionState<Tab>('matches.tab', 'upcoming');
  const [age, setAge] = useState('');
  const matches = useMatchesByStatus(STATUS[tab], tab === 'upcoming' ? 'asc' : 'desc');
  const canCreate = appUser && appUser.role !== 'scorer' && appUser.role !== undefined;
  const list = age ? matches.data.filter((m) => m.ageGroup === age) : matches.data;

  const groups = useMemo(() => {
    const g = new Map<string, typeof list>();
    for (const m of list) g.set(m.competition, [...(g.get(m.competition) ?? []), m]);
    return [...g.entries()];
  }, [list]);

  return (
    <div>
      <PageHeader title="Matches" subtitle="Open a match to build team sheets or score it."
        actions={canCreate && <LinkButton to="/app/matches/new" icon={<Plus className="size-4" />}>New match</LinkButton>} />
      <Tabs idBase="matches" label="Matches" value={tab} onChange={setTab}
        tabs={[{ key: 'upcoming', label: 'Upcoming and live' }, { key: 'results', label: 'Results' }]} />
      <div role="tabpanel" id="matches-panel" aria-labelledby={`matches-${tab}`}>
        {matches.data.length > 4 && (
          <div className="mb-4 max-w-xs">
            <Select label="Age group" value={age} onChange={(e) => setAge(e.target.value)} placeholder="All age groups" options={AGE_GROUPS.map((a) => ({ value: a, label: a }))} />
          </div>
        )}
        {matches.loading ? <SkeletonList /> : matches.error ? <ErrorState title="Could not load matches" description={matches.error} onRetry={matches.retry} />
          : list.length === 0 ? (
            age ? <EmptyState title={`No ${age} matches`} description="Try another age group." action={<button type="button" className="min-h-11 font-semibold text-pitch underline" onClick={() => setAge('')}>Show all age groups</button>} />
            : <EmptyState icon={<CalendarDays className="size-10" />} title={tab === 'upcoming' ? 'No upcoming matches' : 'No results yet'}
              description={tab === 'upcoming' && canCreate ? 'Schedule a match to start building team sheets.' : undefined}
              action={tab === 'upcoming' && canCreate ? <LinkButton to="/app/matches/new">New match</LinkButton> : undefined} />
          ) : (
            <div className="overflow-hidden rounded-xl bg-white shadow-sm">
              {groups.map(([comp, rows]) => (
                <section key={comp} aria-label={comp}>
                  <h2 className="flex min-h-10 items-center bg-band px-3 font-sans text-xs font-bold uppercase tracking-wider text-pitch">{comp}</h2>
                  {rows.map((m) => <MatchRow key={m.id} match={m} to={`/app/matches/${m.id}`} showDate />)}
                </section>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
