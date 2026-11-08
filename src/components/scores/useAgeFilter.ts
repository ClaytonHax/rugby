import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AGE_GROUPS } from '../../lib/types';
import type { AgeGroup } from '../../lib/types';

/** The age group chosen in the public header, kept in `?age=U16` so it is linkable. null means all. */
export function useAgeFilter(): [AgeGroup | null, (age: AgeGroup | null) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('age');
  const age = AGE_GROUPS.find((a) => a === raw) ?? null;
  const set = useCallback((next: AgeGroup | null) => setParams((p) => {
    const n = new URLSearchParams(p);
    if (next) n.set('age', next); else n.delete('age');
    return n;
  }, { replace: true }), [setParams]);
  return [age, set];
}
