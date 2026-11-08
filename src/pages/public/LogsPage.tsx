import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AGE_GROUPS } from '../../lib/types';
import type { AgeGroup } from '../../lib/types';
import { computeStandings } from '../../lib/standings';
import { useMatchesByStatus } from '../../lib/useMatches';
import { FormChips, TeamCrest, formByTeam, useAgeFilter } from '../../components/scores';
import { EmptyState, ErrorState, PageHeader, Select, SkeletonList, Tabs } from '../../components/ui';

export default function LogsPage() {
  const { data, loading, error, retry } = useMatchesByStatus(['final'], 'asc');
  const seasons = useMemo(() => [...new Set([new Date().getFullYear(), ...data.map((m) => m.season)])].sort((a, b) => b - a), [data]);
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [picked, setAge] = useAgeFilter();
  const age: AgeGroup = picked ?? 'U16';
  const scoped = useMemo(() => data.filter((m) => String(m.season) === season && m.ageGroup === age), [data, season, age]);
  const rows = useMemo(() => computeStandings(scoped), [scoped]);
  const form = useMemo(() => formByTeam(scoped), [scoped]);
  const th = 'w-8 px-0.5 py-3 text-right sm:w-12 sm:px-2';
  return (
    <div>
      <PageHeader title="Logs" subtitle="Win 4, draw 2, loss 0. Final matches only." />
      <div className="mb-3 max-w-[10rem]">
        <Select label="Season" value={season} onChange={(e) => setSeason(e.target.value)} options={seasons.map((s) => ({ value: String(s), label: String(s) }))} />
      </div>
      <Tabs idBase="log-age" label="Age group" tabs={AGE_GROUPS.map((a) => ({ key: a, label: a }))} value={age} onChange={setAge} />
      <div role="tabpanel" id="log-age-panel" aria-labelledby={`log-age-${age}`}>
        {loading ? <SkeletonList /> : error ? <ErrorState title="Could not load logs" description={error} onRetry={retry} />
          : rows.length === 0 ? <EmptyState title="No finished matches" description={`There are no final ${age} results for ${season} yet.`} />
          : (
            <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
              <table className="w-full table-fixed text-sm">
                <caption className="sr-only">{age} log for {season}</caption>
                <thead className="border-b border-line bg-band text-xs uppercase tracking-wider text-pitch">
                  <tr>
                    <th scope="col" className="w-8 px-1.5 py-3 text-left sm:w-10 sm:px-3"><span aria-hidden>#</span><span className="sr-only">Position</span></th><th scope="col" className="px-1.5 py-3 text-left sm:px-3">Team</th>
                    {['P', 'W', 'D', 'L', 'PF', 'PA', 'PD'].map((h) => <th key={h} scope="col" className={th}>{h}</th>)}
                    <th scope="col" className={`${th} pr-2 text-pitch`}>Pts</th>
                    <th scope="col" className="hidden w-36 px-3 py-3 text-left sm:table-cell">Form</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.teamId} className="border-b border-line/70 last:border-0">
                      <td className={`num border-l-4 px-1.5 py-3 text-base sm:px-3 ${i < 3 ? 'border-gold' : 'border-transparent'}`}>{i + 1}</td>
                      <td className="break-words px-1.5 py-3 font-semibold sm:px-3"><span className="flex items-center gap-2"><span className="hidden sm:inline-flex"><TeamCrest name={r.name} size="sm" /></span>{r.name}</span></td>
                      {[r.played, r.won, r.drawn, r.lost, r.pf, r.pa, r.pd].map((v, j) => <td key={j} className="num px-0.5 py-3 text-right text-base sm:px-2">{v}</td>)}
                      <td className="num px-0.5 py-3 pr-2 text-right text-xl font-bold text-pitch sm:px-2">{r.points}</td>
                      <td className="hidden px-3 py-3 sm:table-cell"><FormChips results={form.get(r.teamId) ?? []} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
      {!loading && !error && rows.length > 0 && <p className="mt-3 text-xs text-ink-soft">Form shows the last five results, oldest first. <Link to={`/results?age=${encodeURIComponent(age)}`} className="font-semibold text-pitch underline">See results</Link></p>}
    </div>
  );
}
