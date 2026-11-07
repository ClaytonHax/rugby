import { useMemo, useState } from 'react';
import { AGE_GROUPS } from '../../lib/types';
import { computeStandings } from '../../lib/standings';
import { useMatchesByStatus } from '../../lib/useMatches';
import { EmptyState, PageHeader, Select, SkeletonList } from '../../components/ui';

export default function LogsPage() {
  const { data, loading, error } = useMatchesByStatus(['final'], 'asc');
  const seasons = useMemo(() => [...new Set([new Date().getFullYear(), ...data.map((m) => m.season)])].sort((a, b) => b - a), [data]);
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [age, setAge] = useState('U16');
  const rows = useMemo(() => computeStandings(data.filter((m) => String(m.season) === season && m.ageGroup === age)), [data, season, age]);
  return (
    <div>
      <PageHeader title="Logs" subtitle="Win 4, draw 2, loss 0. Final matches only." />
      <div className="mb-4 grid max-w-md grid-cols-2 gap-3">
        <Select label="Season" value={season} onChange={(e) => setSeason(e.target.value)} options={seasons.map((s) => ({ value: String(s), label: String(s) }))} />
        <Select label="Age group" value={age} onChange={(e) => setAge(e.target.value)} options={AGE_GROUPS.map((a) => ({ value: a, label: a }))} />
      </div>
      {loading ? <SkeletonList /> : error ? <EmptyState title="Could not load logs" description={error} />
        : rows.length === 0 ? <EmptyState title="No finished matches" description={`There are no final ${age} results for ${season} yet.`} />
        : (
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="border-b border-line bg-chalk text-xs uppercase text-ink-soft">
                <tr>
                  <th className="px-3 py-3 text-left">#</th><th className="px-3 py-3 text-left">Team</th>
                  {['P', 'W', 'D', 'L', 'PF', 'PA', 'PD', 'Pts'].map((h) => <th key={h} scope="col" className="px-2 py-3 text-right">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.teamId} className="border-b border-line last:border-0">
                    <td className="num px-3 py-3 text-base">{i + 1}</td>
                    <td className="px-3 py-3 font-semibold">{r.name}</td>
                    {[r.played, r.won, r.drawn, r.lost, r.pf, r.pa, r.pd].map((v, j) => <td key={j} className="num px-2 py-3 text-right text-base">{v}</td>)}
                    <td className="num px-2 py-3 text-right text-xl text-pitch">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
