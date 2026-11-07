import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { deleteDocument } from './documents';
import { auth, db } from './firebase';
import { confirmWrite, writeAudit } from './data';
import { isOverAge } from './eligibility';
import type { CompetitionSettings, Match, Player, SheetEntry, TeamSheet } from './types';

export const MIN_PLAYERS = 15;
export const MAX_PLAYERS = 23;

export type SheetIssueCode =
  | 'too_few' | 'too_many' | 'no_captain' | 'many_captains' | 'over_age' | 'unverified'
  | 'suspended' | 'unknown_player' | 'bad_jersey' | 'duplicate_jersey' | 'duplicate_player';

export interface SheetIssue {
  code: SheetIssueCode;
  message: string;
  playerId?: string;
  jersey?: number;
}

export interface SheetValidation {
  issues: SheetIssue[];
  overAgeCount: number;
  overAgePlayers: string[];
  valid: boolean;
}

export function sheetEntryFor(player: Player, jersey: number, position: string, isCaptain: boolean, matchDate: string, settings: CompetitionSettings): SheetEntry {
  return {
    playerId: player.id,
    name: `${player.firstName} ${player.lastName}`,
    jersey,
    position,
    isCaptain,
    overAge: isOverAge(player.dob, matchDate, settings),
  };
}

/** Validates a sheet. Over-age is computed from DOB at the MATCH date, not from the stored flag. */
export function validateSheet(
  entries: SheetEntry[],
  players: Record<string, Player>,
  settings: CompetitionSettings,
  matchDate: string,
): SheetValidation {
  const issues: SheetIssue[] = [];
  if (entries.length < MIN_PLAYERS) {
    issues.push({ code: 'too_few', message: `Add at least ${MIN_PLAYERS} players (${entries.length} so far).` });
  }
  if (entries.length > MAX_PLAYERS) {
    issues.push({ code: 'too_many', message: `A sheet can hold at most ${MAX_PLAYERS} players (${entries.length} listed).` });
  }

  const captains = entries.filter((e) => e.isCaptain);
  if (captains.length === 0) issues.push({ code: 'no_captain', message: 'Choose a captain: tap a player on the pitch below, then tap "Make captain".' });
  if (captains.length > 1) issues.push({ code: 'many_captains', message: 'Only one captain is allowed.' });

  const seenJersey = new Map<number, string>();
  const seenPlayer = new Set<string>();
  const overAgePlayers: string[] = [];
  for (const e of entries) {
    if (!Number.isInteger(e.jersey) || e.jersey < 1 || e.jersey > MAX_PLAYERS) {
      issues.push({ code: 'bad_jersey', message: `${e.name}: jersey ${e.jersey} is not between 1 and ${MAX_PLAYERS}.`, playerId: e.playerId, jersey: e.jersey });
    } else if (seenJersey.has(e.jersey)) {
      issues.push({ code: 'duplicate_jersey', message: `Jersey ${e.jersey} is used by both ${seenJersey.get(e.jersey)} and ${e.name}.`, playerId: e.playerId, jersey: e.jersey });
    } else {
      seenJersey.set(e.jersey, e.name);
    }
    if (seenPlayer.has(e.playerId)) {
      issues.push({ code: 'duplicate_player', message: `${e.name} is listed twice.`, playerId: e.playerId });
    }
    seenPlayer.add(e.playerId);

    const p = players[e.playerId];
    if (!p) {
      issues.push({ code: 'unknown_player', message: `${e.name} could not be found in your school's register.`, playerId: e.playerId });
      continue;
    }
    if (p.status === 'suspended') {
      issues.push({ code: 'suspended', message: `${e.name} is suspended and cannot play.`, playerId: e.playerId });
    } else if (p.status !== 'verified') {
      issues.push({ code: 'unverified', message: `${e.name} is not verified yet (${p.status}).`, playerId: e.playerId });
    }
    if (isOverAge(p.dob, matchDate, settings)) overAgePlayers.push(e.name);
  }
  if (overAgePlayers.length > settings.maxOverAge) {
    issues.push({
      code: 'over_age',
      message: `${overAgePlayers.length} players are over ${settings.overAgeYears} on match day; the limit is ${settings.maxOverAge}. Over-age: ${overAgePlayers.join(', ')}.`,
    });
  }
  return { issues, overAgeCount: overAgePlayers.length, overAgePlayers, valid: issues.length === 0 };
}

// ---- Name list parsing ------------------------------------------------------

export type ParsedStatus = 'matched' | 'unmatched' | 'ambiguous' | 'unverified' | 'suspended';

export interface ParsedLine {
  raw: string;
  /** The name as typed, without jersey or captain marker. */
  name: string;
  jersey: number | null;
  captain: boolean;
  status: ParsedStatus;
  player?: Player;
  candidates?: Player[];
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
}

const HEADER_WORDS = new Set(['no', 'number', 'jersey', 'shirt', 'name', 'player', 'surname', 'first', 'last', 'firstname', 'lastname', 'position', 'captain', '#']);

/**
 * Parses pasted or uploaded lists: one player per line, optional jersey number anywhere on the line
 * ("10 Tendai Moyo", "Moyo, Tendai, 10", "10,Tendai,Moyo"), optional "(c)" for captain.
 * Names are matched case-insensitively as "first last" or "last first" against `players`.
 */
export function parseNameList(text: string, players: Player[]): ParsedLine[] {
  const index = players.map((p) => ({ p, a: norm(`${p.firstName} ${p.lastName}`), b: norm(`${p.lastName} ${p.firstName}`) }));
  const out: ParsedLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (!raw) continue;
    let line = raw;
    const captain = /\(\s*c\s*\)|\bcaptain\b|\bcapt\b/i.test(line);
    line = line.replace(/\(\s*c\s*\)|\bcaptain\b|\bcapt\b/gi, ' ');
    const tokens = line.split(/[,;\t]+/).map((t) => t.trim()).filter(Boolean);
    let jersey: number | null = null;
    const nameParts: string[] = [];
    for (const t of tokens) {
      const m = /^#?(\d{1,2})[.)]?$/.exec(t);
      if (m && jersey === null) { jersey = Number(m[1]); continue; }
      nameParts.push(t);
    }
    let name = nameParts.join(' ');
    if (jersey === null) {
      const lead = /^#?(\d{1,2})[\s.):-]+(.+)$/.exec(name);
      const trail = /^(.+?)\s+#?(\d{1,2})$/.exec(name);
      if (lead) { jersey = Number(lead[1]); name = lead[2]; }
      else if (trail) { jersey = Number(trail[2]); name = trail[1]; }
    }
    name = name.replace(/\s+/g, ' ').trim();
    const key = norm(name);
    if (!key) continue;
    if (out.length === 0 && jersey === null && key.split(' ').every((w) => HEADER_WORDS.has(w))) continue;

    const hits = index.filter((x) => x.a === key || x.b === key).map((x) => x.p);
    const base = { raw, name, jersey, captain };
    if (hits.length === 0) out.push({ ...base, status: 'unmatched' });
    else if (hits.length > 1) out.push({ ...base, status: 'ambiguous', candidates: hits });
    else {
      const p = hits[0];
      const status: ParsedStatus = p.status === 'verified' ? 'matched' : p.status === 'suspended' ? 'suspended' : 'unverified';
      out.push({ ...base, status, player: p });
    }
  }
  return out;
}

// ---- Persistence + workflow -------------------------------------------------

function sheetRef(matchId: string, teamId: string) {
  return doc(db, 'matches', matchId, 'sheets', teamId);
}
export function sheetOwnerId(matchId: string, teamId: string): string {
  return `${matchId}_${teamId}`;
}

export interface SheetDraftInput {
  match: Match;
  teamId: string;
  schoolId: string;
  entries: SheetEntry[];
  staffIds: string[];
  scanDocId?: string;
  overAgeCount: number;
}

/** Saves the sheet as draft, or as submitted when `submit` is true (caller must have validated). */
export async function saveSheet(input: SheetDraftInput, submit: boolean): Promise<'saved' | 'queued'> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You are signed out.');
  const entries = [...input.entries].sort((a, b) => a.jersey - b.jersey);
  const data = {
    matchId: input.match.id,
    teamId: input.teamId,
    schoolId: input.schoolId,
    status: submit ? 'submitted' : 'draft',
    entries,
    staffIds: input.staffIds,
    overAgeCount: input.overAgeCount,
    ...(input.scanDocId ? { scanDocId: input.scanDocId } : {}),
    ...(submit ? { submittedBy: uid, submittedAt: serverTimestamp() } : {}),
  };
  const outcome = await confirmWrite(setDoc(sheetRef(input.match.id, input.teamId), data));
  if (submit) void writeAudit('sheet.submitted', 'sheet', sheetOwnerId(input.match.id, input.teamId), `${entries.length} players, ${input.overAgeCount} over-age`).catch(() => undefined);
  return outcome;
}

async function review(sheet: TeamSheet, status: 'approved' | 'rejected' | 'draft', note: string, action: string): Promise<'saved' | 'queued'> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You are signed out.');
  const outcome = await confirmWrite(updateDoc(sheetRef(sheet.matchId, sheet.teamId), {
    status,
    reviewNote: note,
    reviewedBy: uid,
    reviewedAt: serverTimestamp(),
  }));
  void writeAudit(action, 'sheet', sheetOwnerId(sheet.matchId, sheet.teamId), note || undefined).catch(() => undefined);
  return outcome;
}

export function approveSheet(sheet: TeamSheet, note = ''): Promise<'saved' | 'queued'> {
  return review(sheet, 'approved', note, 'sheet.approved');
}
export async function rejectSheet(sheet: TeamSheet, note: string): Promise<'saved' | 'queued'> {
  if (!note.trim()) throw new Error('A reason is required when rejecting a sheet.');
  return review(sheet, 'rejected', note.trim(), 'sheet.rejected');
}
/** Registrar action: lets the school edit a rejected (or approved) sheet again. */
export function returnSheetToDraft(sheet: TeamSheet, note = ''): Promise<'saved' | 'queued'> {
  return review(sheet, 'draft', note, 'sheet.returned_to_draft');
}

/** Deletes a sheet and its scanned copy. A school may only do this while the sheet is a draft; the union may at any time. */
export async function deleteSheet(sheet: TeamSheet): Promise<void> {
  if (sheet.scanDocId) await deleteDocument(sheet.scanDocId).catch(() => undefined);
  await confirmWrite(deleteDoc(sheetRef(sheet.matchId, sheet.teamId)));
  void writeAudit('sheet.deleted', 'sheet', sheetOwnerId(sheet.matchId, sheet.teamId), `${sheet.entries.length} players, was ${sheet.status}`).catch(() => undefined);
}
