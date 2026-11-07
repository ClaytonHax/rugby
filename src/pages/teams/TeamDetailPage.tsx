import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, query, where } from 'firebase/firestore';
import { AlertTriangle, Download, Plus, UserMinus, UserPlus } from 'lucide-react';
import { db } from '../../lib/firebase';
import { friendlyError, useCollection, useDoc, useSettings } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { isOverAge, todayISO } from '../../lib/eligibility';
import {
  addPlayerToRoster, addStaff, downloadText, OverAgeError, removePlayerFromRoster, removeStaff, squadCsv,
} from '../../lib/teams';
import { STAFF_ROLE_LABELS, type Player, type Staff, type Team, type TeamRoster } from '../../lib/types';
import { formatDate } from '../../components/MatchCard';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader, SkeletonList, StatusBadge, useToast } from '../../components/ui';

type Mode = null | 'player' | 'staff';

export default function TeamDetailPage() {
  const { id = '' } = useParams();
  const { appUser } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const team = useDoc<Team>(() => doc(db, 'teams', id), [id]);
  const roster = useDoc<TeamRoster>(() => doc(db, 'teamRosters', id), [id]);
  const schoolId = team.data?.schoolId ?? null;
  const players = useCollection<Player>(() => (schoolId ? query(collection(db, 'players'), where('schoolId', '==', schoolId)) : null), [schoolId]);
  const staff = useCollection<Staff>(() => (schoolId ? query(collection(db, 'staff'), where('schoolId', '==', schoolId)) : null), [schoolId]);

  const [mode, setMode] = useState<Mode>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [overAgeError, setOverAgeError] = useState<OverAgeError | null>(null);
  const [removing, setRemoving] = useState<{ kind: 'player' | 'staff'; id: string; name: string } | null>(null);

  const today = todayISO();
  const canEdit = appUser?.role !== 'scorer' && (appUser?.schoolId === schoolId || appUser?.role === 'union_admin' || appUser?.role === 'registrar');
  const playerIds = useMemo(() => roster.data?.playerIds ?? [], [roster.data]);
  const staffIds = useMemo(() => roster.data?.staffIds ?? [], [roster.data]);
  const inSquad = useMemo(() => players.data.filter((p) => playerIds.includes(p.id)).sort((a, b) => a.lastName.localeCompare(b.lastName)), [players.data, playerIds]);
  const staffInTeam = useMemo(() => staff.data.filter((s) => staffIds.includes(s.id)), [staff.data, staffIds]);
  const overAge = inSquad.filter((p) => isOverAge(p.dob, today, settings));
  const over = overAge.length > settings.maxOverAge;

  const q = search.trim().toLowerCase();
  const candidates = useMemo(() => {
    const list: Array<Player | Staff> = mode === 'player'
      ? players.data.filter((p) => !playerIds.includes(p.id))
      : mode === 'staff' ? staff.data.filter((s) => !staffIds.includes(s.id)) : [];
    return list
      .filter((p) => !q || `${p.firstName} ${p.lastName}`.toLowerCase().includes(q))
      .sort((a, b) => Number(b.status === 'verified') - Number(a.status === 'verified') || a.lastName.localeCompare(b.lastName));
  }, [mode, players.data, staff.data, playerIds, staffIds, q]);

  async function run(key: string, fn: () => Promise<void>, done: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(done);
      setRemoving(null);
    } catch (e) {
      if (e instanceof OverAgeError) setOverAgeError(e);
      else toast.error(friendlyError(e, 'That change could not be saved. Check your connection and try again.'));
    } finally {
      setBusy(null);
    }
  }

  if (team.loading || roster.loading) return <SkeletonList />;
  if (team.error) return <ErrorState page title="Could not open this team" description={team.error} onRetry={team.retry} />;
  if (!team.data) return <EmptyState page title="Team not found" description="It may have been removed." />;
  const t = team.data;

  return (
    <div>
      <PageHeader title={t.name} subtitle={`${t.ageGroup} · Season ${t.season}`} backTo="/app/teams" backLabel="Back to teams"
        actions={<Button variant="secondary" icon={<Download className="size-4" />} disabled={inSquad.length === 0}
          onClick={() => downloadText(`${t.name.replace(/[^a-z0-9]+/gi, '-')}-squad.csv`, squadCsv(t, inSquad, settings))}>Export squad CSV</Button>} />

      <Card className={`mb-5 ${over ? 'border-danger bg-red-50' : ''}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink-soft">Over-age players (older than {settings.overAgeYears} today)</p>
            <p className={`num text-5xl ${over || overAge.length === settings.maxOverAge ? 'text-danger' : 'text-pitch'}`} aria-label={`${overAge.length} of ${settings.maxOverAge} over-age`}>
              {overAge.length}/{settings.maxOverAge}
            </p>
          </div>
          <div className="text-right text-sm text-ink-soft">
            <p><span className="num text-2xl text-ink">{inSquad.length}</span> players</p>
            <p><span className="num text-2xl text-ink">{staffInTeam.length}</span> staff</p>
          </div>
        </div>
        {overAge.length > 0 && <p className="mt-2 text-sm">Over-age: {overAge.map((p) => `${p.firstName} ${p.lastName}`).join(', ')}.</p>}
        {roster.error && !roster.data && <p className="mt-2 text-sm text-danger">This team has no squad record yet. Adding a player will create it.</p>}
      </Card>

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-2xl">Players</h2>
          {canEdit && <Button size="sm" icon={<UserPlus className="size-4" />} onClick={() => { setSearch(''); setMode('player'); }}>Add player</Button>}
        </div>
        {inSquad.length === 0 ? (
          <EmptyState title="No players in this squad" description="Add verified players from your register." />
        ) : (
          <ul className="flex flex-col gap-2">
            {inSquad.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-3">
                <div className="min-w-0">
                  <Link to={`/app/players/${p.id}`} className="inline-flex min-h-11 items-center font-semibold hover:underline">{p.firstName} {p.lastName}</Link>
                  <p className="text-xs text-ink-soft">{p.position} · born {formatDate(p.dob, false)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isOverAge(p.dob, today, settings) && <Badge tone="gold">Over-age</Badge>}
                  {p.status !== 'verified' && <StatusBadge status={p.status} />}
                  {canEdit && (
                    <Button size="sm" variant="ghost" className="min-w-11" aria-label={`Remove ${p.firstName} ${p.lastName} from the squad`} loading={busy === p.id} disabled={busy !== null}
                      onClick={() => setRemoving({ kind: 'player', id: p.id, name: `${p.firstName} ${p.lastName}` })}><UserMinus className="size-4" aria-hidden /></Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-2xl">Staff</h2>
          {canEdit && <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => { setSearch(''); setMode('staff'); }}>Add staff</Button>}
        </div>
        {staffInTeam.length === 0 ? (
          <EmptyState title="No staff assigned" description="Add the coach and manager from your verified staff." />
        ) : (
          <ul className="flex flex-col gap-2">
            {staffInTeam.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-3">
                <div className="min-w-0">
                  <Link to={`/app/staff/${s.id}`} className="inline-flex min-h-11 items-center font-semibold hover:underline">{s.firstName} {s.lastName}</Link>
                  <p className="text-xs text-ink-soft">{STAFF_ROLE_LABELS[s.staffRole]}</p>
                </div>
                {canEdit && (
                  <Button size="sm" variant="ghost" className="min-w-11" aria-label={`Remove ${s.firstName} ${s.lastName} from the team`} loading={busy === s.id} disabled={busy !== null}
                    onClick={() => setRemoving({ kind: 'staff', id: s.id, name: `${s.firstName} ${s.lastName}` })}><UserMinus className="size-4" aria-hidden /></Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={mode !== null} onClose={() => setMode(null)} title={mode === 'player' ? 'Add players' : 'Add staff'}>
        <Input label="Search by name" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <ul className="mt-3 flex flex-col gap-2">
          {candidates.length === 0 && <li className="text-sm text-ink-soft">No one else to add. <Link className="font-semibold text-pitch underline" to={mode === 'player' ? '/app/players/new' : '/app/staff/new'}>Register someone new</Link></li>}
          {candidates.map((p) => {
            const ok = p.status === 'verified';
            return (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-line p-2.5">
                <div className="min-w-0">
                  <p className="font-semibold">{p.firstName} {p.lastName}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <StatusBadge status={p.status} />
                    {mode === 'player' && ok && isOverAge(p.dob, today, settings) && <Badge tone="gold">Over-age</Badge>}
                  </div>
                </div>
                {ok ? (
                  <Button size="sm" loading={busy === p.id} disabled={busy !== null}
                    aria-label={`Add ${p.firstName} ${p.lastName}`}
                    onClick={() => run(p.id, () => (mode === 'player' ? addPlayerToRoster(t.id, p.id, settings) : addStaff(t.id, p.id)),
                      `${p.firstName} ${p.lastName} added to ${mode === 'player' ? 'the squad' : 'the team'}.`)}>Add</Button>
                ) : (
                  <Link className="text-sm font-semibold text-pitch underline" to={`/app/${mode === 'player' ? 'players' : 'staff'}/${p.id}`}>Finish registration</Link>
                )}
              </li>
            );
          })}
        </ul>
      </Modal>

      <ConfirmDialog open={removing !== null} title={removing?.kind === 'player' ? 'Remove from the squad?' : 'Remove from the team?'} tone="danger"
        confirmLabel="Remove" loading={busy !== null}
        message={removing?.kind === 'player'
          ? `${removing.name} will leave this squad and can no longer be picked for its team sheets. They stay on your school's register and can be added back, if the over-age limit allows.`
          : `${removing?.name} will no longer be listed as staff for this team. Their record stays on your school's register.`}
        onCancel={() => setRemoving(null)}
        onConfirm={() => { if (removing) void run(removing.id, () => (removing.kind === 'player' ? removePlayerFromRoster(t.id, removing.id) : removeStaff(t.id, removing.id)), `${removing.name} removed.`); }} />

      <Modal open={overAgeError !== null} onClose={() => setOverAgeError(null)} title="Over-age limit reached"
        footer={<Button onClick={() => setOverAgeError(null)}>OK</Button>}>
        <div className="flex gap-3">
          <AlertTriangle className="size-6 shrink-0 text-danger" aria-hidden />
          <div className="text-sm">
            <p>A squad can have at most <strong>{overAgeError?.max}</strong> over-age players. Adding this player would make it {overAgeError?.playerNames.length}.</p>
            <p className="mt-2 font-semibold">Over-age players:</p>
            <ul className="list-disc pl-5">{overAgeError?.playerNames.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        </div>
      </Modal>
    </div>
  );
}
