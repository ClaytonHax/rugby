// Identity documents and photos, stored as chunked Firestore documents (no Storage bucket).
// Upload order (matters for the security rules, which read the parent document when chunks are written):
//   1. delete old chunks   2. write metadata with complete:false   3. write chunks one by one
//   4. set complete:true   5. add the type to `docTypes` on the person.
// Document bytes are never logged or placed anywhere public.
import {
  arrayRemove, arrayUnion, Bytes, collection, deleteDoc, doc, getDoc, query, serverTimestamp,
  getDocs, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { useCollection, type CollectionState } from './data';
import type { DocOwnerType, DocType, Role, StoredDocument } from './types';

export interface DocOwner {
  ownerType: DocOwnerType;
  /** Sheets use `${matchId}_${teamId}`. */
  ownerId: string;
  schoolId: string;
}

export const CHUNK_BYTES = 900 * 1024;
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
const IMAGE_MAX_SIDE = 1600;
const PHOTO_MAX_SIDE = 800;
const JPEG_QUALITY = 0.8;

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  photo: 'Passport-style photo',
  birth_certificate: 'Birth certificate',
  national_id: 'National ID',
  passport: 'Passport',
  qualification: 'Qualification certificate',
  team_sheet: 'Scanned team sheet',
};

export function docId(ownerType: DocOwnerType, ownerId: string, type: DocType): string {
  return `${ownerType}_${ownerId}_${type}`;
}

/** Which roles can open the bytes of a document (mirrors the rules for chunk reads). */
export function canViewDocument(role: Role | undefined, type: DocType): boolean {
  if (!role) return false;
  if (role === 'union_admin' || role === 'registrar' || role === 'school_admin') return true;
  return (role === 'coach' || role === 'manager') && (type === 'photo' || type === 'team_sheet');
}

function errorCode(err: unknown): string {
  return typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
}

/** Turns Firestore errors into messages a teacher on a touchline can act on. */
export function friendlyDocError(err: unknown): string {
  const code = errorCode(err);
  if (code === 'permission-denied') {
    return 'You are not allowed to change this document. Verified records can only be changed by a registrar.';
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return 'The connection dropped. Check your signal and try again.';
  }
  return errorCode(err) ? 'Something went wrong with the document. Please try again.' : err instanceof Error ? err.message : 'Something went wrong with the document.';
}

function personCollection(ownerType: DocOwnerType): 'players' | 'staff' | null {
  if (ownerType === 'player') return 'players';
  if (ownerType === 'staff') return 'staff';
  return null;
}

const WRITE_TIMEOUT_MS = 25_000;

/** Offline, Firestore queues a write and never answers; give up after a while so the upload can report it. */
function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject({ code: 'deadline-exceeded' }), WRITE_TIMEOUT_MS); });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await withTimeout(fn());
    } catch (err) {
      last = err;
      const code = errorCode(err);
      if (code === 'permission-denied' || code === 'invalid-argument' || code === 'not-found') throw err;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw last;
}

async function compressImage(file: File, maxSide: number): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This image could not be read. Try a JPEG or PNG picture.');
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot process images.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new Error('The image could not be compressed.');
    return blob;
  } finally {
    bitmap.close();
  }
}

async function deleteChunks(id: string, count: number): Promise<void> {
  // Deleted by index (not listed) because coaches may not read ID chunks, but may delete them.
  for (let i = 0; i < count; i++) {
    await withRetry(() => deleteDoc(doc(db, 'documents', id, 'chunks', String(i))));
  }
}

/**
 * Compresses (images) or validates (PDF), then uploads in the order the rules need.
 * `onProgress` receives a fraction between 0 and 1. Resolves with the document id.
 */
export async function uploadDocument(
  owner: DocOwner,
  type: DocType,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('You are signed out. Sign in again to upload.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('You are offline. Connect to the internet to upload documents, then try again.');
  }
  const isPdf = file.type === 'application/pdf';
  const isImage = file.type.startsWith('image/');
  if (!isPdf && !isImage) throw new Error('Choose a photo or a PDF.');
  if (type === 'photo' && !isImage) throw new Error('The photo must be a picture, not a PDF.');
  if ((type === 'team_sheet') !== (owner.ownerType === 'sheet')) throw new Error('That document type does not belong here.');

  const report = (f: number) => onProgress?.(Math.max(0, Math.min(1, f)));
  report(0);

  let blob: Blob;
  let contentType: string;
  let fileName = file.name || type;
  if (isPdf) {
    if (file.size > MAX_PDF_BYTES) throw new Error('That PDF is larger than 5 MB. Scan it at a lower quality or send a photo instead.');
    blob = file;
    contentType = 'application/pdf';
  } else {
    blob = await compressImage(file, type === 'photo' ? PHOTO_MAX_SIDE : IMAGE_MAX_SIDE);
    contentType = 'image/jpeg';
    fileName = fileName.replace(/\.[^.]+$/, '') + '.jpg';
  }
  if (blob.size > MAX_PDF_BYTES) throw new Error('That file is larger than 5 MB after compression.');
  report(0.05);

  const id = docId(owner.ownerType, owner.ownerId, type);
  const ref = doc(db, 'documents', id);
  const personColl = personCollection(owner.ownerType);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkCount = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES));

  try {
    // 1. Clear what was there, and stop counting the old file as uploaded.
    // A query (filtered by school, as the rules require) rather than getDoc: the rules deny reading a document that does not exist yet.
    const found = await getDocs(query(
      collection(db, 'documents'),
      where('schoolId', '==', owner.schoolId),
      where('ownerType', '==', owner.ownerType),
      where('ownerId', '==', owner.ownerId),
      where('type', '==', type),
    ));
    const old = found.docs.find((d) => d.id === id);
    if (old) {
      if (personColl) await withRetry(() => updateDoc(doc(db, personColl, owner.ownerId), { docTypes: arrayRemove(type) }));
      await deleteChunks(id, (old.data() as StoredDocument).chunkCount ?? 0);
    }
    // 2. Metadata first: the chunk rules read this document.
    await withRetry(() => setDoc(ref, {
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      schoolId: owner.schoolId,
      type,
      fileName,
      contentType,
      size: bytes.length,
      chunkCount,
      complete: false,
      uploadedBy: user.uid,
      uploadedAt: serverTimestamp(),
    }));
    // 3. Chunks.
    for (let i = 0; i < chunkCount; i++) {
      const part = bytes.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES);
      await withRetry(() => setDoc(doc(db, 'documents', id, 'chunks', String(i)), { data: Bytes.fromUint8Array(part) }));
      report(0.05 + 0.9 * ((i + 1) / chunkCount));
    }
    // 4. Mark complete, 5. record on the person.
    await withRetry(() => updateDoc(ref, { complete: true }));
    if (personColl) {
      await withRetry(() => updateDoc(doc(db, personColl, owner.ownerId), { docTypes: arrayUnion(type), updatedAt: serverTimestamp() }));
    }
  } catch (err) {
    throw new Error(friendlyDocError(err));
  }
  report(1);
  return id;
}

export interface LoadedDocument {
  url: string;
  contentType: string;
  fileName: string;
}

/** Reassembles a document into a Blob and returns an object URL. The caller must revoke it. */
export async function loadDocument(id: string): Promise<LoadedDocument> {
  let meta: StoredDocument;
  const parts: Uint8Array[] = [];
  try {
    const snap = await getDoc(doc(db, 'documents', id));
    if (!snap.exists()) throw new Error('This document has not been uploaded.');
    meta = snap.data() as StoredDocument;
    if (!meta.complete) throw new Error('This upload did not finish. Ask for it to be uploaded again.');
    for (let i = 0; i < meta.chunkCount; i++) {
      const chunk = await withRetry(() => getDoc(doc(db, 'documents', id, 'chunks', String(i))));
      if (!chunk.exists()) throw new Error('Part of this document is missing. Ask for it to be uploaded again.');
      parts.push((chunk.get('data') as Bytes).toUint8Array());
    }
  } catch (err) {
    if (errorCode(err) === 'permission-denied') throw new Error('Your role is not allowed to open this document.');
    throw err instanceof Error ? err : new Error(friendlyDocError(err));
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  if (total !== meta.size) throw new Error('This document is damaged. Ask for it to be uploaded again.');
  const blob = new Blob(parts as BlobPart[], { type: meta.contentType });
  return { url: URL.createObjectURL(blob), contentType: meta.contentType, fileName: meta.fileName };
}

export async function getDocumentBlobUrl(id: string): Promise<string> {
  return (await loadDocument(id)).url;
}

/** Removes the chunks, the metadata and the entry in the person's `docTypes`. */
export async function deleteDocument(id: string): Promise<void> {
  try {
    const ref = doc(db, 'documents', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const meta = snap.data() as StoredDocument;
    const personColl = personCollection(meta.ownerType);
    if (personColl) await withRetry(() => updateDoc(doc(db, personColl, meta.ownerId), { docTypes: arrayRemove(meta.type) }));
    await deleteChunks(id, meta.chunkCount);
    await withRetry(() => deleteDoc(ref));
  } catch (err) {
    throw new Error(friendlyDocError(err));
  }
}

/** Live metadata for one owner's documents. Always filters by schoolId, as the rules require. */
export function useOwnerDocuments(owner: DocOwner | null): CollectionState<StoredDocument> & { byType: Partial<Record<DocType, StoredDocument>> } {
  const state = useCollection<StoredDocument>(() => owner
    ? query(
        collection(db, 'documents'),
        where('schoolId', '==', owner.schoolId),
        where('ownerType', '==', owner.ownerType),
        where('ownerId', '==', owner.ownerId),
      )
    : null, [owner?.schoolId, owner?.ownerType, owner?.ownerId]);
  const byType: Partial<Record<DocType, StoredDocument>> = {};
  for (const d of state.data) byType[d.type] = d;
  return { ...state, byType };
}
