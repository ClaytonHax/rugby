import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc, collection, doc, onSnapshot, serverTimestamp,
  type DocumentReference, type Query,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { getActorName } from './auth';
import { DEFAULT_SETTINGS } from './eligibility';
import type { CompetitionSettings, School } from './types';

export interface CollectionState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  /** Subscribe again after an error. */
  retry: () => void;
}
export interface DocState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

function errorCode(err: unknown): string {
  return typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
}

/**
 * Plain-language text for any error. Firebase errors (they carry a `code`) never reach the user as raw text;
 * errors thrown by this app's own code already have a readable message and pass through.
 */
export function friendlyError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const code = errorCode(err);
  if (code) {
    const short = code.replace(/^(firestore|auth|functions)\//, '');
    if (short === 'permission-denied') return 'You do not have permission to do that.';
    if (['unavailable', 'deadline-exceeded', 'network-request-failed', 'cancelled'].includes(short)) {
      return 'No connection. Check your signal and try again.';
    }
    if (short === 'not-found') return 'That record could not be found. It may have been removed.';
    if (short === 'already-exists') return 'That already exists.';
    if (short === 'resource-exhausted') return 'The service is busy right now. Wait a minute and try again.';
    if (short === 'unauthenticated') return 'You are signed out. Sign in again.';
    if (short === 'failed-precondition' || short === 'aborted') return 'Someone else changed this at the same time. Reload the page and try again.';
    return fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function describe(err: unknown): string {
  if (errorCode(err) === 'permission-denied') return 'You do not have permission to see this.';
  if (errorCode(err) === 'unavailable') return 'You appear to be offline. Showing saved data where possible.';
  return friendlyError(err, 'Could not load data. Check your signal and try again.');
}

type Deps = readonly unknown[];
const sameDeps = (a: Deps, b: Deps) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * Live collection. `build` returns a Query (or null to skip). `deps` must list everything the query depends on.
 * Each item has `id` set to the document id. `loading` is true from the render in which deps change, not one
 * render later, so pages never flash an empty list for the new query.
 */
export function useCollection<T>(build: () => Query | null, deps: Deps): CollectionState<T> {
  const [state, setState] = useState<{ data: T[]; loading: boolean; error: string | null; deps: Deps }>({ data: [], loading: true, error: null, deps });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    const q = build();
    if (!q) {
      setState({ data: [], loading: false, error: null, deps });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null, deps }));
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T), loading: false, error: null, deps }),
      (err) => setState({ data: [], loading: false, error: describe(err), deps }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);
  return { data: state.data, loading: state.loading || !sameDeps(state.deps, deps), error: state.error, retry };
}

/** Live single document. `data` is null if it does not exist. */
export function useDoc<T>(build: () => DocumentReference | null, deps: Deps): DocState<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null; deps: Deps }>({ data: null, loading: true, error: null, deps });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    const ref = build();
    if (!ref) {
      setState({ data: null, loading: false, error: null, deps });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null, deps }));
    return onSnapshot(
      ref,
      (snap) => setState({ data: snap.exists() ? ({ ...snap.data(), id: snap.id } as T) : null, loading: false, error: null, deps }),
      (err) => setState({ data: null, loading: false, error: describe(err), deps }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);
  return { data: state.data, loading: state.loading || !sameDeps(state.deps, deps), error: state.error, retry };
}

/**
 * Waits for the server to confirm a write. With no signal Firestore keeps the write on the device and syncs it later,
 * but the promise stays pending, so after `ms` this reports 'queued' and the page can say so instead of spinning forever.
 * If a queued write is later refused, `onLateError` is called.
 */
export async function confirmWrite(write: Promise<unknown>, onLateError?: (err: unknown) => void, ms = 6000): Promise<'saved' | 'queued'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queued = false;
  const timeout = new Promise<'queued'>((resolve) => { timer = setTimeout(() => { queued = true; resolve('queued'); }, ms); });
  const done = write.then(() => 'saved' as const, (err: unknown) => {
    if (!queued) throw err;
    onLateError?.(err);
    return 'queued' as const;
  });
  try {
    return await Promise.race([done, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Success text that is honest when the change is only saved on this device so far. */
export function savedText(done: string, outcome: 'saved' | 'queued'): string {
  return outcome === 'saved' ? done : `${done.replace(/\.$/, '')} on this device. It will sync when you are back online.`;
}

export function useSettings(): { settings: CompetitionSettings; loading: boolean } {
  const { data, loading } = useDoc<CompetitionSettings>(() => doc(db, 'settings', 'competition'), []);
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...(data ?? {}) }), [data]);
  return { settings, loading };
}

export function useSchools(): CollectionState<School> & { byId: Record<string, School> } {
  const state = useCollection<School>(() => collection(db, 'schools'), []);
  const sorted = useMemo(() => [...state.data].sort((a, b) => a.name.localeCompare(b.name)), [state.data]);
  const byId = useMemo(() => Object.fromEntries(sorted.map((s) => [s.id, s])), [sorted]);
  return { ...state, data: sorted, byId };
}

export async function writeAudit(action: string, targetType: string, targetId: string, detail?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  // Not awaited: with no signal the write waits on the device and syncs later, and the action that caused it must not hang on it.
  void addDoc(collection(db, 'auditLogs'), {
    action, targetType, targetId,
    ...(detail ? { detail } : {}),
    byUid: user.uid,
    byName: getActorName() || user.email || 'Unknown',
    at: serverTimestamp(),
  }).catch(() => undefined);
}
