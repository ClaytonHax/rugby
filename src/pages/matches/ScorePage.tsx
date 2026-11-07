import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, query, where } from 'firebase/firestore';
import { CloudOff, Flag, RotateCcw, Square } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useCollection, useDoc } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { publicName } from '../../lib/eligibility';
import { addCard, addScoreEvent, deleteScoreEvent, setStatus } from '../../lib/matches';
import { SCORE_POINTS, type CardEvent, type Match, type Player, type ScoreEvent, type ScoreType, type TeamRoster, type TeamSheet } from '../../lib/types';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, SkeletonList, useToast } from '../../components/ui';

interface Option {
  id: string | null;
  label: string;
  display: string;
}
interface Side {
  options: Option[];
  source: 'sheet' | 'roster' | 'none';
}

const ACTIONS: Array<{ type: ScoreType; label: string }> = [
  { type: 'try', label: 'Try' },
  { type: 'conversion', label: 'Conversion' },
  { type: 'penalty', label: 'Penalty' },
  { type: 'drop_goal', label: 'Drop goal' },
  { type: 'penalty_try', label: 'Penalty try' },
];
const LABEL: Record<ScoreType, string> = {
  try: 'Try', conversion: 'Conversion', penalty: 'Penalty', drop_goal: 'Drop goal', penalty_try: 'Penalty try',
};

function displayFromFullName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length < 2 ? name.trim() : publicName(parts[0], parts.slice(1).join(' '));
}

/** Who can be credited: the sheet (submitted/approved), else the roster if the user may read it, else typed names. */
function useSide(matchId: string, teamId: string, schoolId: string): Side {
  const { appUser } = useAuth();
  const role = appUser?.role;
  const canReadPlayers = role === 'union_admin' || role === 'registrar'
    || ((role === 'school_admin' || role === 'coach' || role === 'manager') && appUser?.schoolId === schoolId);
  const sheet = useDoc<TeamSheet>(() => doc(db, 'matches', matchId, 'sheets', teamId), [matchId, teamId]);
  const useSheet = !!sheet.data && (sheet.data.status === 'submitted' || sheet.data.status === 'approved');
  const needRoster = !sheet.loading && !useSheet && canReadPlayers;
  const roster = useDoc<TeamRoster>(() => (needRoster ? doc(db, 'teamRosters', teamId) : null), [needRoster, teamId]);
  const players = useCollection<Player>(() => (needRoster ? query(collection(db, 'players'), where('schoolId', '==', schoolId)) : null), [needRoster, schoolId]);
  return useMemo<Side>(() => {
    if (useSheet && sheet.data) {
      return {
        source: 'sheet',
        options: [...sheet.data.entries].sort((a, b) => a.jersey - b.jersey)
          .map((e) => ({ id: e.playerId, label: `${e.jersey}  ${e.name}`, display: displayFromFullName(e.name) })),
      };
    }
    if (needRoster && roster.data) {
      const ids = new Set(roster.data.playerIds);
      return {
        source: 'roster',
        options: players.data.filter((p) => ids.has(p.id) && p.status === 'verified')
          .sort((a, b) => a.lastName.localeCompare(b.lastName))
          .map((p) => ({ id: p.id, label: `${p.firstName} ${p.lastName}`, display: publicName(p.firstName, p.lastName) })),
      };
    }
    return { source: 'none', options: [] };
  }, [useSheet, sheet.data, needRoster, roster.data, players.data]);
}

function millis(e: ScoreEvent): number {
  return e.createdAt ? e.createdAt.toMillis() : Number.MAX_SAFE_INTEGER;
}

export default function ScorePage() {
  const { id = '' } = useParams();
  const { appUser } = useAuth();
  const toast = useToast();
  const match = useDoc<Match>(() => doc(db, 'matches', id), [id]);
  const events = useCollection<ScoreEvent>(() => collection(db, 'matches', id, 'events'), [id]);
  const m = match.data;
  const home = useSide(id, m?.homeTeamId ?? '_', m?.schoolIds[0] ?? '_');
  const away = useSide(id, m?.awayTeamId ?? '_', m?.schoolIds[1] ?? '_');

  const [pendingWrites, setPendingWrites] = useState(0);
  const [action, setAction] = useState<{ type: ScoreType; teamId: string } | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);

  const sorted = useMemo(() => [...events.data].sort((a, b) => millis(a) - millis(b)), [events.data]);
  const last = sorted[sorted.length - 1];

  if (match.loading) return <SkeletonList />;
  if (!m) return <EmptyState title="Match not found" description={match.error ?? undefined} />;
  const role = appUser?.role;
  const unionLevel = role === 'union_admin' || role === 'registrar';
  const mayScore = unionLevel
    || (role === 'scorer' && (appUser?.schoolId == null || m.schoolIds.includes(appUser.schoolId)))
    || ((role === 'school_admin' || role === 'coach' || role === 'manager') && appUser?.schoolId != null && m.schoolIds.includes(appUser.schoolId));
  const open = mayScore && (m.status === 'scheduled' || m.status === 'live' || (m.status === 'final' && role === 'union_admin'));
  const locked = m.status === 'final' || m.status === 'cancelled';
  const sides = { [m.homeTeamId]: home, [m.awayTeamId]: away } as Record<string, Side>;
  const names = { [m.homeTeamId]: m.homeName, [m.awayTeamId]: m.awayName } as Record<string, string>;

  /** Fire-and-forget: Firestore applies it locally at once and syncs when there is signal. */
  function track(p: Promise<unknown>, failMsg: string) {
    setPendingWrites((n) => n + 1);
    p.catch((e: unknown) => toast.error(e instanceof Error && e.message ? `${failMsg} ${e.message}` : failMsg))
      .finally(() => setPendingWrites((n) => n - 1));
  }

  const defaultMinute = last ? String(last.minute) : '';

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-line bg-pitch px-4 py-3 text-white md:mx-0 md:rounded-xl">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
          <span className="truncate text-sm font-semibold">{m.homeName}</span>
          <span className="num text-6xl leading-none" aria-live="polite">{m.homeScore} - {m.awayScore}</span>
          <span className="truncate text-sm font-semibold">{m.awayName}</span>
        </div>
        <div className="mt-1 flex items-center justify-center gap-2 text-xs">
          {m.status === 'live' && <Badge tone="red">Live</Badge>}
          {m.status === 'final' && <Badge>Full time</Badge>}
          {m.status === 'cancelled' && <Badge tone="amber">Cancelled</Badge>}
          {pendingWrites > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 font-semibold text-ink"><CloudOff className="size-3" aria-hidden />Saving {pendingWrites}... will sync when online</span>}
          <Link to={`/app/matches/${m.id}`} className="underline">Match page</Link>
        </div>
      </div>

      {!mayScore && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm">You can watch this match but not score it. Only the two schools, assigned scorers and the union can record events.</p>}
      {mayScore && locked && !open && <p className="mb-4 rounded-lg bg-chalk p-3 text-sm font-medium">This match is {m.status}. Only the union can change a final result.</p>}

      {[m.homeTeamId, m.awayTeamId].map((tid) => (
        <Card key={tid} className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-2xl">{names[tid]}</h2>
            <span className="num text-3xl text-pitch">{tid === m.homeTeamId ? m.homeScore : m.awayScore}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {ACTIONS.map((a) => (
              <button key={a.type} type="button" disabled={!open} onClick={() => setAction({ type: a.type, teamId: tid })}
                className={`flex min-h-16 flex-col items-center justify-center rounded-xl bg-pitch text-white active:bg-pitch-dark disabled:opacity-40 ${a.type === 'penalty_try' ? 'col-span-2 bg-ink' : ''}`}>
                <span className="text-lg font-bold">{a.label}</span>
                <span className="text-xs opacity-80">+{SCORE_POINTS[a.type]}</span>
              </button>
            ))}
          </div>
        </Card>
      ))}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" className="min-h-14" icon={<RotateCcw className="size-4" />} disabled={!open || !last}
          onClick={() => {
            if (!last) return;
            track(deleteScoreEvent(m, events.data, last.id), 'Could not undo.');
            toast.toast(`Undid ${LABEL[last.type]} (${last.playerDisplay}).`);
          }}>Undo last</Button>
        <Button variant="secondary" className="min-h-14" icon={<Square className="size-4 text-gold-dark" />} disabled={!open || m.status === 'final'} onClick={() => setCardOpen(true)}>Card</Button>
      </div>

      <Card className="mb-4">
        <h2 className="mb-2 text-xl">Events</h2>
        {sorted.length === 0 ? <p className="text-sm text-ink-soft">Nothing scored yet.</p> : (
          <ul className="divide-y divide-line">
            {[...sorted].reverse().map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span><span className="num mr-2 text-lg">{e.minute}'</span><strong>{LABEL[e.type]}</strong> {e.playerDisplay}</span>
                <span className="text-xs text-ink-soft">{names[e.teamId]}{e.createdAt ? '' : ' · pending'}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {open && m.status !== 'final' && (
        <Button variant="gold" className="mb-8 min-h-14 w-full" icon={<Flag className="size-4" />} onClick={() => setFinalOpen(true)}>Mark as final</Button>
      )}

      <ScoreModal
        key={action ? `${action.teamId}-${action.type}` : 'closed'}
        action={action} side={action ? sides[action.teamId] : undefined} teamName={action ? names[action.teamId] : ''}
        defaultMinute={defaultMinute} onClose={() => setAction(null)}
        onSave={(input) => {
          track(addScoreEvent(m, events.data, input), 'Score not saved yet.');
          setAction(null);
        }} />

      <CardModal key={`${cardOpen}-${defaultMinute}`} open={cardOpen} onClose={() => setCardOpen(false)} match={m} sides={sides} names={names} defaultMinute={defaultMinute}
        onSave={(input) => { track(addCard(m.id, input), 'Card not saved.'); setCardOpen(false); }} />

      <ConfirmDialog open={finalOpen} title="Mark match as final?"
        message={<>Final score <strong>{m.homeName} {m.homeScore} - {m.awayScore} {m.awayName}</strong>. After this only the union can change the result, and the result counts on the log.</>}
        confirmLabel="Mark final" onCancel={() => setFinalOpen(false)}
        onConfirm={() => { setFinalOpen(false); track(setStatus(m, 'final'), 'Could not mark final.'); }} />
    </div>
  );
}

function PlayerPicker({ side, selected, onSelect, typed, onType }: {
  side: Side | undefined; selected: Option | null; onSelect: (o: Option | null) => void; typed: string; onType: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {side && side.options.length > 0 && (
        <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
          {side.options.map((o) => (
            <button key={o.id ?? o.label} type="button" onClick={() => { onSelect(o); onType(''); }}
              className={`min-h-12 rounded-lg border-2 px-2 text-left text-sm font-semibold ${selected?.id === o.id ? 'border-pitch bg-pitch-50' : 'border-line bg-white'}`}>{o.label}</button>
          ))}
        </div>
      )}
      {side?.source === 'none' && <p className="text-xs text-ink-soft">No team sheet or squad is available to you, so type the player's name.</p>}
      <Input label={side && side.options.length > 0 ? 'Or type a name' : 'Player name'} value={typed} placeholder="First and last name"
        onChange={(e) => { onType(e.target.value); onSelect(null); }} />
    </div>
  );
}

function ScoreModal({ action, side, teamName, defaultMinute, onClose, onSave }: {
  action: { type: ScoreType; teamId: string } | null; side: Side | undefined; teamName: string; defaultMinute: string;
  onClose: () => void;
  onSave: (input: { type: ScoreType; teamId: string; playerId: string | null; playerDisplay: string; minute: number }) => void;
}) {
  const [selected, setSelected] = useState<Option | null>(null);
  const [typed, setTyped] = useState('');
  const [minute, setMinute] = useState(defaultMinute);
  const [error, setError] = useState<string | null>(null);
  if (!action) return null;
  const penaltyTry = action.type === 'penalty_try';

  function save() {
    if (!action) return;
    const min = Number(minute);
    if (minute.trim() === '' || !Number.isInteger(min) || min < 0 || min > 140) { setError('Enter the minute, from 0 to 140.'); return; }
    if (penaltyTry) { onSave({ type: action.type, teamId: action.teamId, playerId: null, playerDisplay: 'Penalty try', minute: min }); return; }
    if (selected) { onSave({ type: action.type, teamId: action.teamId, playerId: selected.id, playerDisplay: selected.display, minute: min }); return; }
    if (typed.trim().length < 2) { setError('Pick a player or type a name.'); return; }
    onSave({ type: action.type, teamId: action.teamId, playerId: null, playerDisplay: displayFromFullName(typed), minute: min });
  }

  return (
    <Modal open onClose={onClose} title={`${LABEL[action.type]} · ${teamName}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="gold" className="min-w-32" onClick={save}>Record +{SCORE_POINTS[action.type]}</Button></>}>
      <div className="flex flex-col gap-4">
        <Input label="Minute" type="number" inputMode="numeric" min={0} max={140} value={minute} onChange={(e) => setMinute(e.target.value)} autoFocus={penaltyTry} />
        {!penaltyTry && <PlayerPicker side={side} selected={selected} onSelect={setSelected} typed={typed} onType={setTyped} />}
        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function CardModal({ open, onClose, match, sides, names, defaultMinute, onSave }: {
  open: boolean; onClose: () => void; match: Match; sides: Record<string, Side>; names: Record<string, string>; defaultMinute: string;
  onSave: (input: { type: CardEvent['type']; teamId: string; playerId: string; playerName: string; minute: number; notes: string }) => void;
}) {
  const [teamId, setTeamId] = useState(match.homeTeamId);
  const [type, setType] = useState<CardEvent['type']>('yellow');
  const [selected, setSelected] = useState<Option | null>(null);
  const [typed, setTyped] = useState('');
  const [minute, setMinute] = useState(defaultMinute);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  function save() {
    const min = Number(minute);
    if (minute.trim() === '' || !Number.isInteger(min) || min < 0 || min > 140) { setError('Enter the minute, from 0 to 140.'); return; }
    const playerName = selected ? selected.label.replace(/^\d+\s+/, '') : typed.trim();
    if (playerName.length < 2) { setError('Pick a player or type a name.'); return; }
    onSave({ type, teamId, playerId: selected?.id ?? '', playerName, minute: min, notes });
    setSelected(null); setTyped(''); setNotes(''); setError(null);
  }

  return (
    <Modal open={open} onClose={onClose} title="Record a card"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Record card</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          {[match.homeTeamId, match.awayTeamId].map((tid) => (
            <button key={tid} type="button" onClick={() => { setTeamId(tid); setSelected(null); }}
              className={`min-h-12 rounded-lg border-2 px-2 text-sm font-semibold ${teamId === tid ? 'border-pitch bg-pitch-50' : 'border-line'}`}>{names[tid]}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setType('yellow')} className={`min-h-12 rounded-lg border-2 font-semibold ${type === 'yellow' ? 'border-gold bg-gold/30' : 'border-line'}`}>Yellow</button>
          <button type="button" onClick={() => setType('red')} className={`min-h-12 rounded-lg border-2 font-semibold ${type === 'red' ? 'border-danger bg-red-100' : 'border-line'}`}>Red</button>
        </div>
        <Input label="Minute" type="number" inputMode="numeric" min={0} max={140} value={minute} onChange={(e) => setMinute(e.target.value)} />
        <PlayerPicker side={sides[teamId]} selected={selected} onSelect={setSelected} typed={typed} onType={setTyped} />
        <Input label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
