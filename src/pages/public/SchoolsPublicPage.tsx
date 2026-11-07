import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSchools } from '../../lib/data';
import { EmptyState, Input, PageHeader, SkeletonList } from '../../components/ui';

export default function SchoolsPublicPage() {
  const { data, loading, error } = useSchools();
  const [q, setQ] = useState('');
  const list = data.filter((s) => `${s.name} ${s.town} ${s.province}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader title="Schools" subtitle="Member schools in the competition." />
      <div className="mb-4 max-w-sm"><Input label="Search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, town or province" /></div>
      {loading ? <SkeletonList /> : error ? <EmptyState title="Could not load schools" description={error} />
        : list.length === 0 ? <EmptyState title="No schools found" description={data.length ? 'Try a different search.' : 'Schools appear here once the union adds them.'} />
        : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((s) => (
              <li key={s.id}>
                <Link to={`/schools/${s.id}`} className="block rounded-xl border border-line bg-white p-4 hover:border-pitch">
                  <span className="block text-xl font-bold font-display">{s.name}</span>
                  <span className="text-sm text-ink-soft">{s.town}, {s.province}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
