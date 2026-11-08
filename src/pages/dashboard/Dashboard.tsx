import { collection, query, where } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, ShieldCheck, UserCog, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { useCollection } from '../../lib/data';
import { todayISO } from '../../lib/eligibility';
import { ROLE_LABELS, type Match, type Player, type Staff } from '../../lib/types';
import { formatDate } from '../../components/MatchCard';
import { Button, LinkButton, PageHeader, Skeleton } from '../../components/ui';
import { MatchRow, TeamCrest } from '../../components/scores';

function Stat({ label, value, loading, to, icon: Icon }: { label: string; value: number; loading: boolean; to: string; icon: LucideIcon }) {
  return (
    <Link to={to} className="block rounded-xl border border-line/70 border-t-4 border-t-pitch bg-white p-3 shadow-sm hover:border-t-gold">
      <div className="flex items-center justify-between gap-2 text-ink-soft"><span className="text-xs font-bold uppercase tracking-wide">{label}</span><Icon className="size-4 shrink-0" aria-hidden /></div>
      {loading ? <Skeleton className="mt-2 h-10 w-16" /> : <div className="num mt-1 text-5xl leading-none text-ink">{value}</div>}
    </Link>
  );
}

function Action({ to, title, detail, count }: { to: string; title: string; detail: string; count?: number }) {
  return (
    <Link to={to} className="flex min-h-14 items-center gap-3 border-t border-line/70 px-4 py-2 first:border-t-0 hover:bg-pitch-50/60">
      {count != null && <span aria-hidden className="num flex size-9 shrink-0 items-center justify-center rounded-md bg-gold text-lg text-ink">{count}</span>}
      <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className="block text-sm text-ink-soft">{detail}</span></span>
      <ArrowRight className="size-5 shrink-0 text-pitch" aria-hidden />
    </Link>
  );
}

function MatchDay({ match }: { match: Match }) {
  const live = match.status === 'live';
  const scored = live;
  return (
    <section aria-label="Match day" className="mb-4 overflow-hidden rounded-xl bg-night text-white shadow-sm">
      <div className="flex items-center justify-between gap-3 bg-night-2 px-4 py-2 text-xs font-bold uppercase tracking-wider">
        <span>Match day</span>
        {live ? <span className="rounded bg-live px-2 py-0.5 text-white">Live</span> : <span className="text-white/80">{formatDate(match.date)} · {match.kickoff}</span>}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-5">
        <div className="flex min-w-0 flex-col items-center gap-2 text-center"><TeamCrest name={match.homeName} size="lg" /><span className="break-words text-sm font-semibold">{match.homeName}</span></div>
        <div className="num min-w-20 text-center text-4xl md:text-5xl">{scored ? `${match.homeScore} - ${match.awayScore}` : 'v'}</div>
        <div className="flex min-w-0 flex-col items-center gap-2 text-center"><TeamCrest name={match.awayName} size="lg" /><span className="break-words text-sm font-semibold">{match.awayName}</span></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
        <span className="text-xs text-white/80">{match.ageGroup} · {match.competition} · {match.venue}, {match.town}</span>
        <LinkButton to={`/app/matches/${match.id}`} variant="gold" size="sm">{live ? 'Open live match' : 'Open match'}</LinkButton>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const { appUser } = useAuth();
  const role = appUser?.role;
  const sid = appUser?.schoolId ?? null;
  const unionLevel = role === 'union_admin' || role === 'registrar';
  const registers = role === 'school_admin' || role === 'coach' || role === 'manager';

  const players = useCollection<Player>(() => {
    if (unionLevel) return query(collection(db, 'players'), where('status', '==', 'pending'));
    if (registers && sid) return query(collection(db, 'players'), where('schoolId', '==', sid));
    return null;
  }, [unionLevel, registers, sid]);
  const staff = useCollection<Staff>(() => {
    if (unionLevel) return query(collection(db, 'staff'), where('status', '==', 'pending'));
    if (registers && sid) return query(collection(db, 'staff'), where('schoolId', '==', sid));
    return null;
  }, [unionLevel, registers, sid]);
  const matches = useCollection<Match>(() => query(collection(db, 'matches'), where('status', 'in', ['scheduled', 'live'])), []);

  if (!appUser) return null;
  const today = todayISO();
  const upcoming = matches.data.filter((m) => m.date >= today || m.status === 'live')
    .filter((m) => unionLevel || sid === null || m.schoolIds.includes(sid));
  const live = upcoming.filter((m) => m.status === 'live');
  const sorted = [...upcoming].sort((a, b) => (a.status === 'live' ? 0 : 1) - (b.status === 'live' ? 0 : 1) || (a.date + a.kickoff).localeCompare(b.date + b.kickoff));
  const featured = sorted[0];
  const loadError = players.error ?? staff.error ?? matches.error;
  const count = (list: { status: string }[], s: string) => list.filter((p) => p.status === s).length;

  return (
    <div>
      <PageHeader title={`Welcome, ${appUser.displayName.split(' ')[0]}`} subtitle={ROLE_LABELS[appUser.role]} />
      {loadError && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/40 bg-red-50 p-3 text-sm text-red-900">
          <span>Some numbers could not be loaded. {loadError}</span>
          <Button size="sm" variant="secondary" onClick={() => { players.retry(); staff.retry(); matches.retry(); }}>Try again</Button>
        </div>
      )}
      {featured && <MatchDay match={featured} />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {unionLevel ? (
          <>
            <Stat label="Players awaiting verification" value={players.data.length} loading={players.loading} to="/app/verification" icon={ShieldCheck} />
            <Stat label="Staff awaiting verification" value={staff.data.length} loading={staff.loading} to="/app/verification" icon={UserCog} />
          </>
        ) : registers ? (
          <>
            <Stat label="Verified players" value={count(players.data, 'verified')} loading={players.loading} to="/app/players" icon={Users} />
            <Stat label="Players to finish or fix" value={count(players.data, 'draft') + count(players.data, 'rejected')} loading={players.loading} to="/app/players" icon={Users} />
          </>
        ) : null}
        <Stat label="Upcoming matches" value={upcoming.length} loading={matches.loading} to="/app/matches" icon={CalendarDays} />
        <Stat label="Live now" value={live.length} loading={matches.loading} to="/app/matches" icon={CalendarDays} />
      </div>

      <h2 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wider text-pitch">Needs attention</h2>
      <div className="overflow-hidden rounded-xl border border-line/70 bg-white shadow-sm">
        {unionLevel && players.data.length + staff.data.length > 0 && (
          <Action to="/app/verification" title="Review the verification queue" count={players.data.length + staff.data.length} detail={`${players.data.length} players and ${staff.data.length} staff are waiting.`} />
        )}
        {unionLevel && <Action to="/app/sheets" title="Review team sheets" detail="Approve or return submitted sheets before kickoff." />}
        {registers && count(players.data, 'rejected') > 0 && (
          <Action to="/app/players" title="Fix rejected registrations" count={count(players.data, 'rejected')} detail={`${count(players.data, 'rejected')} players were returned with a reason.`} />
        )}
        {registers && count(players.data, 'draft') > 0 && (
          <Action to="/app/players" title="Finish draft registrations" count={count(players.data, 'draft')} detail={`${count(players.data, 'draft')} drafts need documents or consent before submission.`} />
        )}
        {registers && <Action to="/app/players/new" title="Register a player" detail="Photo, ID document and guardian consent are required." />}
        {registers && upcoming.length > 0 && <Action to="/app/matches" title="Prepare team sheets" count={upcoming.length} detail={`${upcoming.length} upcoming matches.`} />}
        {role === 'scorer' && <Action to="/app/matches" title="Score a match" detail={live.length ? `${live.length} match live now.` : 'Open a match to record scoring.'} />}
        {role === 'union_admin' && <Action to="/app/users" title="Invite people" detail="Registrars, school administrators and scorers." />}
        {role === 'school_admin' && <Action to="/app/users" title="Invite coaches and managers" detail="Give your staff access to your school." />}
      </div>

      {sorted.length > 1 && (
        <>
          <h2 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wider text-pitch">Upcoming</h2>
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            {sorted.slice(1, 6).map((m) => <MatchRow key={m.id} match={m} to={`/app/matches/${m.id}`} showDate />)}
          </div>
        </>
      )}
    </div>
  );
}
