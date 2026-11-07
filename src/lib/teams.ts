import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { confirmWrite, writeAudit } from './data';
import { isOverAge, ageOn, todayISO } from './eligibility';
import type { AgeGroup, CompetitionSettings, Match, Player, School, Staff, Team, TeamRoster } from './types';

/** Thrown when adding a player would put a team above the over-age cap. */
export class OverAgeError extends Error {
  playerNames: string[];
  max: number;
  constructor(playerNames: string[], max: number) {
    super(`This would put ${playerNames.length} over-age players in the squad; the limit is ${max}. Over-age: ${playerNames.join(', ')}.`);
    this.name = 'OverAgeError';
    this.playerNames = playerNames;
    this.max = max;
  }
}

/** Thrown for any other roster rule (unverified record, wrong school). */
export class RosterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RosterError';
  }
}

const NO_SIDE: ReadonlyArray<AgeGroup> = ['1st XV', '2nd XV', '3rd XV'];
export function hasSide(ageGroup: AgeGroup): boolean {
  return !NO_SIDE.includes(ageGroup);
}

export function teamName(schoolName: string, ageGroup: AgeGroup, side: string): string {
  return hasSide(ageGroup) && side ? `${schoolName} ${ageGroup}${side}` : `${schoolName} ${ageGroup}`;
}

export async function createTeam(input: { school: School; ageGroup: AgeGroup; side: string; season: number }): Promise<'saved' | 'queued'> {
  const side = hasSide(input.ageGroup) ? input.side.trim().toUpperCase() : '';
  const teamRef = doc(collection(db, 'teams'));
  const team: Omit<Team, 'id'> = {
    schoolId: input.school.id,
    schoolName: input.school.name,
    ageGroup: input.ageGroup,
    side,
    season: input.season,
    name: teamName(input.school.name, input.ageGroup, side),
  };
  const batch = writeBatch(db);
  batch.set(teamRef, team);
  batch.set(doc(db, 'teamRosters', teamRef.id), {
    teamId: teamRef.id, schoolId: input.school.id, playerIds: [], staffIds: [], overAgeIds: [],
  } satisfies TeamRoster);
  const outcome = await confirmWrite(batch.commit());
  void writeAudit('team.created', 'team', teamRef.id, team.name).catch(() => undefined);
  return outcome;
}

function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`;
}

/** Adds a verified player to a roster, enforcing the over-age cap (as of today) inside a transaction. */
export async function addPlayerToRoster(teamId: string, playerId: string, settings: CompetitionSettings): Promise<void> {
  const today = todayISO();
  await runTransaction(db, async (tx) => {
    const teamRef = doc(db, 'teams', teamId);
    const rosterRef = doc(db, 'teamRosters', teamId);
    const playerRef = doc(db, 'players', playerId);
    const [teamSnap, rosterSnap, playerSnap] = await Promise.all([tx.get(teamRef), tx.get(rosterRef), tx.get(playerRef)]);
    if (!teamSnap.exists()) throw new RosterError('This team no longer exists.');
    if (!playerSnap.exists()) throw new RosterError('That player record was not found.');
    const team = teamSnap.data() as Team;
    const player = { ...(playerSnap.data() as Player), id: playerId };
    if (player.schoolId !== team.schoolId) throw new RosterError('Players can only join a team from their own school.');
    if (player.status !== 'verified') {
      throw new RosterError(`${fullName(player)} is ${player.status}. Only verified players can join a squad.`);
    }
    const roster: TeamRoster = rosterSnap.exists()
      ? (rosterSnap.data() as TeamRoster)
      : { teamId, schoolId: team.schoolId, playerIds: [], staffIds: [], overAgeIds: [] };
    if (roster.playerIds.includes(playerId)) return;

    const others = await Promise.all(roster.playerIds.map((id) => tx.get(doc(db, 'players', id))));
    const members: Array<{ id: string; firstName: string; lastName: string; dob: string }> = [{ ...player, id: playerId }];
    for (const s of others) if (s.exists()) members.push({ ...(s.data() as Player), id: s.id });
    const over = members.filter((m) => isOverAge(m.dob, today, settings));
    if (over.length > settings.maxOverAge) throw new OverAgeError(over.map(fullName), settings.maxOverAge);

    tx.set(rosterRef, { ...roster, playerIds: [...roster.playerIds, playerId], overAgeIds: over.map((m) => m.id) });
    tx.update(playerRef, { teamIds: arrayUnion(teamId), updatedAt: serverTimestamp() });
  });
}

export async function removePlayerFromRoster(teamId: string, playerId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const rosterRef = doc(db, 'teamRosters', teamId);
    const playerRef = doc(db, 'players', playerId);
    const [rosterSnap, playerSnap] = await Promise.all([tx.get(rosterRef), tx.get(playerRef)]);
    if (rosterSnap.exists()) {
      const roster = rosterSnap.data() as TeamRoster;
      tx.set(rosterRef, {
        ...roster,
        playerIds: roster.playerIds.filter((id) => id !== playerId),
        overAgeIds: roster.overAgeIds.filter((id) => id !== playerId),
      });
    }
    if (playerSnap.exists()) tx.update(playerRef, { teamIds: arrayRemove(teamId), updatedAt: serverTimestamp() });
  });
}

export async function addStaff(teamId: string, staffId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const teamRef = doc(db, 'teams', teamId);
    const rosterRef = doc(db, 'teamRosters', teamId);
    const staffRef = doc(db, 'staff', staffId);
    const [teamSnap, rosterSnap, staffSnap] = await Promise.all([tx.get(teamRef), tx.get(rosterRef), tx.get(staffRef)]);
    if (!teamSnap.exists()) throw new RosterError('This team no longer exists.');
    if (!staffSnap.exists()) throw new RosterError('That staff record was not found.');
    const team = teamSnap.data() as Team;
    const staff = staffSnap.data() as Staff;
    if (staff.schoolId !== team.schoolId) throw new RosterError('Staff can only join a team from their own school.');
    if (staff.status !== 'verified') throw new RosterError(`${fullName(staff)} is ${staff.status}. Only verified staff can be added.`);
    const roster: TeamRoster = rosterSnap.exists()
      ? (rosterSnap.data() as TeamRoster)
      : { teamId, schoolId: team.schoolId, playerIds: [], staffIds: [], overAgeIds: [] };
    if (roster.staffIds.includes(staffId)) return;
    tx.set(rosterRef, { ...roster, staffIds: [...roster.staffIds, staffId] });
    tx.update(staffRef, { teamIds: arrayUnion(teamId), updatedAt: serverTimestamp() });
  });
}

export async function removeStaff(teamId: string, staffId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const rosterRef = doc(db, 'teamRosters', teamId);
    const staffRef = doc(db, 'staff', staffId);
    const [rosterSnap, staffSnap] = await Promise.all([tx.get(rosterRef), tx.get(staffRef)]);
    if (rosterSnap.exists()) {
      const roster = rosterSnap.data() as TeamRoster;
      tx.set(rosterRef, { ...roster, staffIds: roster.staffIds.filter((id) => id !== staffId) });
    }
    if (staffSnap.exists()) tx.update(staffRef, { teamIds: arrayRemove(teamId), updatedAt: serverTimestamp() });
  });
}

/** Matches that use this team, home or away. A team in a match cannot be deleted without breaking it. */
export async function matchesUsingTeam(teamId: string): Promise<Match[]> {
  const [home, away] = await Promise.all([
    getDocs(query(collection(db, 'matches'), where('homeTeamId', '==', teamId))),
    getDocs(query(collection(db, 'matches'), where('awayTeamId', '==', teamId))),
  ]);
  return [...home.docs, ...away.docs].map((d) => ({ ...d.data(), id: d.id }) as Match);
}

/** Deletes the team and its squad list. Throws TeamInUseError, deleting nothing, if any match uses it. */
export async function deleteTeam(team: Team): Promise<void> {
  const used = await matchesUsingTeam(team.id);
  if (used.length) throw new TeamInUseError(used);
  const rosterSnap = await getDoc(doc(db, 'teamRosters', team.id));
  const roster = rosterSnap.exists() ? (rosterSnap.data() as TeamRoster) : null;
  const batch = writeBatch(db);
  if (roster) batch.delete(doc(db, 'teamRosters', team.id)); // a rule cannot evaluate a delete of a missing document
  batch.delete(doc(db, 'teams', team.id));
  await confirmWrite(batch.commit());
  // Tidy the "teams" list on each member's record. Best effort: a suspended record cannot be changed by a school.
  if (roster) {
    for (const id of roster.playerIds) await updateDoc(doc(db, 'players', id), { teamIds: arrayRemove(team.id) }).catch(() => undefined);
    for (const id of roster.staffIds) await updateDoc(doc(db, 'staff', id), { teamIds: arrayRemove(team.id) }).catch(() => undefined);
  }
  await writeAudit('team.deleted', 'team', team.id, team.name);
}

export class TeamInUseError extends Error {
  matches: Match[];
  constructor(matches: Match[]) {
    super('This team is used in matches.');
    this.name = 'TeamInUseError';
    this.matches = matches;
  }
}

// ---- CSV ----------------------------------------------------------------------

/** Neutralises spreadsheet formula injection, then quotes the cell. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: Array<Array<string | number | boolean | null | undefined>>): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Squad export: no ID numbers and no guardian details. */
export function squadCsv(team: Team, players: Player[], settings: CompetitionSettings): string {
  const today = todayISO();
  const rows: Array<Array<string | number | boolean>> = [
    ['Team', 'Last name', 'First name', 'Registration no', 'Position', 'Date of birth', `Age on ${today}`, 'Over-age'],
  ];
  for (const p of [...players].sort((a, b) => a.lastName.localeCompare(b.lastName))) {
    rows.push([team.name, p.lastName, p.firstName, p.registrationNo ?? '', p.position, p.dob, ageOn(p.dob, today),
      isOverAge(p.dob, today, settings) ? 'Yes' : 'No']);
  }
  return toCsv(rows);
}
