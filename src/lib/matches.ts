import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch, type DocumentReference } from 'firebase/firestore';
import { deleteDocument } from './documents';
import { auth, db } from './firebase';
import { confirmWrite, writeAudit } from './data';
import { SCORE_POINTS, type AgeGroup, type Match, type MatchStatus, type ScoreEvent, type ScoreType, type Team } from './types';

function uidOrThrow(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You are signed out.');
  return uid;
}

export interface MatchInput {
  date: string;
  kickoff: string;
  venue: string;
  town: string;
  competition: string;
  ageGroup: AgeGroup;
  referee: string;
  home: Team;
  away: Team;
}

export async function createMatch(input: MatchInput): Promise<{ id: string; outcome: 'saved' | 'queued' }> {
  if (input.home.id === input.away.id) throw new Error('Choose two different teams.');
  const data = {
    season: Number(input.date.slice(0, 4)),
    date: input.date,
    kickoff: input.kickoff,
    venue: input.venue.trim(),
    town: input.town.trim(),
    competition: input.competition.trim(),
    ageGroup: input.ageGroup,
    homeTeamId: input.home.id,
    awayTeamId: input.away.id,
    homeName: input.home.name,
    awayName: input.away.name,
    schoolIds: [input.home.schoolId, input.away.schoolId],
    ...(input.referee.trim() ? { referee: input.referee.trim() } : {}),
    status: 'scheduled' as MatchStatus,
    homeScore: 0,
    awayScore: 0,
    createdBy: uidOrThrow(),
    createdAt: serverTimestamp(),
  };
  const ref = doc(collection(db, 'matches'));
  const outcome = await confirmWrite(setDoc(ref, data));
  void writeAudit('match.created', 'match', ref.id, `${data.homeName} v ${data.awayName}, ${data.date}`).catch(() => undefined);
  return { id: ref.id, outcome };
}

/** Totals from events, using SCORE_POINTS. */
export function computeScore(match: Pick<Match, 'homeTeamId' | 'awayTeamId'>, events: Array<Pick<ScoreEvent, 'teamId' | 'type'>>): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const e of events) {
    if (e.teamId === match.homeTeamId) home += SCORE_POINTS[e.type];
    else if (e.teamId === match.awayTeamId) away += SCORE_POINTS[e.type];
  }
  return { home, away };
}

export interface ScoreInput {
  type: ScoreType;
  teamId: string;
  playerId: string | null;
  playerDisplay: string;
  minute: number;
}

/**
 * Writes the event and the recomputed score in one batch. Returns the commit promise: callers should NOT block the UI
 * on it (Firestore queues writes offline); the local cache updates immediately.
 */
export function addScoreEvent(match: Match, existing: ScoreEvent[], input: ScoreInput): Promise<void> {
  const ref = doc(collection(db, 'matches', match.id, 'events'));
  const newEvent = { type: input.type, teamId: input.teamId };
  const { home, away } = computeScore(match, [...existing, newEvent]);
  const batch = writeBatch(db);
  batch.set(ref, {
    type: input.type,
    teamId: input.teamId,
    playerId: input.playerId,
    playerDisplay: input.playerDisplay,
    minute: input.minute,
    createdBy: uidOrThrow(),
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'matches', match.id), {
    homeScore: home, awayScore: away, ...(match.status === 'scheduled' ? { status: 'live' } : {}),
  });
  return batch.commit();
}

export function deleteScoreEvent(match: Match, existing: ScoreEvent[], eventId: string): Promise<void> {
  const { home, away } = computeScore(match, existing.filter((e) => e.id !== eventId));
  const batch = writeBatch(db);
  batch.delete(doc(db, 'matches', match.id, 'events', eventId));
  batch.update(doc(db, 'matches', match.id), { homeScore: home, awayScore: away });
  return batch.commit();
}

export interface CardInput {
  type: 'yellow' | 'red';
  teamId: string;
  playerId: string;
  playerName: string;
  minute: number;
  notes: string;
}

export function addCard(matchId: string, input: CardInput): Promise<unknown> {
  return addDoc(collection(db, 'matches', matchId, 'cards'), {
    type: input.type,
    teamId: input.teamId,
    playerId: input.playerId,
    playerName: input.playerName,
    minute: input.minute,
    ...(input.notes.trim() ? { notes: input.notes.trim() } : {}),
    createdBy: uidOrThrow(),
    createdAt: serverTimestamp(),
  });
}

export async function setStatus(match: Match, status: MatchStatus): Promise<void> {
  const p = updateDoc(doc(db, 'matches', match.id), { status });
  if (status === 'final' || match.status === 'final') {
    await p;
    void writeAudit(status === 'final' ? 'match.final' : 'match.reopened', 'match', match.id,
      `${match.homeName} ${match.homeScore} - ${match.awayScore} ${match.awayName}`).catch(() => undefined);
    return;
  }
  await p;
}

/**
 * Union administrator only. Deletes events, cards and sheets (and any scanned sheet files) first, the match last,
 * so a failure half way leaves a match that can simply be deleted again.
 */
export async function deleteMatch(match: Match): Promise<void> {
  const subs = await Promise.all(['events', 'cards', 'sheets'].map((name) => getDocs(collection(db, 'matches', match.id, name))));
  const refs: DocumentReference[] = subs.flatMap((snap) => snap.docs.map((d) => d.ref));
  for (const d of subs[2].docs) {
    const scan = (d.data() as { scanDocId?: string }).scanDocId;
    if (scan) await deleteDocument(scan).catch(() => undefined);
  }
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await confirmWrite(batch.commit());
  }
  await confirmWrite(deleteDoc(doc(db, 'matches', match.id)));
  await writeAudit('match.deleted', 'match', match.id,
    `${match.homeName} v ${match.awayName}, ${match.date}${match.status === 'final' ? ` (final ${match.homeScore}-${match.awayScore})` : ''}`);
}
