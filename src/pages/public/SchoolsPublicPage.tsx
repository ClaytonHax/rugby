import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSchools } from '../../lib/data';
import { TeamCrest } from '../../components/scores';
import { EmptyState, ErrorState, Input, PageHeader, SkeletonList } from '../../components/ui';

export default function SchoolsPublicPage() {
  const { data, loading, error, retry } = useSchools();
  const [q, setQ] = useState('');
  const [prov, setProv] = useState<string | null>(null);
  const provinces = useMemo(() => [...new Set(data.map((s) => s.province).filter(Boolean))].sort(), [data]);
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const m = new Map<string, typeof data>();
    for (const s of [...data].sort((a, b) => a.name.localeCompare(b.name))) {
      if (prov && s.province !== prov) continue;
      if (needle && !`${s.name} ${s.town} ${s.province}`.toLowerCase().includes(needle)) continue;
      m.set(s.province || 'Other', [...(m.get(s.province || 'Other') ?? []), s]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data, q, prov]);
  const chip = (on: boolean) => `min-h-11 shrink-0 rounded-full px-4 text-xs font-bold uppercase tracking-wide ${on ? 'bg-pitch text-white' : 'bg-gray-200 text-ink hover:bg-gray-300'}`;
  return (
    <div>
      <PageHeader title="Schools" subtitle="Member schools in the competition." />
      <div className="mb-4 flex flex-col gap-3 rounded-xl bg-white p-3 shadow-sm">
        <div className="max-w-sm"><Input label="Search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, town or province" /></div>
        {provinces.length > 1 && (
          <div role="group" aria-label="Province" className="no-scrollbar flex gap-2 overflow-x-auto">
            <button type="button" aria-pressed={prov === null} onClick={() => setProv(null)} className={chip(prov === null)}>All provinces</button>
            {provinces.map((p) => <button key={p} type="button" aria-pressed={prov === p} onClick={() => setProv(prov === p ? null : p)} className={chip(prov === p)}>{p}</button>)}
          </div>
        )}
      </div>
      {loading ? <SkeletonList /> : error ? <ErrorState title="Could not load schools" description={error} onRetry={retry} />
        : groups.length === 0 ? <EmptyState title="No schools found" description={data.length ? 'Try a different search.' : 'Schools appear here once the union adds them.'} />
        : (
          <div className="flex flex-col gap-4">
            {groups.map(([province, list]) => (
              <section key={province} aria-label={province} className="overflow-hidden rounded-xl bg-white shadow-sm">
                <h2 className="flex min-h-10 items-center bg-band px-3 font-sans text-xs font-bold uppercase tracking-wider text-pitch">{province} <span className="num ml-2 font-semibold text-ink-soft">{list.length}</span></h2>
                <ul className="grid sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((s) => (
                    <li key={s.id} className="border-t border-line/70">
                      <Link to={`/schools/${s.id}`} className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-pitch-50/60">
                        <TeamCrest name={s.name} size="md" />
                        <span className="min-w-0"><span className="block truncate font-semibold">{s.name}</span><span className="block truncate text-xs text-ink-soft">{s.town}</span></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
    </div>
  );
}
