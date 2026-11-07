import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Bytes,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

// Runs ONLY against the Firestore emulator with a demo- project id.
const PROJECT_ID = 'demo-tryline';

let env: RulesTestEnvironment;

type Seed = Record<string, Record<string, unknown>>;

const person = (over: Record<string, unknown>) => ({
  schoolName: 'School',
  firstName: 'Tendai',
  lastName: 'Moyo',
  dob: '2009-03-04',
  idType: 'birth_certificate',
  idNumber: 'X1',
  teamIds: [],
  docTypes: [],
  guardianName: 'G',
  guardianPhone: '000',
  consentGiven: true,
  createdBy: 'coA',
  ...over,
});
const verified = { status: 'verified', registrationNo: 'TL-2026-ABC123', verifiedBy: 'rg' };

const docMeta = (ownerType: string, ownerId: string, schoolId: string, type: string) => ({
  ownerType, ownerId, schoolId, type, fileName: 'f', contentType: 'image/jpeg', size: 1,
  chunkCount: 1, complete: true, uploadedBy: 'coA',
});

const entries = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    playerId: `p${i}`, name: 'X Y', jersey: i + 1, position: 'Lock', isCaptain: i === 0, overAge: false,
  }));
const sheet = (schoolId: string, over: Record<string, unknown> = {}) => ({
  matchId: 'm1', teamId: 't', schoolId, status: 'draft', entries: entries(15), staffIds: [], overAgeCount: 0, ...over,
});
const roster = (schoolId: string, overAgeIds: string[] = []) => ({
  teamId: 't', schoolId, playerIds: [], staffIds: [], overAgeIds,
});
const match = (over: Record<string, unknown> = {}) => ({
  season: 2026, date: '2026-05-01', kickoff: '10:00', venue: 'V', town: 'T', competition: 'C', ageGroup: 'U16',
  homeTeamId: 'tA', awayTeamId: 'tB', homeName: 'A', awayName: 'B', schoolIds: ['A', 'B'],
  status: 'scheduled', homeScore: 0, awayScore: 0, createdBy: 'ua', ...over,
});
const chunk = () => ({ data: Bytes.fromUint8Array(new Uint8Array(10)) });
const user = (role: string, schoolId: string | null, active = true) => ({
  email: 'x@x.test', displayName: 'U', role, schoolId, active,
});

const SEED: Seed = {
  'settings/competition': { overAgeYears: 18, maxOverAge: 3 },
  'schools/A': { name: 'A' }, 'schools/B': { name: 'B' }, 'schools/C': { name: 'C' },
  'teams/tA': { schoolId: 'A', name: 'A U16A' }, 'teams/tB': { schoolId: 'B', name: 'B U16A' },
  'teams/tC': { schoolId: 'C', name: 'C U16A' },

  'users/ua': user('union_admin', null), 'users/rg': user('registrar', null),
  'users/saA': user('school_admin', 'A'), 'users/saB': user('school_admin', 'B'),
  'users/coA': user('coach', 'A'), 'users/coB': user('coach', 'B'), 'users/coC': user('coach', 'C'),
  'users/mgA': user('manager', 'A'),
  'users/scA': user('scorer', 'A'), 'users/scC': user('scorer', 'C'), 'users/scAll': user('scorer', null),
  'users/coOff': user('coach', 'A', false), 'users/saOff': user('school_admin', 'A', false),
  'users/uaOff': user('union_admin', null, false),

  'invites/newcoach@x.test': { email: 'newcoach@x.test', role: 'coach', schoolId: 'A', invitedBy: 'saA' },
  'invites/bcoach@x.test': { email: 'bcoach@x.test', role: 'coach', schoolId: 'B', invitedBy: 'saB' },

  'players/pA1': person({ schoolId: 'A', ...verified }),
  'players/pA2': person({ schoolId: 'A', status: 'pending' }),
  'players/pA3': person({ schoolId: 'A', status: 'draft' }),
  'players/pB1': person({ schoolId: 'B', ...verified }),
  'players/pB2': person({ schoolId: 'B', status: 'pending' }),
  'staff/sA1': person({ schoolId: 'A', ...verified, staffRole: 'head_coach', phone: '1' }),
  'staff/sB1': person({ schoolId: 'B', ...verified, staffRole: 'head_coach', phone: '1' }),

  'documents/player_pA1_photo': docMeta('player', 'pA1', 'A', 'photo'),
  'documents/player_pA1_birth_certificate': docMeta('player', 'pA1', 'A', 'birth_certificate'),
  'documents/player_pA2_birth_certificate': docMeta('player', 'pA2', 'A', 'birth_certificate'),
  'documents/player_pB1_photo': docMeta('player', 'pB1', 'B', 'photo'),
  'documents/player_pB1_birth_certificate': docMeta('player', 'pB1', 'B', 'birth_certificate'),
  'documents/player_pA1_photo/chunks/0': { data: Bytes.fromUint8Array(new Uint8Array(10)) },
  'documents/player_pA1_birth_certificate/chunks/0': { data: Bytes.fromUint8Array(new Uint8Array(10)) },
  'documents/player_pA2_birth_certificate/chunks/0': { data: Bytes.fromUint8Array(new Uint8Array(10)) },
  'documents/player_pB1_photo/chunks/0': { data: Bytes.fromUint8Array(new Uint8Array(10)) },
  'documents/player_pB1_birth_certificate/chunks/0': { data: Bytes.fromUint8Array(new Uint8Array(10)) },

  'idRegistry/h1': { ownerType: 'player', ownerId: 'pA1', schoolId: 'A' },
  'teamRosters/tA': roster('A'), 'teamRosters/tB': roster('B'),
  'auditLogs/al1': { action: 'x', targetType: 'player', targetId: 'pA1', byUid: 'rg', byName: 'R' },

  'matches/m1': match(), 'matches/m2': match(), 'matches/mFinal': match({ status: 'final' }),
  'matches/m1/events/e1': { type: 'try', teamId: 'tA', playerId: 'pA1', playerDisplay: 'T. Moyo', minute: 5 },
  'matches/mFinal/events/e1': { type: 'try', teamId: 'tA', playerId: 'pA1', playerDisplay: 'T. Moyo', minute: 5 },
  'matches/m1/cards/c1': { type: 'yellow', teamId: 'tA', playerId: 'pA1', playerName: 'Tendai Moyo', minute: 9 },
  'matches/m1/sheets/tA': sheet('A'),
  'matches/m1/sheets/tA2': sheet('A', { status: 'approved' }),
  'matches/m1/sheets/tB': sheet('B'),
};

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [path, data] of Object.entries(SEED)) await setDoc(doc(db, path), data);
  });
}

/** Firestore handle for a signed-in user; email is `<uid>@x.test`, verified. */
const as = (uid: string, token: Record<string, unknown> = {}) =>
  env.authenticatedContext(uid, { email: `${uid}@x.test`, email_verified: true, ...token }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(process.env.RULES_FILE ?? new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(seed);

// ---------------------------------------------------------------------------
describe('anonymous', () => {
  it.each(['settings/competition', 'schools/A', 'teams/tA', 'matches/m1', 'matches/m1/events/e1'])(
    'can read public %s', async (p) => { await assertSucceeds(getDoc(doc(anon(), p))); });

  it.each(['schools', 'teams', 'matches'])('can list %s', async (c) => {
    await assertSucceeds(getDocs(collection(anon(), c)));
  });
  it('can list events', async () => { await assertSucceeds(getDocs(collection(anon(), 'matches/m1/events'))); });

  it.each([
    'players/pA1', 'staff/sA1', 'documents/player_pA1_photo', 'documents/player_pA1_photo/chunks/0',
    'matches/m1/sheets/tA', 'matches/m1/cards/c1', 'users/coA', 'teamRosters/tA',
    'invites/newcoach@x.test', 'auditLogs/al1', 'idRegistry/h1',
  ])('cannot get %s', async (p) => { await assertFails(getDoc(doc(anon(), p))); });

  it.each(['players', 'staff', 'documents', 'users', 'teamRosters', 'invites', 'auditLogs', 'idRegistry',
    'matches/m1/sheets', 'matches/m1/cards', 'documents/player_pA1_photo/chunks'])(
    'cannot list %s', async (c) => { await assertFails(getDocs(collection(anon(), c))); });

  it('cannot collectionGroup-list chunks', async () => {
    await assertFails(getDocs(collectionGroup(anon(), 'chunks')));
  });

  it('cannot write public data', async () => {
    const db = anon();
    await assertFails(setDoc(doc(db, 'schools/Z'), { name: 'Z' }));
    await assertFails(updateDoc(doc(db, 'matches/m1'), { homeScore: 99 }));
    await assertFails(setDoc(doc(db, 'matches/m1/events/new'), { type: 'try' }));
    await assertFails(updateDoc(doc(db, 'settings/competition'), { maxOverAge: 99 }));
    await assertFails(setDoc(doc(db, 'auditLogs/x'), { byUid: 'anyone' }));
  });
});

// ---------------------------------------------------------------------------
describe('school A coach: players and staff', () => {
  it('reads and lists own school only', async () => {
    const db = as('coA');
    await assertSucceeds(getDoc(doc(db, 'players/pA1')));
    await assertSucceeds(getDocs(query(collection(db, 'players'), where('schoolId', '==', 'A'))));
    await assertSucceeds(getDocs(query(collection(db, 'staff'), where('schoolId', '==', 'A'))));
  });
  it('cannot read school B players/staff', async () => {
    const db = as('coA');
    await assertFails(getDoc(doc(db, 'players/pB1')));
    await assertFails(getDoc(doc(db, 'staff/sB1')));
    await assertFails(getDocs(query(collection(db, 'players'), where('schoolId', '==', 'B'))));
  });
  it('cannot list players or staff without a schoolId filter', async () => {
    await assertFails(getDocs(collection(as('coA'), 'players')));
    await assertFails(getDocs(collection(as('coA'), 'staff')));
  });
  it('B coach cannot read A player', async () => { await assertFails(getDoc(doc(as('coB'), 'players/pA1'))); });
  it('scorer cannot read players', async () => { await assertFails(getDoc(doc(as('scA'), 'players/pA1'))); });

  it('cannot verify own player or set registrationNo/verifiedBy', async () => {
    const db = as('coA');
    await assertFails(updateDoc(doc(db, 'players/pA2'), { status: 'verified' }));
    await assertFails(updateDoc(doc(db, 'players/pA2'), { registrationNo: 'TL-2026-AAAAAA' }));
    await assertFails(updateDoc(doc(db, 'players/pA2'), { verifiedBy: 'coA' }));
    await assertFails(updateDoc(doc(db, 'players/pA2'), { status: 'rejected' }));
    await assertFails(updateDoc(doc(db, 'players/pA2'), { status: 'suspended' }));
  });
  it('cannot move a player to another school', async () => {
    await assertFails(updateDoc(doc(as('coA'), 'players/pA2'), { schoolId: 'B' }));
  });
  it('can edit an unverified player and submit it', async () => {
    const db = as('coA');
    await assertSucceeds(updateDoc(doc(db, 'players/pA2'), { dob: '2010-01-01', status: 'draft' }));
    await assertSucceeds(updateDoc(doc(db, 'players/pA3'), { status: 'pending' }));
  });
  it('cannot change name, dob, id or school of a verified player', async () => {
    const db = as('coA');
    await assertFails(updateDoc(doc(db, 'players/pA1'), { dob: '2005-01-01' }));
    await assertFails(updateDoc(doc(db, 'players/pA1'), { firstName: 'Other' }));
    await assertFails(updateDoc(doc(db, 'players/pA1'), { lastName: 'Other' }));
    await assertFails(updateDoc(doc(db, 'players/pA1'), { idNumber: 'Y' }));
    await assertFails(updateDoc(doc(db, 'players/pA1'), { status: 'pending' }));
    await assertFails(updateDoc(doc(db, 'players/pA1'), { registrationNo: 'TL-2026-ZZZZZZ' }));
  });
  it('can still update non-locked fields of a verified player', async () => {
    await assertSucceeds(updateDoc(doc(as('coA'), 'players/pA1'), { guardianPhone: '111' }));
  });
  it('creates only own-school draft/pending records', async () => {
    const db = as('coA');
    const base = person({ schoolId: 'A', status: 'draft' });
    await assertSucceeds(setDoc(doc(db, 'players/new1'), base));
    await assertSucceeds(setDoc(doc(db, 'players/new2'), { ...base, status: 'pending' }));
    await assertFails(setDoc(doc(db, 'players/new3'), { ...base, status: 'verified' }));
    await assertFails(setDoc(doc(db, 'players/new4'), { ...base, schoolId: 'B' }));
    await assertFails(setDoc(doc(db, 'players/new5'), { ...base, verifiedBy: 'coA' }));
  });
  it('FLAW: cannot create a player that already carries a registrationNo', async () => {
    await assertFails(setDoc(doc(as('coA'), 'players/forged'),
      person({ schoolId: 'A', status: 'pending', registrationNo: 'TL-2026-FORGED' })));
  });
  it('FLAW: cannot create a player with rejectionReason', async () => {
    await assertFails(setDoc(doc(as('coA'), 'players/forged2'),
      person({ schoolId: 'A', status: 'pending', rejectionReason: 'x' })));
  });
  it('coach cannot delete players; school admin can delete drafts only', async () => {
    await assertFails(deleteDoc(doc(as('coA'), 'players/pA3')));
    await assertSucceeds(deleteDoc(doc(as('saA'), 'players/pA3')));
    await assertFails(deleteDoc(doc(as('saA'), 'players/pA2')));
    await assertFails(deleteDoc(doc(as('saA'), 'players/pA1')));
    await assertFails(deleteDoc(doc(as('saB'), 'players/pA3')));
  });
});

// ---------------------------------------------------------------------------
describe('documents and chunks', () => {
  it('coach reads own school document metadata, not another school', async () => {
    const db = as('coA');
    await assertSucceeds(getDoc(doc(db, 'documents/player_pA1_birth_certificate')));
    await assertFails(getDoc(doc(db, 'documents/player_pB1_birth_certificate')));
    await assertSucceeds(getDocs(query(collection(db, 'documents'), where('schoolId', '==', 'A'))));
    await assertFails(getDocs(query(collection(db, 'documents'), where('schoolId', '==', 'B'))));
    await assertFails(getDocs(collection(db, 'documents')));
  });
  it('coach reads photo chunks but not ID chunks', async () => {
    const db = as('coA');
    await assertSucceeds(getDoc(doc(db, 'documents/player_pA1_photo/chunks/0')));
    await assertFails(getDoc(doc(db, 'documents/player_pA1_birth_certificate/chunks/0')));
    await assertFails(getDoc(doc(as('mgA'), 'documents/player_pA1_birth_certificate/chunks/0')));
  });
  it('other school cannot read photo or ID chunks', async () => {
    await assertFails(getDoc(doc(as('coB'), 'documents/player_pA1_photo/chunks/0')));
    await assertFails(getDoc(doc(as('saB'), 'documents/player_pA1_photo/chunks/0')));
    await assertFails(getDoc(doc(as('saB'), 'documents/player_pA1_birth_certificate/chunks/0')));
    await assertFails(getDoc(doc(as('scA'), 'documents/player_pA1_photo/chunks/0')));
    await assertFails(getDocs(collectionGroup(as('coA'), 'chunks')));
  });
  it('school admin reads ID chunks at own school only', async () => {
    await assertSucceeds(getDoc(doc(as('saA'), 'documents/player_pA1_birth_certificate/chunks/0')));
    await assertFails(getDoc(doc(as('saA'), 'documents/player_pB1_birth_certificate/chunks/0')));
  });
  it('union and registrar read ID chunks', async () => {
    await assertSucceeds(getDoc(doc(as('rg'), 'documents/player_pB1_birth_certificate/chunks/0')));
    await assertSucceeds(getDoc(doc(as('ua'), 'documents/player_pA1_birth_certificate/chunks/0')));
  });
  it('coach uploads documents for an unverified own player', async () => {
    const db = as('coA');
    await assertSucceeds(setDoc(doc(db, 'documents/player_pA2_photo'), docMeta('player', 'pA2', 'A', 'photo')));
    await assertSucceeds(setDoc(doc(db, 'documents/player_pA2_photo/chunks/0'), chunk()));
    await assertSucceeds(setDoc(doc(db, 'documents/player_pA2_birth_certificate'),
      docMeta('player', 'pA2', 'A', 'birth_certificate')));
    await assertSucceeds(setDoc(doc(db, 'documents/player_pA2_birth_certificate/chunks/0'), chunk()));
  });
  it('coach cannot replace or delete documents of a verified player', async () => {
    const db = as('coA');
    await assertFails(setDoc(doc(db, 'documents/player_pA1_photo'), docMeta('player', 'pA1', 'A', 'photo')));
    await assertFails(updateDoc(doc(db, 'documents/player_pA1_birth_certificate'), { fileName: 'evil' }));
    await assertFails(deleteDoc(doc(db, 'documents/player_pA1_birth_certificate')));
    await assertFails(setDoc(doc(db, 'documents/player_pA1_photo/chunks/0'), chunk()));
    await assertFails(setDoc(doc(db, 'documents/player_pA1_birth_certificate/chunks/1'), chunk()));
    await assertFails(deleteDoc(doc(db, 'documents/player_pA1_photo/chunks/0')));
    await assertFails(setDoc(doc(db, 'documents/player_pA1_passport'), docMeta('player', 'pA1', 'A', 'passport')));
  });
  it('registrar can replace documents of a verified player', async () => {
    await assertSucceeds(setDoc(doc(as('rg'), 'documents/player_pA1_photo'), docMeta('player', 'pA1', 'A', 'photo')));
  });
  it('cannot claim a document for another school player', async () => {
    const db = as('coA');
    await assertFails(setDoc(doc(db, 'documents/player_pB2_photo'), docMeta('player', 'pB2', 'A', 'photo')));
    await assertFails(setDoc(doc(db, 'documents/x1'), docMeta('player', 'pB2', 'B', 'photo')));
    await assertFails(setDoc(doc(db, 'documents/x2'), docMeta('player', 'pB1', 'A', 'photo')));
  });
  it('cannot change owner or school on an existing document', async () => {
    const db = as('coA');
    await assertSucceeds(updateDoc(doc(db, 'documents/player_pA2_birth_certificate'), { fileName: 'new' }));
    await assertFails(updateDoc(doc(db, 'documents/player_pA2_birth_certificate'), { ownerId: 'pA3' }));
    await assertFails(updateDoc(doc(db, 'documents/player_pA2_birth_certificate'), { schoolId: 'B' }));
  });
  it('B coach cannot touch A documents', async () => {
    const db = as('coB');
    await assertFails(setDoc(doc(db, 'documents/player_pA2_birth_certificate'),
      docMeta('player', 'pA2', 'A', 'birth_certificate')));
    await assertFails(deleteDoc(doc(db, 'documents/player_pA2_birth_certificate')));
  });
  it('FLAW: owner type "sheet" cannot be used to inject a document under a verified player id', async () => {
    // docId is not tied to ownerType/ownerId/type, and ownerType 'sheet' skips the
    // verified-owner check, so a coach can plant e.g. the missing passport of a verified player.
    await assertFails(setDoc(doc(as('coA'), 'documents/player_pA1_passport'), docMeta('sheet', 'pA1', 'A', 'passport')));
  });
  it('inactive user cannot read documents', async () => {
    await assertFails(getDoc(doc(as('coOff'), 'documents/player_pA1_photo')));
    await assertFails(getDoc(doc(as('coOff'), 'documents/player_pA1_photo/chunks/0')));
  });
});

// ---------------------------------------------------------------------------
describe('idRegistry', () => {
  it('staff can get, nobody can list', async () => {
    await assertSucceeds(getDoc(doc(as('coA'), 'idRegistry/h1')));
    await assertSucceeds(getDoc(doc(as('saB'), 'idRegistry/h1')));
    await assertSucceeds(getDoc(doc(as('rg'), 'idRegistry/h1')));
    await assertFails(getDoc(doc(as('scA'), 'idRegistry/h1')));
    await assertFails(getDocs(collection(as('coA'), 'idRegistry')));
    await assertFails(getDocs(collection(as('ua'), 'idRegistry')));
  });
  it('registration staff create for own school only; no overwrite', async () => {
    const db = as('coA');
    await assertSucceeds(setDoc(doc(db, 'idRegistry/h2'), { ownerType: 'player', ownerId: 'pA2', schoolId: 'A' }));
    await assertFails(setDoc(doc(db, 'idRegistry/h3'), { ownerType: 'player', ownerId: 'pB2', schoolId: 'B' }));
    await assertFails(setDoc(doc(db, 'idRegistry/h1'), { ownerType: 'player', ownerId: 'pA2', schoolId: 'A' }));
  });
  it('own-school staff clear an unverified entry only', async () => {
    const admin = async (fn: (db: any) => Promise<unknown>) =>
      env.withSecurityRulesDisabled(async (c) => { await fn(c.firestore()); });
    await admin(async (d) => {
      await setDoc(doc(d, 'players/pDraft'), person({ schoolId: 'A', status: 'draft' }));
      await setDoc(doc(d, 'players/pDone'), person({ schoolId: 'A', status: 'verified' }));
      await setDoc(doc(d, 'idRegistry/hDraft'), { ownerType: 'player', ownerId: 'pDraft', schoolId: 'A' });
      await setDoc(doc(d, 'idRegistry/hDone'), { ownerType: 'player', ownerId: 'pDone', schoolId: 'A' });
    });
    await assertFails(deleteDoc(doc(as('coB'), 'idRegistry/hDraft')));
    await assertFails(deleteDoc(doc(as('coA'), 'idRegistry/hDone')));
    await assertFails(deleteDoc(doc(as('saA'), 'idRegistry/hDone')));
    await assertSucceeds(deleteDoc(doc(as('coA'), 'idRegistry/hDraft')));
  });
  it('an ID document cannot be relabelled to open it to coaches', async () => {
    const db = as('coA');
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'documents/player_pA3_national_id'), docMeta('player', 'pA3', 'A', 'national_id'));
    });
    // Control: the coach may edit this unverified owner's document, so the denials below are about the type.
    await assertSucceeds(updateDoc(doc(db, 'documents/player_pA3_national_id'), { fileName: 'corrected.jpg' }));
    await assertFails(updateDoc(doc(db, 'documents/player_pA3_national_id'), { type: 'photo' }));
    await assertFails(setDoc(doc(db, 'documents/player_pA3_national_id'), docMeta('player', 'pA3', 'A', 'photo')));
    await assertFails(setDoc(doc(db, 'documents/player_pA3_other'), docMeta('player', 'pA3', 'A', 'photo')));
  });
});

// ---------------------------------------------------------------------------
describe('school admin and invites', () => {
  const inv = (role: string, schoolId: string | null) => ({ email: 'n@x.test', role, schoolId, invitedBy: 'saA' });
  it('invites coach/manager/scorer for own school', async () => {
    const db = as('saA');
    for (const r of ['coach', 'manager', 'scorer']) await assertSucceeds(setDoc(doc(db, `invites/${r}@x.test`), inv(r, 'A')));
  });
  it('cannot invite union_admin, registrar, school_admin', async () => {
    const db = as('saA');
    for (const r of ['union_admin', 'registrar', 'school_admin']) {
      await assertFails(setDoc(doc(db, `invites/${r}@x.test`), inv(r, 'A')));
      await assertFails(setDoc(doc(db, `invites/${r}2@x.test`), inv(r, null)));
    }
  });
  it('cannot invite for another school or union-wide', async () => {
    const db = as('saA');
    await assertFails(setDoc(doc(db, 'invites/y@x.test'), inv('coach', 'B')));
    await assertFails(setDoc(doc(db, 'invites/y@x.test'), inv('scorer', null)));
  });
  it('cannot overwrite an existing invite', async () => {
    await assertFails(setDoc(doc(as('saA'), 'invites/newcoach@x.test'), inv('coach', 'A')));
    await assertFails(updateDoc(doc(as('saA'), 'invites/newcoach@x.test'), { role: 'scorer' }));
  });
  it('union admin invites anyone; registrar and coach cannot', async () => {
    await assertSucceeds(setDoc(doc(as('ua'), 'invites/r@x.test'), inv('registrar', null)));
    await assertFails(setDoc(doc(as('rg'), 'invites/r2@x.test'), inv('coach', 'A')));
    await assertFails(setDoc(doc(as('coA'), 'invites/r3@x.test'), inv('coach', 'A')));
    await assertFails(setDoc(doc(anon(), 'invites/r4@x.test'), inv('coach', 'A')));
  });
  it('reads: own school, own email, union only', async () => {
    await assertSucceeds(getDoc(doc(as('saA'), 'invites/newcoach@x.test')));
    await assertFails(getDoc(doc(as('saA'), 'invites/bcoach@x.test')));
    await assertSucceeds(getDoc(doc(as('newcoach'), 'invites/newcoach@x.test')));
    await assertFails(getDoc(doc(as('thief'), 'invites/newcoach@x.test')));
    await assertFails(getDoc(doc(as('coA'), 'invites/newcoach@x.test')));
    await assertSucceeds(getDoc(doc(as('ua'), 'invites/bcoach@x.test')));
    await assertSucceeds(getDocs(query(collection(as('saA'), 'invites'), where('schoolId', '==', 'A'))));
    await assertFails(getDocs(collection(as('saA'), 'invites')));
    await assertFails(getDocs(query(collection(as('saA'), 'invites'), where('schoolId', '==', 'B'))));
  });
  it('deletes: invitee with verified email, school admin, not others', async () => {
    await assertFails(deleteDoc(doc(as('thief'), 'invites/newcoach@x.test')));
    await assertFails(deleteDoc(doc(as('newcoach', { email_verified: false }), 'invites/newcoach@x.test')));
    await assertFails(deleteDoc(doc(as('saB'), 'invites/newcoach@x.test')));
    await assertSucceeds(deleteDoc(doc(as('newcoach'), 'invites/newcoach@x.test')));
    await assertSucceeds(deleteDoc(doc(as('saB'), 'invites/bcoach@x.test')));
  });
  it('deactivated school admin loses invite and chunk access', async () => {
    await assertFails(setDoc(doc(as('saOff'), 'invites/z@x.test'), inv('coach', 'A')));
    await assertFails(getDoc(doc(as('saOff'), 'documents/player_pA1_birth_certificate/chunks/0')));
  });
});

// ---------------------------------------------------------------------------
describe('users: onboarding and privilege escalation', () => {
  const claim = (over: Record<string, unknown> = {}) => ({
    email: 'newcoach@x.test', displayName: 'N', role: 'coach', schoolId: 'A', active: true, ...over,
  });
  it('verified email with matching invite can claim it', async () => {
    await assertSucceeds(setDoc(doc(as('newcoach'), 'users/newcoach'), claim()));
  });
  it('cannot claim with a different role or school than invited', async () => {
    const db = as('newcoach');
    await assertFails(setDoc(doc(db, 'users/newcoach'), claim({ role: 'school_admin' })));
    await assertFails(setDoc(doc(db, 'users/newcoach'), claim({ role: 'union_admin', schoolId: null })));
    await assertFails(setDoc(doc(db, 'users/newcoach'), claim({ schoolId: 'B' })));
    await assertFails(setDoc(doc(db, 'users/newcoach'), claim({ schoolId: null })));
    await assertFails(setDoc(doc(db, 'users/newcoach'), claim({ active: false })));
  });
  it('cannot claim with an unverified email', async () => {
    await assertFails(setDoc(doc(as('newcoach', { email_verified: false }), 'users/newcoach'), claim()));
    await assertFails(setDoc(doc(as('newcoach', { email_verified: undefined }), 'users/newcoach'), claim()));
  });
  it('cannot claim without an invite', async () => {
    await assertFails(setDoc(doc(as('noinvite'), 'users/noinvite'), claim({ email: 'noinvite@x.test' })));
  });
  it('cannot claim someone else invite', async () => {
    const db = as('thief');
    await assertFails(setDoc(doc(db, 'users/thief'), claim()));
    await assertFails(setDoc(doc(db, 'users/thief'), claim({ email: 'thief@x.test' })));
    await assertFails(setDoc(doc(db, 'users/newcoach'), claim()));
    await assertFails(setDoc(doc(as('newcoach'), 'users/thief'), claim()));
    await assertFails(setDoc(doc(anon(), 'users/anyone'), claim()));
  });
  it('invite email case does not bypass the match', async () => {
    const db = as('NewCoach', { email: 'NewCoach@X.test' });
    await assertSucceeds(setDoc(doc(db, 'users/NewCoach'), claim()));
  });

  it('user cannot change own role, school or active', async () => {
    const db = as('coA');
    await assertFails(updateDoc(doc(db, 'users/coA'), { role: 'union_admin' }));
    await assertFails(updateDoc(doc(db, 'users/coA'), { role: 'school_admin' }));
    await assertFails(updateDoc(doc(db, 'users/coA'), { schoolId: 'B' }));
    await assertFails(updateDoc(doc(db, 'users/coA'), { schoolId: null }));
    await assertFails(updateDoc(doc(db, 'users/coA'), { active: false, role: 'registrar' }));
    await assertFails(updateDoc(doc(as('coOff'), 'users/coOff'), { active: true }));
    await assertFails(deleteDoc(doc(db, 'users/coA')));
  });
  it('user can change own displayName and phone', async () => {
    await assertSucceeds(updateDoc(doc(as('coA'), 'users/coA'), { displayName: 'New', phone: '1' }));
  });
  it('school admin escalation attempts', async () => {
    const db = as('saA');
    await assertSucceeds(updateDoc(doc(db, 'users/coA'), { active: false }));
    await assertFails(updateDoc(doc(db, 'users/mgA'), { role: 'school_admin' }));
    await assertFails(updateDoc(doc(db, 'users/mgA'), { active: false, schoolId: 'B' }));
    await assertFails(updateDoc(doc(db, 'users/coB'), { active: false }));
    await assertFails(updateDoc(doc(db, 'users/ua'), { active: false }));
    await assertFails(updateDoc(doc(db, 'users/saA'), { role: 'union_admin' }));
    await assertFails(updateDoc(doc(db, 'users/saOff'), { active: true }));
  });
  it('registrar and coach cannot edit other users', async () => {
    await assertFails(updateDoc(doc(as('rg'), 'users/coA'), { active: false }));
    await assertFails(updateDoc(doc(as('coA'), 'users/mgA'), { active: false }));
  });
  it('union admin manages users', async () => {
    await assertSucceeds(updateDoc(doc(as('ua'), 'users/coA'), { role: 'manager' }));
    await assertSucceeds(deleteDoc(doc(as('ua'), 'users/coB')));
  });
  it('read scope of user documents', async () => {
    await assertSucceeds(getDoc(doc(as('coA'), 'users/coA')));
    await assertFails(getDoc(doc(as('coA'), 'users/mgA')));
    await assertFails(getDocs(collection(as('coA'), 'users')));
    await assertSucceeds(getDoc(doc(as('saA'), 'users/coA')));
    await assertFails(getDoc(doc(as('saA'), 'users/coB')));
    await assertSucceeds(getDocs(query(collection(as('saA'), 'users'), where('schoolId', '==', 'A'))));
    await assertFails(getDocs(collection(as('saA'), 'users')));
    await assertSucceeds(getDoc(doc(as('rg'), 'users/coB')));
  });
});

// ---------------------------------------------------------------------------
describe('deactivated and unknown users', () => {
  it('inactive coach keeps only own user doc and public reads', async () => {
    const db = as('coOff');
    await assertSucceeds(getDoc(doc(db, 'users/coOff')));
    await assertSucceeds(getDoc(doc(db, 'matches/m1')));
    await assertFails(getDoc(doc(db, 'players/pA1')));
    await assertFails(getDocs(query(collection(db, 'players'), where('schoolId', '==', 'A'))));
    await assertFails(setDoc(doc(db, 'players/n'), person({ schoolId: 'A', status: 'draft' })));
    await assertFails(getDoc(doc(db, 'teamRosters/tA')));
    await assertFails(getDoc(doc(db, 'matches/m1/sheets/tA')));
    await assertFails(getDoc(doc(db, 'matches/m1/cards/c1')));
    await assertFails(updateDoc(doc(db, 'matches/m1'), { homeScore: 1 }));
    await assertFails(setDoc(doc(db, 'matches/m1/events/n'), { type: 'try' }));
    await assertFails(setDoc(doc(db, 'auditLogs/n'), { byUid: 'coOff' }));
    await assertFails(setDoc(doc(db, 'idRegistry/n'), { schoolId: 'A' }));
  });
  it('inactive union admin has no power', async () => {
    const db = as('uaOff');
    await assertFails(updateDoc(doc(db, 'settings/competition'), { maxOverAge: 9 }));
    await assertFails(getDoc(doc(db, 'players/pB1')));
    await assertFails(updateDoc(doc(db, 'users/coA'), { role: 'union_admin' }));
    await assertFails(setDoc(doc(db, 'invites/q@x.test'), { role: 'registrar', schoolId: null }));
  });
  it('signed-in user with no user doc has no access', async () => {
    const db = as('ghost');
    await assertFails(getDoc(doc(db, 'players/pA1')));
    await assertFails(setDoc(doc(db, 'auditLogs/n'), { byUid: 'ghost' }));
    await assertSucceeds(getDoc(doc(db, 'schools/A')));
  });
});

// ---------------------------------------------------------------------------
describe('registrar, settings, schools, teams', () => {
  it('registrar verifies players and staff', async () => {
    const db = as('rg');
    await assertSucceeds(updateDoc(doc(db, 'players/pA2'), {
      status: 'verified', registrationNo: 'TL-2026-QWERTY', verifiedBy: 'rg',
    }));
    await assertSucceeds(updateDoc(doc(db, 'players/pA1'), { status: 'suspended', rejectionReason: 'x' }));
    await assertSucceeds(getDoc(doc(db, 'players/pB1')));
    await assertSucceeds(getDoc(doc(db, 'staff/sB1')));
  });
  it('registrar cannot edit settings; union admin can', async () => {
    await assertFails(updateDoc(doc(as('rg'), 'settings/competition'), { maxOverAge: 9 }));
    await assertFails(setDoc(doc(as('saA'), 'settings/competition'), { maxOverAge: 9, overAgeYears: 18 }));
    await assertSucceeds(updateDoc(doc(as('ua'), 'settings/competition'), { maxOverAge: 2 }));
  });
  it('schools: admin edits only own', async () => {
    await assertSucceeds(updateDoc(doc(as('saA'), 'schools/A'), { town: 'T' }));
    await assertFails(updateDoc(doc(as('saA'), 'schools/B'), { town: 'T' }));
    await assertFails(updateDoc(doc(as('coA'), 'schools/A'), { town: 'T' }));
    await assertFails(setDoc(doc(as('saA'), 'schools/N'), { name: 'N' }));
    await assertFails(setDoc(doc(as('rg'), 'schools/N'), { name: 'N' }));
    await assertSucceeds(setDoc(doc(as('ua'), 'schools/N'), { name: 'N' }));
  });
  it('teams: admin manages own school, coach cannot create', async () => {
    await assertSucceeds(setDoc(doc(as('saA'), 'teams/n1'), { schoolId: 'A', name: 'n' }));
    await assertFails(setDoc(doc(as('saA'), 'teams/n2'), { schoolId: 'B', name: 'n' }));
    await assertFails(setDoc(doc(as('coA'), 'teams/n3'), { schoolId: 'A', name: 'n' }));
    await assertSucceeds(updateDoc(doc(as('saA'), 'teams/tA'), { name: 'renamed' }));
    await assertFails(updateDoc(doc(as('saA'), 'teams/tB'), { name: 'renamed' }));
    await assertFails(deleteDoc(doc(as('saA'), 'teams/tB')));
  });
  it('FLAW: school admin cannot reassign own team to another school', async () => {
    await assertFails(updateDoc(doc(as('saA'), 'teams/tA'), { schoolId: 'B' }));
  });
});

// ---------------------------------------------------------------------------
describe('teamRosters and over-age cap', () => {
  it('reads: own school staff, union, scoped scorer only', async () => {
    await assertSucceeds(getDoc(doc(as('coA'), 'teamRosters/tA')));
    await assertSucceeds(getDoc(doc(as('mgA'), 'teamRosters/tA')));
    await assertSucceeds(getDoc(doc(as('rg'), 'teamRosters/tA')));
    await assertSucceeds(getDoc(doc(as('scA'), 'teamRosters/tA')));
    await assertSucceeds(getDoc(doc(as('scAll'), 'teamRosters/tA')));
    await assertFails(getDoc(doc(as('scC'), 'teamRosters/tA')));
    await assertFails(getDoc(doc(as('coB'), 'teamRosters/tA')));
    await assertSucceeds(getDocs(query(collection(as('coA'), 'teamRosters'), where('schoolId', '==', 'A'))));
    await assertFails(getDocs(collection(as('coA'), 'teamRosters')));
  });
  it('allows up to maxOverAge over-age ids, rejects above', async () => {
    const db = as('coA');
    await assertSucceeds(setDoc(doc(db, 'teamRosters/tA'), roster('A', ['a', 'b', 'c'])));
    await assertFails(setDoc(doc(db, 'teamRosters/tA'), roster('A', ['a', 'b', 'c', 'd'])));
    await assertFails(updateDoc(doc(db, 'teamRosters/tA'), { overAgeIds: ['a', 'b', 'c', 'd'] }));
    await assertFails(setDoc(doc(as('rg'), 'teamRosters/tA'), roster('A', ['a', 'b', 'c', 'd'])));
    await assertFails(setDoc(doc(db, 'teamRosters/new'), roster('A', ['a', 'b', 'c', 'd', 'e'])));
  });
  it('cap follows the settings value', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await updateDoc(doc(c.firestore(), 'settings/competition'), { maxOverAge: 1 });
    });
    await assertFails(setDoc(doc(as('coA'), 'teamRosters/tA'), roster('A', ['a', 'b'])));
    await assertSucceeds(setDoc(doc(as('coA'), 'teamRosters/tA'), roster('A', ['a'])));
  });
  it('rejects a roster without overAgeIds', async () => {
    await assertFails(updateDoc(doc(as('coA'), 'teamRosters/tA'), { overAgeIds: null }));
  });
  it('school A cannot write school B roster', async () => {
    const db = as('coA');
    await assertFails(setDoc(doc(db, 'teamRosters/new'), roster('B')));
    await assertFails(updateDoc(doc(db, 'teamRosters/tB'), { playerIds: ['x'] }));
    await assertFails(deleteDoc(doc(db, 'teamRosters/tB')));
  });
  it('FLAW: school A cannot hijack school B roster by rewriting schoolId', async () => {
    await assertFails(setDoc(doc(as('coA'), 'teamRosters/tB'), roster('A', [])));
    await assertFails(updateDoc(doc(as('coA'), 'teamRosters/tB'), { schoolId: 'A' }));
  });
  it('FLAW: school A cannot create a roster for another school team id', async () => {
    await assertFails(setDoc(doc(as('coA'), 'teamRosters/tC'), roster('A')));
  });
  it('only school admin or union delete rosters', async () => {
    await assertFails(deleteDoc(doc(as('coA'), 'teamRosters/tA')));
    await assertSucceeds(deleteDoc(doc(as('saA'), 'teamRosters/tA')));
  });
});

// ---------------------------------------------------------------------------
describe('team sheets', () => {
  it('coach creates a valid sheet for own school', async () => {
    const db = as('coA');
    await assertSucceeds(setDoc(doc(db, 'matches/m2/sheets/tA'), sheet('A')));
    await assertSucceeds(setDoc(doc(db, 'matches/m2/sheets/tA'), sheet('A', { status: 'submitted', overAgeCount: 3 })));
  });
  it('rejects overAgeCount above max and more than 23 entries', async () => {
    const db = as('coA');
    await assertFails(setDoc(doc(db, 'matches/m2/sheets/tA'), sheet('A', { overAgeCount: 4 })));
    await assertFails(setDoc(doc(db, 'matches/m2/sheets/tA'), sheet('A', { entries: entries(24) })));
    await assertSucceeds(setDoc(doc(db, 'matches/m2/sheets/tA'), sheet('A', { entries: entries(23) })));
    await assertFails(updateDoc(doc(db, 'matches/m1/sheets/tA'), { overAgeCount: 4 }));
    await assertFails(updateDoc(doc(db, 'matches/m1/sheets/tA'), { entries: entries(24) }));
    await assertFails(setDoc(doc(as('rg'), 'matches/m2/sheets/new'), sheet('A', { overAgeCount: 4 })));
  });
  it('FLAW: union update of a sheet is also held to the over-age cap', async () => {
    await assertFails(updateDoc(doc(as('rg'), 'matches/m1/sheets/tA'), { overAgeCount: 4 }));
  });
  it('school cannot self-approve', async () => {
    const db = as('coA');
    await assertFails(setDoc(doc(db, 'matches/m2/sheets/tA'), sheet('A', { status: 'approved' })));
    await assertFails(updateDoc(doc(db, 'matches/m1/sheets/tA'), { status: 'approved' }));
    await assertFails(updateDoc(doc(db, 'matches/m1/sheets/tA'), { status: 'rejected' }));
    await assertSucceeds(updateDoc(doc(db, 'matches/m1/sheets/tA'), { status: 'submitted' }));
  });
  it('school cannot edit or delete an approved sheet', async () => {
    const db = as('coA');
    await assertFails(updateDoc(doc(db, 'matches/m1/sheets/tA2'), { entries: entries(16) }));
    await assertFails(updateDoc(doc(db, 'matches/m1/sheets/tA2'), { status: 'draft' }));
    await assertFails(deleteDoc(doc(db, 'matches/m1/sheets/tA2')));
  });
  it('school cannot hand a sheet to another school', async () => {
    await assertFails(updateDoc(doc(as('coA'), 'matches/m1/sheets/tA'), { schoolId: 'B' }));
  });
  it('registrar approves, rejects and resets to draft', async () => {
    const db = as('rg');
    await assertSucceeds(updateDoc(doc(db, 'matches/m1/sheets/tA'), { status: 'approved' }));
    await assertSucceeds(updateDoc(doc(db, 'matches/m1/sheets/tA2'), { status: 'rejected', reviewNote: 'no' }));
    await assertSucceeds(updateDoc(doc(db, 'matches/m1/sheets/tA2'), { status: 'draft' }));
  });
  it('school B cannot write school A sheet', async () => {
    const db = as('coB');
    await assertFails(updateDoc(doc(db, 'matches/m1/sheets/tA'), { status: 'submitted' }));
    await assertFails(updateDoc(doc(db, 'matches/m1/sheets/tA'), { entries: entries(16) }));
    await assertFails(deleteDoc(doc(db, 'matches/m1/sheets/tA')));
    await assertFails(setDoc(doc(db, 'matches/m1/sheets/tA'), sheet('A')));
  });
  it('school A staff cannot create a sheet attributed to school B', async () => {
    await assertFails(setDoc(doc(as('coA'), 'matches/m2/sheets/tB'), sheet('B')));
  });
  it('FLAW: school B cannot squat the sheet slot of school A team', async () => {
    await assertFails(setDoc(doc(as('coB'), 'matches/m2/sheets/tA'), sheet('B')));
  });
  it('FLAW: a school outside the match cannot create a sheet for it', async () => {
    await assertFails(setDoc(doc(as('coC'), 'matches/m1/sheets/tC'), sheet('C')));
  });
  it('read access: both schools, scorers of the match, union; nobody else', async () => {
    await assertSucceeds(getDoc(doc(as('coA'), 'matches/m1/sheets/tA')));
    await assertSucceeds(getDoc(doc(as('coB'), 'matches/m1/sheets/tA')));
    await assertSucceeds(getDoc(doc(as('scA'), 'matches/m1/sheets/tA')));
    await assertSucceeds(getDoc(doc(as('scAll'), 'matches/m1/sheets/tA')));
    await assertSucceeds(getDoc(doc(as('rg'), 'matches/m1/sheets/tA')));
    await assertFails(getDoc(doc(as('coC'), 'matches/m1/sheets/tA')));
    await assertFails(getDoc(doc(as('scC'), 'matches/m1/sheets/tA')));
    await assertFails(getDoc(doc(anon(), 'matches/m1/sheets/tA')));
  });
  it('school deletes drafts only', async () => {
    await assertSucceeds(deleteDoc(doc(as('coA'), 'matches/m1/sheets/tA')));
  });
});

// ---------------------------------------------------------------------------
describe('matches, events, cards', () => {
  it('create: school staff only with own school in the fixture', async () => {
    await assertSucceeds(setDoc(doc(as('coA'), 'matches/n1'), match({ schoolIds: ['A', 'B'] })));
    await assertFails(setDoc(doc(as('coC'), 'matches/n2'), match({ schoolIds: ['A', 'B'] })));
    await assertFails(setDoc(doc(as('scA'), 'matches/n3'), match()));
    await assertSucceeds(setDoc(doc(as('rg'), 'matches/n4'), match()));
    await assertFails(setDoc(doc(anon(), 'matches/n5'), match()));
  });
  it('open match: scoring staff may update, outsiders may not', async () => {
    await assertSucceeds(updateDoc(doc(as('coA'), 'matches/m1'), { homeScore: 5 }));
    await assertSucceeds(updateDoc(doc(as('scA'), 'matches/m1'), { homeScore: 5 }));
    await assertSucceeds(updateDoc(doc(as('scAll'), 'matches/m1'), { homeScore: 5 }));
    await assertFails(updateDoc(doc(as('scC'), 'matches/m1'), { homeScore: 5 }));
    await assertFails(updateDoc(doc(as('coC'), 'matches/m1'), { homeScore: 5 }));
    await assertFails(updateDoc(doc(anon(), 'matches/m1'), { homeScore: 5 }));
  });
  it('final match: only union can edit; only union admin deletes', async () => {
    await assertFails(updateDoc(doc(as('coA'), 'matches/mFinal'), { homeScore: 50 }));
    await assertFails(updateDoc(doc(as('saA'), 'matches/mFinal'), { status: 'live' }));
    await assertFails(updateDoc(doc(as('scA'), 'matches/mFinal'), { homeScore: 50 }));
    await assertFails(updateDoc(doc(as('scAll'), 'matches/mFinal'), { homeScore: 50 }));
    await assertSucceeds(updateDoc(doc(as('rg'), 'matches/mFinal'), { homeScore: 50 }));
    await assertSucceeds(updateDoc(doc(as('ua'), 'matches/mFinal'), { homeScore: 51 }));
    await assertFails(deleteDoc(doc(as('rg'), 'matches/mFinal')));
    await assertSucceeds(deleteDoc(doc(as('ua'), 'matches/mFinal')));
  });
  it('events: public read, only match staff write while open', async () => {
    const ev = { type: 'try', teamId: 'tA', playerId: 'pA1', playerDisplay: 'T. Moyo', minute: 7 };
    await assertSucceeds(getDoc(doc(anon(), 'matches/m1/events/e1')));
    await assertFails(setDoc(doc(anon(), 'matches/m1/events/n'), ev));
    await assertFails(deleteDoc(doc(anon(), 'matches/m1/events/e1')));
    await assertSucceeds(setDoc(doc(as('scA'), 'matches/m1/events/n'), ev));
    await assertSucceeds(setDoc(doc(as('coB'), 'matches/m1/events/n2'), ev));
    await assertFails(setDoc(doc(as('scC'), 'matches/m1/events/n3'), ev));
    await assertFails(setDoc(doc(as('coC'), 'matches/m1/events/n3'), ev));
    await assertFails(updateDoc(doc(as('scC'), 'matches/m1/events/e1'), { minute: 1 }));
    await assertFails(deleteDoc(doc(as('scC'), 'matches/m1/events/e1')));
  });
  it('events on a final match: union only', async () => {
    const ev = { type: 'try', teamId: 'tA', playerId: 'pA1', playerDisplay: 'T. Moyo', minute: 7 };
    await assertFails(setDoc(doc(as('scA'), 'matches/mFinal/events/n'), ev));
    await assertFails(updateDoc(doc(as('coA'), 'matches/mFinal/events/e1'), { minute: 1 }));
    await assertFails(deleteDoc(doc(as('scA'), 'matches/mFinal/events/e1')));
    await assertSucceeds(updateDoc(doc(as('rg'), 'matches/mFinal/events/e1'), { minute: 1 }));
  });
  it('cards are not public', async () => {
    await assertFails(getDoc(doc(anon(), 'matches/m1/cards/c1')));
    await assertFails(getDocs(collection(anon(), 'matches/m1/cards')));
    await assertFails(setDoc(doc(anon(), 'matches/m1/cards/n'), { type: 'red' }));
    await assertFails(getDoc(doc(as('scC'), 'matches/m1/cards/c1')));
    await assertFails(getDoc(doc(as('coC'), 'matches/m1/cards/c1')));
    await assertSucceeds(getDoc(doc(as('scA'), 'matches/m1/cards/c1')));
    await assertSucceeds(getDoc(doc(as('coB'), 'matches/m1/cards/c1')));
    await assertSucceeds(getDoc(doc(as('rg'), 'matches/m1/cards/c1')));
  });
  it('cards: only match staff write, only while open', async () => {
    const c = { type: 'yellow', teamId: 'tA', playerId: 'pA1', playerName: 'T Moyo', minute: 9 };
    await assertSucceeds(setDoc(doc(as('scA'), 'matches/m1/cards/n'), c));
    await assertFails(setDoc(doc(as('scC'), 'matches/m1/cards/n2'), c));
    await assertFails(setDoc(doc(as('scA'), 'matches/mFinal/cards/n'), c));
    await assertSucceeds(setDoc(doc(as('ua'), 'matches/mFinal/cards/n'), c));
  });
});

// ---------------------------------------------------------------------------
describe('auditLogs', () => {
  it('create-only with own byUid', async () => {
    const log = (byUid: string) => ({ action: 'x', targetType: 'player', targetId: 'p', byUid, byName: 'N' });
    await assertSucceeds(setDoc(doc(as('coA'), 'auditLogs/n1'), log('coA')));
    await assertSucceeds(setDoc(doc(as('rg'), 'auditLogs/n2'), log('rg')));
    await assertFails(setDoc(doc(as('coA'), 'auditLogs/n3'), log('rg')));
    await assertFails(setDoc(doc(as('coA'), 'auditLogs/n4'), { action: 'x' }));
    await assertFails(setDoc(doc(anon(), 'auditLogs/n5'), log('rg')));
  });
  it('cannot be edited or deleted, even by union admin', async () => {
    await assertFails(updateDoc(doc(as('ua'), 'auditLogs/al1'), { action: 'tampered' }));
    await assertFails(deleteDoc(doc(as('ua'), 'auditLogs/al1')));
    await assertFails(updateDoc(doc(as('rg'), 'auditLogs/al1'), { action: 'tampered' }));
    await assertFails(deleteDoc(doc(as('rg'), 'auditLogs/al1')));
  });
  it('only union reads', async () => {
    await assertSucceeds(getDoc(doc(as('rg'), 'auditLogs/al1')));
    await assertSucceeds(getDocs(collection(as('ua'), 'auditLogs')));
    await assertFails(getDoc(doc(as('saA'), 'auditLogs/al1')));
    await assertFails(getDoc(doc(as('coA'), 'auditLogs/al1')));
  });
});
