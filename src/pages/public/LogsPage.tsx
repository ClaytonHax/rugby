import { useMemo, useState } from 'react';
import { AGE_GROUPS } from '../../lib/types';
import { computeStandings } from '../../lib/standings';
import { useMatchesByStatus } from '../../lib/useMatches';
import { EmptyState, ErrorState, PageHeader, Select, SkeletonList } from '../../components/ui';

export default function LogsPage() {
  const { data, loading, error, retry } = useMatchesByStatus(['final'], 'asc');
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
      {loading ? <SkeletonList /> : error ? <ErrorState title="Could not load logs" description={error} onRetry={retry} />
        : rows.length === 0 ? <EmptyState title="No finished matches" description={`There are no final ${age} results for ${season} yet.`} />
        : (
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full table-fixed text-sm">
              <caption className="sr-only">{age} log for {season}</caption>
              <thead className="border-b border-line bg-chalk text-xs uppercase text-ink-soft">
                <tr>
                  <th scope="col" className="w-7 px-1.5 py-3 text-left sm:w-10 sm:px-3"><span aria-hidden>#</span><span className="sr-only">Position</span></th><th scope="col" className="px-1.5 py-3 text-left sm:px-3">Team</th>
                  {['P', 'W', 'D', 'L', 'PF', 'PA', 'PD', 'Pts'].map((h) => <th key={h} scope="col" className="w-8 px-0.5 py-3 text-right last:pr-2 sm:w-12 sm:px-2">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.teamId} className="border-b border-line last:border-0">
                    <td className="num px-1.5 py-3 text-base sm:px-3">{i + 1}</td>
                    <td className="break-words px-1.5 py-3 font-semibold sm:px-3">{r.name}</td>
                    {[r.played, r.won, r.drawn, r.lost, r.pf, r.pa, r.pd].map((v, j) => <td key={j} className="num px-0.5 py-3 text-right text-base sm:px-2">{v}</td>)}
                    <td className="num px-0.5 py-3 pr-2 text-right text-xl text-pitch sm:px-2">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
