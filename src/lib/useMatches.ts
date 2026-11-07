import { useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { useCollection } from './data';
import type { Match, MatchStatus } from './types';

/** Public matches filtered by status (single-field query: no composite index needed), sorted client-side. */
export function useMatchesByStatus(statuses: MatchStatus[], order: 'asc' | 'desc') {
  const key = statuses.join(',');
  const state = useCollection<Match>(() => query(collection(db, 'matches'), where('status', 'in', statuses)), [key]);
  const sorted = useMemo(() => {
    const s = [...state.data].sort((a, b) => (a.date + a.kickoff).localeCompare(b.date + b.kickoff));
    return order === 'desc' ? s.reverse() : s;
  }, [state.data, order]);
  return { ...state, data: sorted };
}
