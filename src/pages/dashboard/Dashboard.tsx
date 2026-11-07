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
import { Button, Card, PageHeader, Skeleton } from '../../components/ui';

function Stat({ label, value, loading, to, icon: Icon }: { label: string; value: number; loading: boolean; to: string; icon: LucideIcon }) {
  return (
    <Link to={to} className="block rounded-xl border border-line bg-white p-4 hover:border-pitch">
      <div className="flex items-center justify-between text-ink-soft"><span className="text-sm">{label}</span><Icon className="size-5" aria-hidden /></div>
      {loading ? <Skeleton className="mt-2 h-10 w-16" /> : <div className="num mt-1 text-5xl text-ink">{value}</div>}
    </Link>
  );
}

function Action({ to, title, detail }: { to: string; title: string; detail: string }) {
  return (
    <Link to={to} className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 hover:border-pitch">
      <span><span className="block font-semibold">{title}</span><span className="block text-sm text-ink-soft">{detail}</span></span>
      <ArrowRight className="size-5 shrink-0 text-pitch" aria-hidden />
    </Link>
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

      <h2 className="mb-2 mt-8 text-2xl">Next actions</h2>
      <div className="flex flex-col gap-2">
        {unionLevel && players.data.length + staff.data.length > 0 && (
          <Action to="/app/verification" title="Review the verification queue" detail={`${players.data.length} players and ${staff.data.length} staff are waiting.`} />
        )}
        {unionLevel && <Action to="/app/sheets" title="Review team sheets" detail="Approve or return submitted sheets before kickoff." />}
        {registers && count(players.data, 'rejected') > 0 && (
          <Action to="/app/players" title="Fix rejected registrations" detail={`${count(players.data, 'rejected')} players were returned with a reason.`} />
        )}
        {registers && count(players.data, 'draft') > 0 && (
          <Action to="/app/players" title="Finish draft registrations" detail={`${count(players.data, 'draft')} drafts need documents or consent before submission.`} />
        )}
        {registers && <Action to="/app/players/new" title="Register a player" detail="Photo, ID document and guardian consent are required." />}
        {registers && upcoming.length > 0 && <Action to="/app/matches" title="Prepare team sheets" detail={`${upcoming.length} upcoming matches.`} />}
        {role === 'scorer' && <Action to="/app/matches" title="Score a match" detail={live.length ? `${live.length} match live now.` : 'Open a match to record scoring.'} />}
        {role === 'union_admin' && <Action to="/app/users" title="Invite people" detail="Registrars, school administrators and scorers." />}
        {role === 'school_admin' && <Action to="/app/users" title="Invite coaches and managers" detail="Give your staff access to your school." />}
      </div>

      {upcoming.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-2xl">Upcoming</h2>
          <Card padded={false} className="divide-y divide-line">
            {[...upcoming].sort((a, b) => (a.date + a.kickoff).localeCompare(b.date + b.kickoff)).slice(0, 5).map((m) => (
              <Link key={m.id} to={`/app/matches/${m.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 hover:bg-chalk">
                <span className="min-w-0 font-semibold">{m.homeName} v {m.awayName}</span>
                <span className="shrink-0 text-sm text-ink-soft">{formatDate(m.date)}, {m.kickoff}</span>
              </Link>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
