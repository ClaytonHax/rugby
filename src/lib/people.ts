// Registration of players and staff: duplicate-ID prevention, submission, verification actions.
import {
  collection, deleteField, doc, getDoc, query, runTransaction, serverTimestamp, updateDoc, where,
  writeBatch, type Query,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { writeAudit } from './data';
import { deleteDocument, docId } from './documents';
import type {
  DocType, IdType, Player, RecordStatus, Role, Staff, StaffRole,
} from './types';

export type PersonKind = 'player' | 'staff';
export type AnyPerson = Player | Staff;

export function collectionName(kind: PersonKind): 'players' | 'staff' {
  return kind === 'player' ? 'players' : 'staff';
}

export function personName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

export const ID_TYPE_LABELS: Record<IdType, string> = {
  birth_certificate: 'Birth certificate',
  national_id: 'National ID',
  passport: 'Passport',
};
export const ID_TYPES = Object.keys(ID_TYPE_LABELS) as IdType[];

/** Registrar and union administrator verify records and may edit any of them. */
export function isUnionRole(role: Role | undefined): boolean {
  return role === 'union_admin' || role === 'registrar';
}
/** Mirrors idRegistry delete rules: only these roles can move an ID registry entry. */
export function canChangeIdNumber(role: Role | undefined): boolean {
  return isUnionRole(role) || role === 'school_admin';
}

export function personsQuery(kind: PersonKind, schoolId: string | null, unionWide: boolean): Query | null {
  const c = collection(db, collectionName(kind));
  if (schoolId) return query(c, where('schoolId', '==', schoolId));
  return unionWide ? query(c) : null; // school-level users MUST filter by school
}

// ---------------------------------------------------------------- ID registry

export function normaliseId(idType: IdType, idNumber: string): string {
  return `${idType}:${idNumber.toUpperCase().replace(/[\s-]/g, '')}`;
}

export async function idHash(idType: IdType, idNumber: string): Promise<string> {
  const data = new TextEncoder().encode(normaliseId(idType, idNumber));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export class DuplicateIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateIdError';
  }
}

interface RegistryEntry { ownerType: PersonKind; ownerId: string; schoolId: string }

async function describeConflict(entry: RegistryEntry, mySchoolId: string): Promise<string> {
  const what = entry.ownerType === 'player' ? 'player' : 'staff member';
  if (entry.schoolId === mySchoolId) {
    try {
      const snap = await getDoc(doc(db, collectionName(entry.ownerType), entry.ownerId));
      if (snap.exists()) {
        const p = snap.data() as AnyPerson;
        return `This ID number is already registered at your school as the ${what} ${personName(p)}. Open that record instead of registering again.`;
      }
    } catch { /* fall through to the generic message */ }
  }
  return `This ID number is already registered as a ${what}. A person can only be registered once.`;
}

// ---------------------------------------------------------------- inputs

export interface PersonCore {
  schoolId: string;
  schoolName: string;
  firstName: string;
  lastName: string;
  dob: string;
  idType: IdType;
  idNumber: string;
}
export interface PlayerInput extends PersonCore {
  position: string;
  secondaryPosition?: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;
  consentGiven: boolean;
}
export interface StaffInput extends PersonCore {
  staffRole: StaffRole;
  phone: string;
  email?: string;
  qualification?: string;
}
export type PersonInput = PlayerInput | StaffInput;
export type PersonPatch =
  Partial<Omit<PlayerInput, 'schoolId' | 'schoolName'>> & Partial<Omit<StaffInput, 'schoolId' | 'schoolName'>>;

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You are signed out. Sign in again.');
  return uid;
}

/** Drops undefined and blank optional strings so Firestore never receives undefined. */
function clean(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (typeof v === 'string') {
      const t = v.trim();
      if (t === '' && (k === 'secondaryPosition' || k === 'guardianEmail' || k === 'email' || k === 'qualification')) continue;
      out[k] = t;
    } else out[k] = v;
  }
  return out;
}

/** Returns an error message per field, or an empty object when valid. */
export function validateDob(dob: string, kind: PersonKind, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return 'Enter a date of birth.';
  const d = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'That date does not exist.';
  if (dob > today) return 'Date of birth cannot be in the future.';
  const age = Number(today.slice(0, 4)) - Number(dob.slice(0, 4));
  if (kind === 'player' && (age < 9 || age > 25)) return 'Check the date of birth: players are normally between 9 and 25.';
  if (kind === 'staff' && age < 17) return 'Staff must be at least 17.';
  return null;
}

// ---------------------------------------------------------------- create / update / delete

/** Creates a draft record and its idRegistry entry together. Returns the new record id. */
export async function createPerson(kind: PersonKind, input: PersonInput): Promise<string> {
  const uid = requireUid();
  const hash = await idHash(input.idType, input.idNumber);
  const regRef = doc(db, 'idRegistry', hash);
  const personRef = doc(collection(db, collectionName(kind)));
  const data: Record<string, unknown> = {
    ...clean({ ...input }),
    status: 'draft' satisfies RecordStatus,
    teamIds: [],
    docTypes: [],
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (kind === 'player' && (input as PlayerInput).consentGiven) {
    data.consentRecordedBy = uid;
    data.consentAt = serverTimestamp();
  }
  const entry: RegistryEntry = { ownerType: kind, ownerId: personRef.id, schoolId: input.schoolId };
  const conflict = await runTransaction(db, async (tx) => {
    const existing = await tx.get(regRef);
    if (existing.exists()) return existing.data() as RegistryEntry;
    tx.set(personRef, data);
    tx.set(regRef, entry);
    return null;
  });
  if (conflict) throw new DuplicateIdError(await describeConflict(conflict, input.schoolId));
  return personRef.id;
}

/**
 * Updates a record. If idType/idNumber change, the idRegistry entry moves in the same transaction.
 * A rejected record becomes a draft again (the rules only allow draft/pending after an edit).
 */
export async function updatePerson(kind: PersonKind, before: AnyPerson, patch: PersonPatch): Promise<void> {
  const uid = requireUid();
  const personRef = doc(db, collectionName(kind), before.id);
  const next = clean({ ...patch });
  const newType = (next.idType as IdType | undefined) ?? before.idType;
  const newNumber = (next.idNumber as string | undefined) ?? before.idNumber;
  const idChanged = normaliseId(newType, newNumber) !== normaliseId(before.idType, before.idNumber);
  const update: Record<string, unknown> = { ...next, updatedAt: serverTimestamp() };
  for (const k of ['secondaryPosition', 'guardianEmail', 'email', 'qualification'] as const) {
    if (k in patch && !(k in next)) update[k] = deleteField();
  }
  if (before.status === 'rejected') update.status = 'draft';
  if (kind === 'player' && 'consentGiven' in patch) {
    const had = (before as Player).consentGiven;
    if (patch.consentGiven && !had) {
      update.consentRecordedBy = uid;
      update.consentAt = serverTimestamp();
    } else if (!patch.consentGiven && had) {
      update.consentRecordedBy = deleteField();
      update.consentAt = deleteField();
    }
  }

  if (!idChanged) {
    await updateDoc(personRef, update);
    return;
  }
  const oldRef = doc(db, 'idRegistry', await idHash(before.idType, before.idNumber));
  const newRef = doc(db, 'idRegistry', await idHash(newType, newNumber));
  try {
    const conflict = await runTransaction(db, async (tx) => {
      const [oldSnap, newSnap] = await Promise.all([tx.get(oldRef), tx.get(newRef)]);
      if (newSnap.exists() && (newSnap.data() as RegistryEntry).ownerId !== before.id) return newSnap.data() as RegistryEntry;
      if (oldSnap.exists() && (oldSnap.data() as RegistryEntry).ownerId === before.id) tx.delete(oldRef);
      tx.set(newRef, { ownerType: kind, ownerId: before.id, schoolId: before.schoolId } satisfies RegistryEntry);
      tx.update(personRef, update);
      return null;
    });
    if (conflict) throw new DuplicateIdError(await describeConflict(conflict, before.schoolId));
  } catch (err) {
    if (typeof err === 'object' && err && 'code' in err && (err as { code: unknown }).code === 'permission-denied') {
      throw new Error('You are not allowed to change the ID number. Ask your school administrator or a registrar to correct it.');
    }
    throw err;
  }
  // The document stored for the old ID type no longer matches; clear it (best effort).
  if (newType !== before.idType) {
    try { await deleteDocument(docId(kind, before.id, before.idType)); } catch { /* optional cleanup */ }
  }
}

/** Deletes a draft with its documents and ID registry entry so the ID can be registered again. */
export async function deleteDraftPerson(kind: PersonKind, p: AnyPerson): Promise<void> {
  if (p.status !== 'draft') throw new Error('Only drafts can be deleted.');
  for (const t of p.docTypes) await deleteDocument(docId(kind, p.id, t));
  const batch = writeBatch(db);
  batch.delete(doc(db, 'idRegistry', await idHash(p.idType, p.idNumber)));
  batch.delete(doc(db, collectionName(kind), p.id));
  await batch.commit();
  await writeAudit(`${kind}.deleted`, kind, p.id, `Draft deleted: ${personName(p)}`);
}

// ---------------------------------------------------------------- submission

export function idDocType(p: Pick<AnyPerson, 'idType'>): DocType {
  return p.idType;
}

/** What is still missing before a record may move from draft to pending. Empty means ready. */
export function missingForSubmission(kind: PersonKind, p: AnyPerson): string[] {
  const missing: string[] = [];
  if (!p.firstName || !p.lastName) missing.push('Name');
  if (!p.dob) missing.push('Date of birth');
  if (!p.idNumber) missing.push('ID number');
  if (!p.docTypes.includes('photo')) missing.push('Photo');
  if (!p.docTypes.includes(idDocType(p))) missing.push(`${ID_TYPE_LABELS[p.idType]} document`);
  if (kind === 'player') {
    const pl = p as Player;
    if (!pl.position) missing.push('Position');
    if (!pl.guardianName || !pl.guardianPhone) missing.push('Guardian name and phone');
    if (!pl.consentGiven) missing.push('Guardian consent');
  } else {
    const st = p as Staff;
    if (!st.phone) missing.push('Phone number');
  }
  return missing;
}

async function fresh(kind: PersonKind, id: string): Promise<AnyPerson> {
  const snap = await getDoc(doc(db, collectionName(kind), id));
  if (!snap.exists()) throw new Error('This record no longer exists.');
  return { ...snap.data(), id: snap.id } as AnyPerson;
}

export async function submitForVerification(kind: PersonKind, id: string): Promise<void> {
  const p = await fresh(kind, id);
  if (p.status !== 'draft' && p.status !== 'rejected') throw new Error('This record has already been submitted.');
  const missing = missingForSubmission(kind, p);
  if (missing.length) throw new Error(`Still needed: ${missing.join(', ')}.`);
  await updateDoc(doc(db, collectionName(kind), id), {
    status: 'pending',
    rejectionReason: deleteField(),
    updatedAt: serverTimestamp(),
  });
  await writeAudit(`${kind}.submitted`, kind, id, personName(p));
}

// ---------------------------------------------------------------- registrar actions

const REG_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1: easy to read out on a phone

/** TL-<year>-<6 upper-case alphanumerics> */
export function generateRegistrationNo(year = new Date().getFullYear()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const code = Array.from(bytes, (b) => REG_ALPHABET[b % REG_ALPHABET.length]).join('');
  return `TL-${year}-${code}`;
}

async function transition(
  kind: PersonKind,
  id: string,
  from: RecordStatus[],
  build: (p: AnyPerson, uid: string) => Record<string, unknown>,
): Promise<AnyPerson> {
  const uid = requireUid();
  const ref = doc(db, collectionName(kind), id);
  const p = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('This record no longer exists.');
    const cur = { ...snap.data(), id: snap.id } as AnyPerson;
    if (!from.includes(cur.status)) throw new Error(`This record is ${cur.status} and cannot be changed that way. Reload the page.`);
    tx.update(ref, { ...build(cur, uid), updatedAt: serverTimestamp() });
    return cur;
  });
  return p;
}

function requireReason(reason: string): string {
  const r = reason.trim();
  if (r.length < 3) throw new Error('A reason is required.');
  return r;
}

export async function verifyPerson(kind: PersonKind, id: string): Promise<string> {
  let regNo = '';
  const p = await transition(kind, id, ['pending'], (cur, uid) => {
    const missing = missingForSubmission(kind, cur);
    if (missing.length) throw new Error(`Cannot verify yet. Still needed: ${missing.join(', ')}.`);
    regNo = cur.registrationNo || generateRegistrationNo();
    return {
      status: 'verified', registrationNo: regNo, verifiedBy: uid, verifiedAt: serverTimestamp(),
      rejectionReason: deleteField(),
    };
  });
  await writeAudit(`${kind}.verified`, kind, id, `${personName(p)} (${regNo})`);
  return regNo;
}

export async function rejectPerson(kind: PersonKind, id: string, reason: string): Promise<void> {
  const r = requireReason(reason);
  const p = await transition(kind, id, ['pending'], () => ({ status: 'rejected', rejectionReason: r }));
  await writeAudit(`${kind}.rejected`, kind, id, `${personName(p)}: ${r}`);
}

/** The reason is stored in `rejectionReason`, which is cleared again on reinstatement. */
export async function suspendPerson(kind: PersonKind, id: string, reason: string): Promise<void> {
  const r = requireReason(reason);
  const p = await transition(kind, id, ['verified'], () => ({ status: 'suspended', rejectionReason: r }));
  await writeAudit(`${kind}.suspended`, kind, id, `${personName(p)}: ${r}`);
}

export async function reinstatePerson(kind: PersonKind, id: string): Promise<void> {
  const p = await transition(kind, id, ['suspended'], () => ({ status: 'verified', rejectionReason: deleteField() }));
  await writeAudit(`${kind}.reinstated`, kind, id, personName(p));
}
