import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, query, where } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, FileUp, Paperclip, Save, Send, Star, Trash2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useCollection, useDoc, useSettings } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { uploadDocument } from '../../lib/documents';
import { parseNameList, returnSheetToDraft, saveSheet, sheetEntryFor, sheetOwnerId, validateSheet, type ParsedLine } from '../../lib/sheets';
import { POSITIONS, type Match, type Player, type SheetEntry, type Team, type TeamRoster, type TeamSheet } from '../../lib/types';
import { formatDate } from '../../components/MatchCard';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Select, SkeletonList, StatusBadge, Textarea, useToast } from '../../components/ui';
import { SheetStatusBadge } from './SheetView';

type Tab = 'squad' | 'upload';

const STARTERS = Array.from({ length: 15 }, (_, i) => i + 1);
const SUBS = Array.from({ length: 8 }, (_, i) => i + 16);

export default function TeamSheetPage() {
  const { id = '', teamId = '' } = useParams();
  const { appUser } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();

  const match = useDoc<Match>(() => doc(db, 'matches', id), [id]);
  const team = useDoc<Team>(() => doc(db, 'teams', teamId), [teamId]);
  const sheet = useDoc<TeamSheet>(() => doc(db, 'matches', id, 'sheets', teamId), [id, teamId]);
  const schoolId = team.data?.schoolId ?? null;
  const roster = useDoc<TeamRoster>(() => (schoolId ? doc(db, 'teamRosters', teamId) : null), [teamId, schoolId]);
  const players = useCollection<Player>(() => (schoolId ? query(collection(db, 'players'), where('schoolId', '==', schoolId)) : null), [schoolId]);

  const [entries, setEntries] = useState<SheetEntry[]>([]);
  const [scanDocId, setScanDocId] = useState<string | undefined>();
  const [initialised, setInitialised] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>('squad');
  const [slot, setSlot] = useState<number | null>(null);
  const [pickSearch, setPickSearch] = useState('');
  const [text, setText] = useState('');
  const [lines, setLines] = useState<ParsedLine[]>([]);
  const [saving, setSaving] = useState<null | 'draft' | 'submit'>(null);
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialised || sheet.loading) return;
    setEntries(sheet.data?.entries ?? []);
    setScanDocId(sheet.data?.scanDocId);
    setInitialised(true);
  }, [sheet.loading, sheet.data, initialised]);

  const playersById = useMemo(() => Object.fromEntries(players.data.map((p) => [p.id, p])) as Record<string, Player>, [players.data]);
  const squad = useMemo(
    () => (roster.data?.playerIds ?? []).map((pid) => playersById[pid]).filter((p): p is Player => !!p).sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [roster.data, playersById],
  );

  const matchDate = match.data?.date ?? '';
  const validation = useMemo(() => validateSheet(entries, playersById, settings, matchDate), [entries, playersById, settings, matchDate]);
  const unresolved = lines.filter((l) => l.status !== 'matched');
  const byJersey = useMemo(() => new Map(entries.map((e) => [e.jersey, e])), [entries]);
  const flagged = useMemo(() => new Set(validation.issues.map((i) => i.playerId).filter(Boolean)), [validation]);

  if (match.loading || team.loading || sheet.loading || players.loading) return <SkeletonList />;
  if (!match.data || !team.data) return <EmptyState title="Match or team not found" description={match.error ?? team.error ?? undefined} />;
  const m = match.data;
  const t = team.data;
  const role = appUser?.role;
  const unionLevel = role === 'union_admin' || role === 'registrar';
  const mine = appUser?.schoolId === t.schoolId;
  if (!unionLevel && !mine) return <EmptyState title="Not your team" description="You can only edit sheets for your own school's teams. Open the match page to view the line-up." />;
  if (!m.schoolIds.includes(t.schoolId) || (m.homeTeamId !== teamId && m.awayTeamId !== teamId)) {
    return <EmptyState title="This team is not playing in this match" />;
  }

  const status = sheet.data?.status ?? 'draft';
  const editable = m.status !== 'final' && (status === 'draft' || status === 'submitted');
  const blockers: string[] = [
    ...validation.issues.map((i) => i.message),
    ...unresolved.map((l) => `"${l.name}" ${l.status === 'unmatched' ? 'is not registered' : l.status === 'ambiguous' ? 'matches more than one player' : l.status === 'suspended' ? 'is suspended' : 'is not verified yet'}.`),
    ...(scanProgress !== null ? ['The scanned sheet is still uploading.'] : []),
  ];
  const overAgeBad = validation.overAgeCount > settings.maxOverAge;

  function place(jersey: number, p: Player, position?: string, captain = false) {
    setEntries((list) => [...list.filter((e) => e.jersey !== jersey && e.playerId !== p.id), sheetEntryFor(p, jersey, position ?? p.position, captain, matchDate, settings)]);
    setDirty(true);
  }
  function update(jersey: number, patch: Partial<SheetEntry>) {
    setEntries((list) => list.map((e) => (e.jersey === jersey ? { ...e, ...patch } : patch.isCaptain ? { ...e, isCaptain: false } : e)));
    setDirty(true);
  }
  function clear(jersey: number) {
    setEntries((list) => list.filter((e) => e.jersey !== jersey));
    setDirty(true);
  }

  function runMatch(source = text) {
    setLines(parseNameList(source, players.data));
  }
  async function onFile(file: File | undefined) {
    if (!file) return;
    const content = await file.text();
    setText(content);
    runMatch(content);
  }
  function applyMatched() {
    const used = new Set(lines.filter((l) => l.status === 'matched' && l.jersey !== null).map((l) => l.jersey as number));
    let next = 1;
    const out: SheetEntry[] = [];
    const seen = new Set<string>();
    for (const l of lines) {
      if (l.status !== 'matched' || !l.player || seen.has(l.player.id)) continue;
      seen.add(l.player.id);
      let jersey = l.jersey;
      if (jersey === null) {
        while (used.has(next)) next++;
        jersey = next;
        used.add(next);
      }
      out.push(sheetEntryFor(l.player, jersey, l.player.position, l.captain, matchDate, settings));
    }
    setEntries(out);
    setDirty(true);
    setTab('squad');
    toast.success(`${out.length} players added to the sheet. Check the line-up below.`);
  }
  function choose(index: number, p: Player) {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, player: p, candidates: undefined, status: p.status === 'verified' ? 'matched' : p.status === 'suspended' ? 'suspended' : 'unverified' } : l)));
  }

  async function onScan(file: File | undefined) {
    if (!file) return;
    setScanProgress(0);
    try {
      const docId = await uploadDocument({ ownerType: 'sheet', ownerId: sheetOwnerId(m.id, teamId), schoolId: t.schoolId }, 'team_sheet', file, setScanProgress);
      setScanDocId(docId);
      setDirty(true);
      toast.success('Scanned sheet attached. Save the sheet to keep it.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setScanProgress(null);
    }
  }

  async function persist(submit: boolean) {
    setSaving(submit ? 'submit' : 'draft');
    try {
      await saveSheet({
        match: m, teamId, schoolId: t.schoolId, entries, staffIds: roster.data?.staffIds ?? sheet.data?.staffIds ?? [],
        scanDocId, overAgeCount: validation.overAgeCount,
      }, submit);
      setDirty(false);
      if (submit) {
        toast.success('Sheet submitted for approval.');
        navigate(`/app/matches/${m.id}`);
      } else {
        toast.success('Draft saved.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the sheet. Check your connection.');
    } finally {
      setSaving(null);
    }
  }

  const slotEntry = slot !== null ? byJersey.get(slot) : undefined;
  const placedIds = new Set(entries.map((e) => e.playerId));
  const pickList = squad.filter((p) => !placedIds.has(p.id) && `${p.firstName} ${p.lastName}`.toLowerCase().includes(pickSearch.trim().toLowerCase()));

  function Slot({ n }: { n: number }) {
    const e = byJersey.get(n);
    const bad = e && flagged.has(e.playerId);
    return (
      <button type="button" disabled={!editable} onClick={() => { setSlot(n); setPickSearch(''); }}
        aria-label={e ? `Jersey ${n}, ${e.name}, ${e.position}. Tap to change` : `Jersey ${n}, empty. Tap to pick a player`}
        className={`flex min-h-[4.5rem] flex-col items-center justify-center rounded-xl border-2 px-1 py-1.5 text-center ${
          bad ? 'border-danger bg-red-50' : e ? 'border-pitch bg-white' : 'border-dashed border-line bg-white/60'} disabled:opacity-80`}>
        <span className="num text-2xl leading-none text-pitch">{n}</span>
        {e ? (
          <>
            <span className="mt-0.5 w-full truncate text-xs font-semibold leading-tight">{e.name.split(' ').slice(-1)[0]}{e.isCaptain ? ' (C)' : ''}</span>
            {e.overAge && <span className="mt-0.5 rounded bg-gold/40 px-1 text-[10px] font-bold">OVER-AGE</span>}
          </>
        ) : <span className="text-[11px] text-ink-soft">Empty</span>}
      </button>
    );
  }

  return (
    <div>
      <PageHeader title={`${t.name} sheet`} subtitle={`${m.homeName} v ${m.awayName} · ${formatDate(m.date)}`} backTo={`/app/matches/${m.id}`}
        actions={<SheetStatusBadge status={sheet.data?.status ?? null} />} />

      {sheet.data?.status === 'rejected' && (
        <Card className="mb-4 border-danger bg-red-50">
          <p className="font-semibold text-danger">Sheet rejected</p>
          {sheet.data.reviewNote && <p className="mt-1 text-sm">{sheet.data.reviewNote}</p>}
          <p className="mt-2 text-sm">Ask the registrar to return it to draft so you can fix it.</p>
          {unionLevel && <Button className="mt-3" onClick={() => returnSheetToDraft(sheet.data as TeamSheet).catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed'))}>Return to draft</Button>}
        </Card>
      )}
      {sheet.data?.status === 'approved' && (
        <Card className="mb-4 border-status-verified bg-green-50">
          <p className="font-semibold text-status-verified">Approved. This sheet is locked.</p>
          {unionLevel && <Button className="mt-3" variant="secondary" onClick={() => returnSheetToDraft(sheet.data as TeamSheet, 'Reopened by registrar').catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed'))}>Return to draft</Button>}
        </Card>
      )}

      {/* Live validation panel */}
      <Card className={`mb-4 ${overAgeBad ? 'border-danger' : ''}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Over-age on {formatDate(matchDate)}</p>
            <p className={`num text-5xl leading-none ${overAgeBad ? 'text-danger' : validation.overAgeCount === settings.maxOverAge ? 'text-gold-dark' : 'text-pitch'}`}
              aria-label={`${validation.overAgeCount} of ${settings.maxOverAge} over-age players`}>{validation.overAgeCount}/{settings.maxOverAge}</p>
          </div>
          <div className="text-right">
            <p className="num text-4xl leading-none">{entries.length}<span className="text-xl text-ink-soft">/23</span></p>
            <p className="text-xs text-ink-soft">players (min 15)</p>
          </div>
        </div>
        {validation.overAgePlayers.length > 0 && <p className="mt-2 text-sm">Over-age: {validation.overAgePlayers.join(', ')}</p>}
        {blockers.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1.5 text-sm" aria-live="polite">
            {blockers.map((b) => <li key={b} className="flex gap-2 text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{b}</li>)}
          </ul>
        ) : (
          <p className="mt-3 flex items-center gap-2 text-sm font-medium text-status-verified"><CheckCircle2 className="size-4" aria-hidden />Ready to submit.</p>
        )}
        {editable && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Save className="size-4" />} loading={saving === 'draft'} disabled={!dirty && !!sheet.data} onClick={() => persist(false)}>Save draft</Button>
            <Button icon={<Send className="size-4" />} loading={saving === 'submit'} disabled={blockers.length > 0} onClick={() => persist(true)}>
              {status === 'submitted' ? 'Resubmit' : 'Submit for approval'}
            </Button>
          </div>
        )}
      </Card>

      <div role="tablist" className="mb-4 flex gap-2">
        {([['squad', 'Pick from squad'], ['upload', 'Upload list']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold ${tab === k ? 'bg-pitch text-white' : 'border border-line bg-white'}`}>{label}</button>
        ))}
      </div>

      {tab === 'squad' ? (
        <>
          {squad.length === 0 && (
            <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm">
              This team has no squad yet. <Link className="font-semibold text-pitch underline" to={`/app/teams/${teamId}`}>Add verified players to the squad</Link> first.
            </p>
          )}
          <h2 className="mb-2 text-xl">Starters</h2>
          <div className="mb-5 grid grid-cols-5 gap-2">{STARTERS.map((n) => <Slot key={n} n={n} />)}</div>
          <h2 className="mb-2 text-xl">Replacements</h2>
          <div className="grid grid-cols-4 gap-2">{SUBS.map((n) => <Slot key={n} n={n} />)}</div>
        </>
      ) : (
        <Card className="flex flex-col gap-4">
          <Textarea label="Paste names" rows={8} value={text} onChange={(e) => setText(e.target.value)} disabled={!editable}
            hint="One player per line, jersey optional: 10 Tendai Moyo, Moyo Tendai 10, or 10,Tendai,Moyo. Add (c) for the captain." />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => runMatch()} disabled={!text.trim() || !editable}>Match names</Button>
            <Button variant="secondary" icon={<FileUp className="size-4" />} onClick={() => fileRef.current?.click()} disabled={!editable}>Choose .csv or .txt</Button>
            <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" aria-label="Choose a CSV or text file"
              onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          {lines.length > 0 && (
            <>
              <ul className="flex flex-col gap-2">
                {lines.map((l, i) => (
                  <li key={`${i}-${l.raw}`} className="rounded-lg border border-line p-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{l.jersey !== null && <span className="num mr-2 text-lg text-pitch">{l.jersey}</span>}{l.name}{l.captain ? ' (C)' : ''}</span>
                      {l.status === 'matched' && <Badge tone="green">Matched</Badge>}
                      {l.status === 'unmatched' && <Badge tone="red">Not registered</Badge>}
                      {l.status === 'ambiguous' && <Badge tone="amber">Which one?</Badge>}
                      {(l.status === 'unverified' || l.status === 'suspended') && l.player && <StatusBadge status={l.player.status} />}
                    </div>
                    {l.status === 'unmatched' && <Link className="mt-1 inline-block font-semibold text-pitch underline" to="/app/players/new">Register this player</Link>}
                    {(l.status === 'unverified' || l.status === 'suspended') && l.player && (
                      <Link className="mt-1 inline-block font-semibold text-pitch underline" to={`/app/players/${l.player.id}`}>
                        {l.status === 'suspended' ? 'View record' : 'Finish registration'}
                      </Link>
                    )}
                    {l.status === 'ambiguous' && l.candidates && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {l.candidates.map((c) => (
                          <Button key={c.id} size="sm" variant="secondary" onClick={() => choose(i, c)}>{c.firstName} {c.lastName}, born {c.dob}</Button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <Button onClick={applyMatched} disabled={!editable || !lines.some((l) => l.status === 'matched')}>
                Use {lines.filter((l) => l.status === 'matched').length} matched players as the line-up
              </Button>
              {unresolved.length > 0 && <p className="text-sm text-danger">{unresolved.length} name(s) need attention before this sheet can be submitted.</p>}
            </>
          )}
        </Card>
      )}

      <Card className="mt-5">
        <h2 className="text-xl">Scanned sheet (optional)</h2>
        <p className="mb-3 text-sm text-ink-soft">Attach a photo or PDF of the signed paper sheet.</p>
        {scanDocId && <p className="mb-2 flex items-center gap-2 text-sm font-medium text-status-verified"><Paperclip className="size-4" aria-hidden />Scan attached</p>}
        {scanProgress !== null && (
          <div role="progressbar" aria-valuenow={Math.round(scanProgress * 100)} aria-valuemin={0} aria-valuemax={100} className="mb-2 h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-pitch" style={{ width: `${Math.round(scanProgress * 100)}%` }} />
          </div>
        )}
        <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-semibold ${!editable ? 'pointer-events-none opacity-50' : ''}`}>
          <FileUp className="size-4" aria-hidden />{scanDocId ? 'Replace scan' : 'Add scan'}
          <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => { void onScan(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </Card>

      <Modal open={slot !== null} onClose={() => setSlot(null)} title={slot !== null ? `Jersey ${slot}${slot > 15 ? ' (replacement)' : ''}` : ''}>
        {slot !== null && slotEntry ? (
          <div className="flex flex-col gap-4">
            <p className="text-lg font-semibold">{slotEntry.name}</p>
            <Select label="Position" value={slotEntry.position} onChange={(e) => update(slot, { position: e.target.value })}
              options={POSITIONS.map((p) => ({ value: p, label: p }))} />
            <Button variant={slotEntry.isCaptain ? 'gold' : 'secondary'} icon={<Star className="size-4" />}
              onClick={() => update(slot, { isCaptain: !slotEntry.isCaptain })}>{slotEntry.isCaptain ? 'Captain (tap to remove)' : 'Make captain'}</Button>
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => { clear(slot); setSlot(null); }}>Remove from sheet</Button>
            <Button variant="secondary" onClick={() => setSlot(null)}>Done</Button>
          </div>
        ) : slot !== null ? (
          <div>
            <input aria-label="Search squad" placeholder="Search squad" value={pickSearch} onChange={(e) => setPickSearch(e.target.value)}
              className="mb-3 min-h-11 w-full rounded-lg border border-line px-3 text-base" />
            {pickList.length === 0 && <p className="text-sm text-ink-soft">No unplaced players in the squad.</p>}
            <ul className="flex flex-col gap-2">
              {pickList.map((p) => {
                const ok = p.status === 'verified';
                return (
                  <li key={p.id}>
                    {ok ? (
                      <button type="button" className="flex min-h-14 w-full items-center justify-between rounded-lg border border-line px-3 text-left hover:border-pitch"
                        onClick={() => { place(slot, p); setSlot(null); }}>
                        <span><span className="block font-semibold">{p.firstName} {p.lastName}</span><span className="text-xs text-ink-soft">{p.position}</span></span>
                        {matchDate && sheetEntryFor(p, slot, p.position, false, matchDate, settings).overAge && <Badge tone="gold">Over-age</Badge>}
                      </button>
                    ) : (
                      <div className="flex min-h-14 items-center justify-between rounded-lg border border-line bg-chalk px-3">
                        <span className="font-semibold">{p.firstName} {p.lastName}</span>
                        <span className="flex items-center gap-2"><StatusBadge status={p.status} /><Link className="text-sm font-semibold text-pitch underline" to={`/app/players/${p.id}`}>Finish registration</Link></span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
