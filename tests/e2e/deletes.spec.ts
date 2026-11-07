import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createAuthUser, listDocs, readDoc, resetEmulators, seedDoc } from './emulator';
import { dobYearsAgo, login, newSession, PASSWORD } from './helpers';

// Delete actions, with seeded fictional data. Every delete is checked at the database, not just on screen.
const UNION = 'del.union@tryline.test';
const REGISTRAR = 'del.registrar@tryline.test';
const SCHOOL_ADMIN = 'del.head@schoola.test';
const COACH = 'del.coach@schoola.test';
const TARGET = 'del.target@schoola.test';

const now = new Date();
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function seedUser(email: string, role: string, name: string, schoolId: string | null): Promise<string> {
  const uid = await createAuthUser(email, PASSWORD, false);
  await seedDoc(`users/${uid}`, { uid, email, displayName: name, role, schoolId, active: true, createdAt: now });
  return uid;
}

function person(id: string, over: Record<string, unknown>) {
  return {
    schoolId: 'sA', schoolName: 'School A', firstName: 'Tendai', lastName: 'Moyo', dob: dobYearsAgo(17), idType: 'birth_certificate',
    idNumber: `ID-${id}`, status: 'verified', teamIds: [], docTypes: [], createdBy: 'seed', createdAt: now, updatedAt: now, ...over,
  };
}

async function openDialog(page: Page, name: string | RegExp) {
  const d = page.getByRole('dialog', { name });
  await expect(d).toBeVisible();
  return d;
}

test('delete actions: permissions, dependency blocks and real data removal', async ({ browser }) => {
  await resetEmulators();
  const unionUid = await seedUser(UNION, 'union_admin', 'Chipo Admin', null);
  await seedUser(REGISTRAR, 'registrar', 'Farai Registrar', null);
  await seedUser(SCHOOL_ADMIN, 'school_admin', 'Rumbi Head', 'sA');
  await seedUser(COACH, 'coach', 'Tafara Coach', 'sA');
  const targetUid = await seedUser(TARGET, 'coach', 'Target Coach', 'sA');
  await seedDoc('settings/competition', { overAgeYears: 18, maxOverAge: 3 });

  // schools: A (has records), B, C (empty)
  for (const [id, name] of [['sA', 'School A'], ['sB', 'School B'], ['sC', 'School C']]) {
    await seedDoc(`schools/${id}`, { name, town: 'Harare', province: 'Harare' });
  }
  // teams: tA used by matches, tA2 unused, tB
  const team = (id: string, schoolId: string, schoolName: string, ageGroup: string) =>
    seedDoc(`teams/${id}`, { schoolId, schoolName, ageGroup, side: 'A', season: now.getFullYear(), name: `${schoolName} ${ageGroup}A` });
  await team('tA', 'sA', 'School A', 'U16');
  await team('tA2', 'sA', 'School A', 'U15');
  await team('tB', 'sB', 'School B', 'U16');
  await seedDoc('teamRosters/tA', { teamId: 'tA', schoolId: 'sA', playerIds: ['P1', 'P2'], staffIds: ['S1'], overAgeIds: ['P1'] });
  await seedDoc('teamRosters/tA2', { teamId: 'tA2', schoolId: 'sA', playerIds: [], staffIds: [], overAgeIds: [] });
  await seedDoc('teamRosters/tB', { teamId: 'tB', schoolId: 'sB', playerIds: [], staffIds: [], overAgeIds: [] });

  // people: P1 verified (photo + roster + registry), P2 verified, S1 verified staff in roster, S2 pending staff
  await seedDoc('players/P1', person('P1', { docTypes: ['photo'], teamIds: ['tA'], dob: dobYearsAgo(19), registrationNo: 'TL-2026-AAAAAA',
    position: 'Hooker', guardianName: 'G', guardianPhone: '0771', consentGiven: true }));
  for (const [id, last, status] of [['P3', 'Draftson', 'draft'], ['P4', 'Pendson', 'pending'], ['P5', 'Rejson', 'rejected'], ['P6', 'Suspson', 'suspended']]) {
    await seedDoc(`players/${id}`, person(id, { firstName: 'Test', lastName: last, status, position: 'Lock', guardianName: 'G', guardianPhone: '0771', consentGiven: true }));
  }
  await seedDoc('players/P2', person('P2', { firstName: 'Kuda', lastName: 'Dube', teamIds: ['tA'], position: 'Lock', guardianName: 'G', guardianPhone: '0771', consentGiven: true }));
  await seedDoc('staff/S1', person('S1', { firstName: 'Sam', lastName: 'Coach', staffRole: 'head_coach', phone: '0772', teamIds: ['tA'] }));
  await seedDoc('staff/S2', person('S2', { firstName: 'Pending', lastName: 'Person', status: 'pending', staffRole: 'manager', phone: '0773' }));
  const hashP1 = sha('birth_certificate:IDP1');
  for (const [hash, kind, id] of [[hashP1, 'player', 'P1'], [sha('birth_certificate:IDS2'), 'staff', 'S2']]) {
    await seedDoc(`idRegistry/${hash}`, { ownerType: kind, ownerId: id, schoolId: 'sA' });
  }
  await seedDoc('documents/player_P1_photo', { ownerType: 'player', ownerId: 'P1', schoolId: 'sA', type: 'photo', fileName: 'p.jpg', contentType: 'image/jpeg', size: 1, chunkCount: 1, complete: true, uploadedBy: 'seed', uploadedAt: now });
  await seedDoc('documents/player_P1_photo/chunks/0', { data: 'x' });

  // matches: m1 final (events, card, two sheets, a scan), m2 scheduled with a draft sheet for tA
  const match = (id: string, status: string, extra: Record<string, unknown> = {}) => seedDoc(`matches/${id}`, {
    season: now.getFullYear(), date: '2026-05-02', kickoff: '15:00', venue: 'Ground', town: 'Harare', competition: 'League', ageGroup: 'U16',
    homeTeamId: 'tA', awayTeamId: 'tB', homeName: 'School A U16A', awayName: 'School B U16A', schoolIds: ['sA', 'sB'], status,
    homeScore: 5, awayScore: 0, createdBy: 'seed', createdAt: now, ...extra,
  });
  await match('m1', 'final');
  await seedDoc('matches/m1/events/e1', { type: 'try', teamId: 'tA', playerId: 'P1', playerDisplay: 'T. Moyo', minute: 10, createdBy: 'seed', createdAt: now });
  await seedDoc('matches/m1/events/e2', { type: 'conversion', teamId: 'tA', playerId: 'P2', playerDisplay: 'K. Dube', minute: 11, createdBy: 'seed', createdAt: now });
  await seedDoc('matches/m1/cards/c1', { type: 'yellow', teamId: 'tB', playerId: '', playerName: 'Visitor', minute: 40, createdBy: 'seed', createdAt: now });
  const entry = { playerId: 'P1', name: 'Tendai Moyo', jersey: 1, position: 'Hooker', isCaptain: true, overAge: true };
  await seedDoc('matches/m1/sheets/tA', { matchId: 'm1', teamId: 'tA', schoolId: 'sA', status: 'approved', entries: [entry], staffIds: [], overAgeCount: 1, scanDocId: 'sheet_m1_tA_team_sheet' });
  await seedDoc('matches/m1/sheets/tB', { matchId: 'm1', teamId: 'tB', schoolId: 'sB', status: 'draft', entries: [], staffIds: [], overAgeCount: 0 });
  await seedDoc('documents/sheet_m1_tA_team_sheet', { ownerType: 'sheet', ownerId: 'm1_tA', schoolId: 'sA', type: 'team_sheet', fileName: 's.jpg', contentType: 'image/jpeg', size: 1, chunkCount: 1, complete: true, uploadedBy: 'seed', uploadedAt: now });
  await seedDoc('documents/sheet_m1_tA_team_sheet/chunks/0', { data: 'x' });
  await match('m2', 'scheduled', { homeScore: 0, awayScore: 0 });
  await seedDoc('matches/m2/sheets/tA', { matchId: 'm2', teamId: 'tA', schoolId: 'sA', status: 'draft', entries: [], staffIds: [], overAgeCount: 0 });

  // ---- coach: cannot delete a team ------------------------------------------------------
  const coach = await newSession(browser);
  await login(coach, COACH);
  await coach.page.goto('/app/teams/tA2');
  await expect(coach.page.getByRole('heading', { name: 'School A U15A' })).toBeVisible();
  await expect(coach.page.getByRole('button', { name: 'Delete team' })).toHaveCount(0);
  await coach.ctx.close();

  // ---- school admin: deletes an unused team, is blocked on a used one, deletes a draft sheet ----
  const head = await newSession(browser);
  const hp = head.page;
  await login(head, SCHOOL_ADMIN);
  await hp.goto('/app/teams/tA2');
  await hp.getByRole('button', { name: 'Delete team' }).click();
  let d = await openDialog(hp, 'Delete this team?');
  await d.getByRole('button', { name: 'Delete team' }).click();
  await expect(hp).toHaveURL(/\/app\/teams$/);
  await expect.poll(async () => (await readDoc('teams/tA2')) === null && (await readDoc('teamRosters/tA2')) === null).toBe(true);

  // the Add player list says why someone cannot be added; only drafts are sent to "Finish registration"
  await hp.goto('/app/teams/tA');
  await hp.getByRole('button', { name: 'Add player' }).click();
  d = await openDialog(hp, 'Add players');
  const row = (last: string) => d.getByRole('listitem').filter({ hasText: last });
  await expect(row('Draftson').getByRole('link', { name: 'Finish registration' })).toBeVisible();
  await expect(row('Pendson').getByText(/Waiting for a registrar/)).toBeVisible();
  await expect(row('Pendson').getByRole('link', { name: 'Finish registration' })).toHaveCount(0);
  await expect(row('Rejson').getByText(/sent this back/)).toBeVisible();
  await expect(row('Suspson').getByText(/Suspended by the registrar/)).toBeVisible();
  await expect(row('Suspson').getByRole('link', { name: 'Finish registration' })).toHaveCount(0);
  await d.getByRole('button', { name: 'Close' }).click();

  await hp.getByRole('button', { name: 'Delete team' }).click();
  d = await openDialog(hp, 'This team is used in matches');
  await expect(d.getByRole('link', { name: 'School A U16A v School B U16A' })).toHaveCount(2);
  await expect(d.getByRole('button', { name: 'Delete team' })).toHaveCount(0);
  await d.getByRole('button', { name: 'OK' }).click();
  expect(await readDoc('teams/tA')).not.toBeNull();

  await hp.goto('/app/matches/m2/sheet/tA');
  await hp.getByRole('button', { name: 'Delete sheet' }).click();
  d = await openDialog(hp, 'Delete this team sheet?');
  await d.getByRole('button', { name: 'Delete sheet' }).click();
  await expect(hp).toHaveURL(/\/app\/matches\/m2$/);
  await expect.poll(async () => await readDoc('matches/m2/sheets/tA')).toBeNull();
  // a school admin cannot delete verified people or matches
  await hp.goto('/app/players/P1');
  await expect(hp.getByRole('heading', { name: 'Tendai Moyo' })).toBeVisible();
  await expect(hp.getByRole('button', { name: /Delete record|Delete draft/ })).toHaveCount(0);
  await hp.goto('/app/matches/m2');
  await expect(hp.getByRole('heading', { name: /School A U16A v School B U16A/ })).toBeVisible();
  await expect(hp.getByRole('button', { name: 'Delete match' })).toHaveCount(0);
  await head.ctx.close();

  // ---- registrar: no delete on records or matches -------------------------------------
  const reg = await newSession(browser);
  await login(reg, REGISTRAR);
  await reg.page.goto('/app/players/P1');
  await expect(reg.page.getByRole('heading', { name: 'Tendai Moyo' })).toBeVisible();
  await expect(reg.page.getByRole('button', { name: 'Delete record' })).toHaveCount(0);
  await reg.page.goto('/app/matches/m1');
  await expect(reg.page.getByRole('heading', { name: /School A U16A v School B U16A/ })).toBeVisible();
  await expect(reg.page.getByRole('button', { name: 'Delete match' })).toHaveCount(0);
  await reg.ctx.close();

  // ---- union admin ------------------------------------------------------------------------
  const union = await newSession(browser);
  const up = union.page;
  await login(union, UNION);

  // verified player: needs the surname typed; everything attached goes
  await up.goto('/app/players/P1');
  await up.getByRole('button', { name: 'Delete record' }).click();
  d = await openDialog(up, /Delete this player record/);
  await expect(d.getByText(/keep their own copy of the name/)).toBeVisible();
  const confirmBtn = d.getByRole('button', { name: 'Delete permanently' });
  await expect(confirmBtn).toBeDisabled();
  await d.getByLabel(/Type the surname/).fill('Dube');
  await expect(confirmBtn).toBeDisabled();
  await d.getByLabel(/Type the surname/).fill('moyo');
  await confirmBtn.click();
  await expect(up).toHaveURL(/\/app\/players$/);
  await expect.poll(async () => await readDoc('players/P1')).toBeNull();
  expect(await readDoc(`idRegistry/${hashP1}`)).toBeNull();
  expect(await readDoc('documents/player_P1_photo')).toBeNull();
  expect(await readDoc('documents/player_P1_photo/chunks/0')).toBeNull();
  expect(await readDoc<{ playerIds: string[]; overAgeIds: string[] }>('teamRosters/tA')).toMatchObject({ playerIds: ['P2'], overAgeIds: [] });
  // the past sheet keeps its snapshot
  expect((await readDoc<{ entries: Array<{ name: string }> }>('matches/m1/sheets/tA'))!.entries[0].name).toBe('Tendai Moyo');
  expect(await readDoc('players/P2')).not.toBeNull();

  // pending staff member: no typed confirmation, leaves the staff squad cleanly
  await up.goto('/app/staff/S2');
  await up.getByRole('button', { name: 'Delete record' }).click();
  d = await openDialog(up, /Delete this staff record/);
  await expect(d.getByLabel(/Type the surname/)).toHaveCount(0);
  await d.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(up).toHaveURL(/\/app\/staff$/);
  await expect.poll(async () => await readDoc('staff/S2')).toBeNull();
  expect(await readDoc(`idRegistry/${sha('birth_certificate:IDS2')}`)).toBeNull();

  // final match: warns about public results, then removes every subcollection and the scan
  await up.goto('/app/matches/m1');
  await up.getByRole('button', { name: 'Delete match' }).click();
  d = await openDialog(up, 'Delete this match?');
  await expect(d.getByText(/disappear from the public results page and from the league standings/)).toBeVisible();
  await d.getByRole('button', { name: 'Delete match' }).click();
  await expect(up).toHaveURL(/\/app\/matches$/);
  await expect.poll(async () => await readDoc('matches/m1')).toBeNull();
  expect(await listDocs('matches/m1/events')).toHaveLength(0);
  expect(await listDocs('matches/m1/cards')).toHaveLength(0);
  expect(await listDocs('matches/m1/sheets')).toHaveLength(0);
  expect(await readDoc('documents/sheet_m1_tA_team_sheet')).toBeNull();
  expect(await readDoc('documents/sheet_m1_tA_team_sheet/chunks/0')).toBeNull();
  // a scheduled match too
  await up.goto('/app/matches/m2');
  await up.getByRole('button', { name: 'Delete match' }).click();
  d = await openDialog(up, 'Delete this match?');
  await expect(d.getByText(/disappear from the public results/)).toHaveCount(0);
  await d.getByRole('button', { name: 'Delete match' }).click();
  await expect.poll(async () => await readDoc('matches/m2')).toBeNull();

  // with the matches gone the team can be deleted, and its squad list goes with it
  await up.goto('/app/teams/tA');
  await up.getByRole('button', { name: 'Delete team' }).click();
  d = await openDialog(up, 'Delete this team?');
  await d.getByRole('button', { name: 'Delete team' }).click();
  await expect.poll(async () => (await readDoc('teams/tA')) === null && (await readDoc('teamRosters/tA')) === null).toBe(true);

  // schools: A still has players, staff and users; C is empty
  await up.goto('/app/schools');
  await up.getByRole('button', { name: 'Delete School A' }).click();
  d = await openDialog(up, 'This school cannot be deleted yet');
  await expect(d.getByText(/5 players/)).toBeVisible();
  await expect(d.getByText(/1 staff record/)).toBeVisible();
  await expect(d.getByText(/3 user accounts/)).toBeVisible();
  await d.getByRole('button', { name: 'OK' }).click();
  expect(await readDoc('schools/sA')).not.toBeNull();
  await up.getByRole('button', { name: 'Delete School C' }).click();
  d = await openDialog(up, 'Delete school?');
  await d.getByRole('button', { name: 'Delete school' }).click();
  await expect.poll(async () => await readDoc('schools/sC')).toBeNull();

  // users: no remove button for yourself; removing access then re-inviting restores it
  await up.goto('/app/users');
  await expect(up.getByRole('button', { name: /Remove access for Chipo Admin/ })).toHaveCount(0);
  await up.getByRole('button', { name: 'Remove access for Target Coach' }).click();
  d = await openDialog(up, 'Remove access?');
  await expect(d.getByText(/email address stays registered/)).toBeVisible();
  await expect(d.getByText(/invite the same address again/)).toBeVisible();
  await d.getByRole('button', { name: 'Remove access' }).click();
  await expect.poll(async () => await readDoc(`users/${targetUid}`)).toBeNull();
  expect(await readDoc(`users/${unionUid}`)).not.toBeNull();

  const target = await newSession(browser);
  await target.page.goto('/login');
  await target.page.getByLabel('Email').fill(TARGET);
  await target.page.getByLabel(/^Password/).fill(PASSWORD);
  await target.page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(target.page).toHaveURL(/\/no-access/);

  await up.getByRole('button', { name: 'Invite user' }).click();
  await up.getByLabel('Email').fill(TARGET);
  await up.getByLabel('Role').selectOption({ label: 'Coach' });
  await up.getByLabel(/^School/).selectOption({ label: 'School A' });
  await up.getByRole('button', { name: 'Save invitation' }).click();
  await expect(up.getByText(/Invitation saved/)).toBeVisible();

  await target.page.getByRole('button', { name: 'Check again' }).click();
  await expect(target.page).toHaveURL(/\/app$/);
  expect(await readDoc(`users/${targetUid}`)).toMatchObject({ email: TARGET, role: 'coach', schoolId: 'sA', active: true });
  expect(await readDoc(`invites/${TARGET}`)).toBeNull();

  // audit trail
  const actions = (await listDocs<{ action: string }>('auditLogs')).map((a) => a.action);
  for (const a of ['team.deleted', 'sheet.deleted', 'player.deleted', 'staff.deleted', 'match.deleted', 'school.deleted', 'user.removed']) {
    expect(actions, `audit has ${a}`).toContain(a);
  }
  await union.ctx.close();
  await target.ctx.close();
});
