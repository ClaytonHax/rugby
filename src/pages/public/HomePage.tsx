import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { useMatchesByStatus } from '../../lib/useMatches';
import { computeStandings } from '../../lib/standings';
import type { Match } from '../../lib/types';
import { formatDate } from '../../components/MatchCard';
import { DateStrip, MatchGroups, StatusPills, TeamCrest, useAgeFilter } from '../../components/scores';
import type { StatusFilter } from '../../components/scores';
import { useAuth } from '../../lib/auth';
import { Button, EmptyState, ErrorState, LinkButton, SkeletonList } from '../../components/ui';

const panel = 'overflow-hidden rounded-xl bg-white shadow-sm';
const panelHead = 'flex min-h-10 items-center justify-between gap-3 bg-band px-3 text-xs font-bold uppercase tracking-wider text-pitch';

function Ticker({ matches }: { matches: Match[] }) {
  const live = matches.filter((m) => m.status === 'live');
  const items = live.length ? live : matches.filter((m) => m.status === 'scheduled').slice(0, 6);
  if (!items.length) return null;
  return (
    <section aria-label={live.length ? 'Live now' : 'Up next'} className="mb-3 flex items-center overflow-hidden rounded-xl bg-night text-white">
      <span className={`flex min-h-14 shrink-0 items-center px-3 text-xs font-bold uppercase tracking-wider ${live.length ? 'bg-live' : 'bg-night-2'}`}>{live.length ? 'Live' : 'Up next'}</span>
      <ul className="no-scrollbar flex min-w-0 flex-1 overflow-x-auto">
        {items.map((m) => (
          <li key={m.id} className="shrink-0 border-r border-white/10">
            <Link to={`/matches/${m.id}`} className="flex min-h-14 items-center gap-2 px-3 text-sm hover:bg-night-2 focus-visible:outline-white">
              <TeamCrest name={m.homeName} size="sm" />
              <span className="max-w-32 truncate">{m.homeName}</span>
              <span className="num px-1 text-base">{live.length ? `${m.homeScore} - ${m.awayScore}` : m.kickoff}</span>
              <span className="max-w-32 truncate">{m.awayName}</span>
              <TeamCrest name={m.awayName} size="sm" />
              {!live.length && <span className="text-xs text-white/70">{formatDate(m.date, false).replace(/ \d{4}$/, '')}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function HomePage() {
  const { data, loading, error, retry } = useMatchesByStatus(['scheduled', 'live', 'final'], 'asc');
  const { appUser } = useAuth();
  const [age] = useAgeFilter();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [date, setDate] = useState<string | null>(null);
  const [comp, setComp] = useState<string | null>(null);
  const byAge = useMemo(() => (age ? data.filter((m) => m.ageGroup === age) : data), [data, age]);
  const comps = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of byAge) c.set(m.competition, (c.get(m.competition) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [byAge]);
  const byComp = useMemo(() => (comp ? byAge.filter((m) => m.competition === comp) : byAge), [byAge, comp]);
  const counts = useMemo(() => ({ all: byComp.length, live: byComp.filter((m) => m.status === 'live').length, scheduled: byComp.filter((m) => m.status === 'scheduled').length, final: byComp.filter((m) => m.status === 'final').length }), [byComp]);
  const byStatus = useMemo(() => (status === 'all' ? byComp : byComp.filter((m) => m.status === status)), [byComp, status]);
  const dates = useMemo(() => [...new Set(byStatus.map((m) => m.date))], [byStatus]);
  const list = useMemo(() => {
    const l = date ? byStatus.filter((m) => m.date === date) : byStatus;
    const rank = (m: Match) => (m.status === 'live' ? 0 : m.status === 'scheduled' ? 1 : 2);
    return [...l].sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? (b.date + b.kickoff).localeCompare(a.date + a.kickoff) : (a.date + a.kickoff).localeCompare(b.date + b.kickoff))).slice(0, 80);
  }, [byStatus, date]);
  const log = useMemo(() => {
    const finals = byAge.filter((m) => m.status === 'final');
    if (!finals.length) return null;
    const season = Math.max(...finals.map((m) => m.season));
    const inSeason = finals.filter((m) => m.season === season);
    const tally = new Map<string, number>();
    for (const m of inSeason) tally.set(m.ageGroup, (tally.get(m.ageGroup) ?? 0) + 1);
    const top = age ?? [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { age: top, season, rows: computeStandings(inSeason.filter((m) => m.ageGroup === top)).slice(0, 6) };
  }, [byAge, age]);
  const compBtn = (on: boolean) => `flex min-h-11 w-full items-center justify-between gap-2 border-l-4 px-3 text-left text-sm ${on ? 'border-gold bg-pitch-50 font-bold text-ink' : 'border-transparent text-ink hover:bg-pitch-50/60'}`;
  const filtered = status !== 'all' || date !== null || comp !== null;
  return (
    <div>
      <h1 className="sr-only">Tryline score centre: Zimbabwean school rugby fixtures and results</h1>
      <Ticker matches={data} />
      <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)_18rem]">
        <section aria-label="Competitions" className={`${panel} order-2 self-start lg:order-1`}>
          <h2 className={panelHead}>Competitions</h2>
          {loading ? <div className="p-3"><SkeletonList rows={3} /></div> : (
            <ul>
              <li><button type="button" aria-pressed={comp === null} onClick={() => setComp(null)} className={compBtn(comp === null)}><span>All competitions</span><span className="num text-xs text-ink-soft">{byAge.length}</span></button></li>
              {comps.map(([c, n]) => (
                <li key={c}><button type="button" aria-pressed={comp === c} onClick={() => setComp(comp === c ? null : c)} className={compBtn(comp === c)}><span className="min-w-0 truncate">{c}</span><span className="num text-xs text-ink-soft">{n}</span></button></li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Matches" className="order-1 min-w-0 lg:order-2">
          {!loading && !error && data.length > 0 && (
            <div className="mb-3 flex flex-col gap-1 rounded-xl bg-white px-2 py-1 shadow-sm">
              <StatusPills value={status} onChange={setStatus} counts={counts} className="px-1 py-1" />
              <DateStrip dates={dates} value={date} onChange={setDate} />
            </div>
          )}
          {loading ? <SkeletonList rows={5} /> : error ? <ErrorState title="Could not load matches" description={error} onRetry={retry} />
            : data.length === 0 ? <EmptyState title="No matches yet" description="Fixtures and results appear here once a school or the union schedules them." />
            : list.length === 0 ? (
              <EmptyState title={filtered ? 'No matches here' : `No ${age} matches`} description={filtered ? 'Nothing matches these filters.' : 'Try another age group.'}
                action={filtered ? <Button variant="secondary" onClick={() => { setStatus('all'); setDate(null); setComp(null); }}>Show all</Button> : undefined} />
            ) : <MatchGroups matches={list} showDate />}
        </section>

        <div className="order-3 flex flex-col gap-4 self-start">
          <section aria-label="Log" className={panel}>
            <div className={panelHead}><h2 className="font-sans text-xs tracking-wider">{log ? `Log · ${log.age} ${log.season}` : 'Log'}</h2><Link to={`/logs${log ? `?age=${encodeURIComponent(log.age)}` : ''}`} className="inline-flex min-h-11 items-center font-semibold normal-case tracking-normal hover:underline">Full log</Link></div>
            {loading ? <div className="p-3"><SkeletonList rows={3} /></div> : !log ? <p className="p-3 text-sm text-ink-soft">The log appears once matches finish.</p> : (
              <table className="w-full text-sm">
                <caption className="sr-only">{log.age} top teams, {log.season}</caption>
                <thead className="sr-only"><tr><th scope="col">Position</th><th scope="col">Team</th><th scope="col">Played</th><th scope="col">Points</th></tr></thead>
                <tbody>
                  {log.rows.map((r, i) => (
                    <tr key={r.teamId} className="border-t border-line/70 first:border-0">
                      <td className={`num w-8 border-l-4 py-2 pl-2 ${i < 3 ? 'border-gold' : 'border-transparent'}`}>{i + 1}</td>
                      <td className="max-w-0 truncate py-2 pr-2 font-medium">{r.name}</td>
                      <td className="num w-7 py-2 text-right text-ink-soft">{r.played}</td>
                      <td className="num w-10 py-2 pr-3 text-right text-base font-bold text-pitch">{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section aria-label="For schools and unions" className="rounded-xl bg-night p-4 text-white">
            <Building2 className="size-6 text-gold" aria-hidden />
            <h2 className="mt-2 text-2xl">For schools and unions</h2>
            <p className="mt-1 text-sm text-white/80">One trusted record of who can play: verified registration, rule-checked team sheets and live scoring from the touchline.</p>
            <LinkButton to={appUser ? '/app' : '/login'} variant="gold" className="mt-3">{appUser ? 'Open the app' : 'Sign in'}</LinkButton>
          </section>
        </div>
      </div>
    </div>
  );
}
