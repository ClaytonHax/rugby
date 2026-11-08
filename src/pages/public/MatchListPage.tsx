import { useMemo, useState } from 'react';
import type { MatchStatus } from '../../lib/types';
import { useMatchesByStatus } from '../../lib/useMatches';
import { DateStrip, MatchGroups, StatusPills, useAgeFilter } from '../../components/scores';
import type { StatusFilter } from '../../components/scores';
import { Button, EmptyState, ErrorState, PageHeader, SkeletonList } from '../../components/ui';

export function MatchListPage({ title, subtitle, statuses, order, emptyTitle, emptyText }: {
  title: string; subtitle: string; statuses: MatchStatus[]; order: 'asc' | 'desc'; emptyTitle: string; emptyText: string;
}) {
  const { data, loading, error, retry } = useMatchesByStatus(statuses, order);
  const [age] = useAgeFilter();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [date, setDate] = useState<string | null>(null);
  const byAge = useMemo(() => {
    const l = age ? data.filter((m) => m.ageGroup === age) : data;
    return order === 'asc' ? [...l].sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live')) : l;
  }, [data, age, order]);
  const counts = useMemo(() => ({ all: byAge.length, live: byAge.filter((m) => m.status === 'live').length, scheduled: byAge.filter((m) => m.status === 'scheduled').length, final: byAge.filter((m) => m.status === 'final').length }), [byAge]);
  const byStatus = useMemo(() => (status === 'all' ? byAge : byAge.filter((m) => m.status === status)), [byAge, status]);
  const dates = useMemo(() => [...new Set(byStatus.map((m) => m.date))], [byStatus]);
  const list = date ? byStatus.filter((m) => m.date === date) : byStatus;
  const filtered = status !== 'all' || date !== null;
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      {!loading && !error && data.length > 0 && (
        <div className="mb-3 flex flex-col gap-1 rounded-xl bg-white px-2 py-1 shadow-sm">
          {statuses.length > 1 && <StatusPills value={status} onChange={setStatus} counts={counts} hide={statuses.includes('final') ? [] : ['final']} className="px-1 py-1" />}
          <DateStrip dates={dates} value={date} onChange={setDate} />
        </div>
      )}
      {loading ? <SkeletonList /> : error ? <ErrorState title="Could not load matches" description={error} onRetry={retry} />
        : list.length === 0 ? (
          <EmptyState title={filtered ? 'No matches here' : age ? `No ${age} matches` : emptyTitle}
            description={filtered ? 'Nothing matches these filters.' : age ? 'Try another age group.' : emptyText}
            action={filtered ? <Button variant="secondary" onClick={() => { setStatus('all'); setDate(null); }}>Show all</Button> : undefined} />
        ) : <MatchGroups matches={list} showDate />}
    </div>
  );
}
