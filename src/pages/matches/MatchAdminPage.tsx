import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { ClipboardList, Eye, Play } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { setStatus } from '../../lib/matches';
import type { Match, TeamSheet } from '../../lib/types';
import { formatDate } from '../../components/MatchCard';
import { Button, Card, ConfirmDialog, EmptyState, LinkButton, PageHeader, SkeletonList, useToast } from '../../components/ui';
import { SheetEntries, SheetStatusBadge } from './SheetView';

function SheetCard({ match, teamId, name, schoolId }: { match: Match; teamId: string; name: string; schoolId: string }) {
  const { appUser } = useAuth();
  const sheet = useDoc<TeamSheet>(() => doc(db, 'matches', match.id, 'sheets', teamId), [match.id, teamId]);
  const [open, setOpen] = useState(false);
  const role = appUser?.role;
  const unionLevel = role === 'union_admin' || role === 'registrar';
  const mine = appUser?.schoolId === schoolId;
  const canEdit = (mine && (role === 'school_admin' || role === 'coach' || role === 'manager')) || unionLevel;
  const s = sheet.data;
  const canSeeSheet = unionLevel || role === 'scorer' || (appUser?.schoolId != null && match.schoolIds.includes(appUser.schoolId));
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{name}</p>
          <p className="text-xs text-ink-soft">{s ? `${s.entries.length} players` : 'No sheet yet'}</p>
        </div>
        <SheetStatusBadge status={s?.status ?? null} />
      </div>
      {s?.reviewNote && s.status === 'rejected' && <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-danger">Registrar note: {s.reviewNote}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {canEdit && match.status !== 'final' && (
          <LinkButton to={`/app/matches/${match.id}/sheet/${teamId}`} size="sm" variant={mine ? 'primary' : 'secondary'} icon={<ClipboardList className="size-4" />}>
            {s ? (s.status === 'draft' || s.status === 'submitted' ? 'Edit sheet' : 'View sheet') : 'Build sheet'}
          </LinkButton>
        )}
        {s && canSeeSheet && (
          <Button size="sm" variant="secondary" icon={<Eye className="size-4" />} onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'View'} line-up</Button>
        )}
      </div>
      {open && s && <div className="mt-3"><SheetEntries entries={s.entries} showOverAge={mine || unionLevel} /></div>}
    </Card>
  );
}

export default function MatchAdminPage() {
  const { id = '' } = useParams();
  const { appUser } = useAuth();
  const toast = useToast();
  const match = useDoc<Match>(() => doc(db, 'matches', id), [id]);
  const [confirm, setConfirm] = useState<null | 'cancel' | 'reopen'>(null);
  if (match.loading) return <SkeletonList />;
  if (!match.data) return <EmptyState title="Match not found" description={match.error ?? undefined} />;
  const m = match.data;
  const role = appUser?.role;
  const unionLevel = role === 'union_admin' || role === 'registrar';
  const canScore = unionLevel || role === 'scorer' || (appUser?.schoolId != null && m.schoolIds.includes(appUser.schoolId));
  const showSheets = role !== undefined && (unionLevel || role === 'scorer' || (appUser?.schoolId != null && m.schoolIds.includes(appUser.schoolId)));

  function change(status: Match['status'], msg: string) {
    setConfirm(null);
    setStatus(m, status).catch((e) => toast.error(e instanceof Error ? e.message : 'Could not update the match.'));
    toast.toast(msg);
  }

  return (
    <div>
      <PageHeader title={`${m.homeName} v ${m.awayName}`} subtitle={`${m.ageGroup} · ${m.competition} · ${formatDate(m.date)} ${m.kickoff}`} backTo="/app/matches"
        actions={<Link className="text-sm font-semibold text-pitch underline" to={`/matches/${m.id}`}>Public page</Link>} />
      <Card className="mb-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
          <span className="font-semibold">{m.homeName}</span>
          <span className="num text-5xl">{m.homeScore} - {m.awayScore}</span>
          <span className="font-semibold">{m.awayName}</span>
        </div>
        <p className="mt-2 text-center text-sm text-ink-soft">{m.venue}, {m.town}{m.referee ? ` · Referee ${m.referee}` : ''} · {m.status}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {canScore && m.status !== 'final' && m.status !== 'cancelled' && (
            <LinkButton to={`/app/matches/${m.id}/score`} variant="gold" icon={<Play className="size-4" />}>{m.status === 'live' ? 'Continue scoring' : 'Score match'}</LinkButton>
          )}
          {canScore && m.status === 'scheduled' && <Button variant="secondary" onClick={() => setConfirm('cancel')}>Cancel match</Button>}
          {role === 'union_admin' && (m.status === 'final' || m.status === 'cancelled') && <Button variant="secondary" onClick={() => setConfirm('reopen')}>Reopen match</Button>}
        </div>
      </Card>
      {showSheets ? (
        <div className="grid gap-3 md:grid-cols-2">
          <SheetCard match={m} teamId={m.homeTeamId} name={m.homeName} schoolId={m.schoolIds[0]} />
          <SheetCard match={m} teamId={m.awayTeamId} name={m.awayName} schoolId={m.schoolIds[1]} />
        </div>
      ) : (
        <p className="text-sm text-ink-soft">Team sheets are visible to staff of the two schools and the union.</p>
      )}
      <ConfirmDialog open={confirm === 'cancel'} title="Cancel this match?" message="It will show as cancelled on the public site."
        confirmLabel="Cancel match" cancelLabel="Keep" tone="danger" onConfirm={() => change('cancelled', 'Match cancelled.')} onCancel={() => setConfirm(null)} />
      <ConfirmDialog open={confirm === 'reopen'} title="Reopen this match?" message="It goes back to live so the score can be corrected. This is recorded in the audit log."
        confirmLabel="Reopen" onConfirm={() => change('live', 'Match reopened.')} onCancel={() => setConfirm(null)} />
    </div>
  );
}
