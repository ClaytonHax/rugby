import { useCallback, useState } from 'react';

/** useState that survives navigating away and back within the tab (filters, selected tab). Falls back to plain state if storage is blocked. */
export function useSessionState<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try { return (sessionStorage.getItem(`tryline.${key}`) as T | null) ?? initial; } catch { return initial; }
  });
  const set = useCallback((v: T) => {
    setValue(v);
    try { sessionStorage.setItem(`tryline.${key}`, v); } catch { /* storage unavailable: keep the in-memory value */ }
  }, [key]);
  return [value, set];
}
