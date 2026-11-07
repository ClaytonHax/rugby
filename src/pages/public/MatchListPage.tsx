import { useState } from 'react';
import type { MatchStatus } from '../../lib/types';
import { AGE_GROUPS } from '../../lib/types';
import { useMatchesByStatus } from '../../lib/useMatches';
import { MatchCard } from '../../components/MatchCard';
import { EmptyState, PageHeader, Select, SkeletonList } from '../../components/ui';

export function MatchListPage({ title, subtitle, statuses, order, emptyTitle, emptyText }: {
  title: string; subtitle: string; statuses: MatchStatus[]; order: 'asc' | 'desc'; emptyTitle: string; emptyText: string;
}) {
  const { data, loading, error } = useMatchesByStatus(statuses, order);
  const [age, setAge] = useState('');
  const list = age ? data.filter((m) => m.ageGroup === age) : data;
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="mb-4 max-w-xs">
        <Select label="Age group" value={age} onChange={(e) => setAge(e.target.value)} placeholder="All age groups" options={AGE_GROUPS.map((a) => ({ value: a, label: a }))} />
      </div>
      {loading ? <SkeletonList /> : error ? <EmptyState title="Could not load matches" description={error} />
        : list.length === 0 ? <EmptyState title={emptyTitle} description={emptyText} />
        : <div className="grid gap-3 md:grid-cols-2">{list.map((m) => <MatchCard key={m.id} match={m} />)}</div>}
    </div>
  );
}
