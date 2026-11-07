import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/** Tells people when the device has no connection, so they know saved changes will wait and sync later. */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-gold px-4 py-2 text-center text-sm font-medium text-ink">
      <WifiOff className="size-4 shrink-0" aria-hidden />
      You are offline. Saved data still shows, and changes you make will sync when you are back online.
    </div>
  );
}
