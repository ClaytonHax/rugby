import { useEffect, useMemo, useState } from 'react';
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
}
export interface DocState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function describe(err: unknown): string {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
  if (code === 'permission-denied') return 'You do not have permission to see this.';
  if (code === 'unavailable') return 'You appear to be offline. Showing saved data where possible.';
  return err instanceof Error ? err.message : 'Could not load data.';
}

/**
 * Live collection. `build` returns a Query (or null to skip). `deps` must list everything the query depends on.
 * Each item has `id` set to the document id.
 */
export function useCollection<T>(build: () => Query | null, deps: readonly unknown[]): CollectionState<T> {
  const [state, setState] = useState<CollectionState<T>>({ data: [], loading: true, error: null });
  useEffect(() => {
    const q = build();
    if (!q) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T), loading: false, error: null }),
      (err) => setState({ data: [], loading: false, error: describe(err) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/** Live single document. `data` is null if it does not exist. */
export function useDoc<T>(build: () => DocumentReference | null, deps: readonly unknown[]): DocState<T> {
  const [state, setState] = useState<DocState<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    const ref = build();
    if (!ref) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    return onSnapshot(
      ref,
      (snap) => setState({ data: snap.exists() ? ({ ...snap.data(), id: snap.id } as T) : null, loading: false, error: null }),
      (err) => setState({ data: null, loading: false, error: describe(err) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function useSettings(): { settings: CompetitionSettings; loading: boolean } {
  const { data, loading } = useDoc<CompetitionSettings>(() => doc(db, 'settings', 'competition'), []);
  return { settings: { ...DEFAULT_SETTINGS, ...(data ?? {}) }, loading };
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
  await addDoc(collection(db, 'auditLogs'), {
    action, targetType, targetId,
    ...(detail ? { detail } : {}),
    byUid: user.uid,
    byName: getActorName() || user.email || 'Unknown',
    at: serverTimestamp(),
  });
}
