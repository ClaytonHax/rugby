// Installable app and offline shell. The service worker is registered only in production builds, never against the emulators.
import { useSyncExternalStore } from 'react';

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

let waiting: ServiceWorker | null = null;
let installEvent: InstallEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Chrome offers installing once; keep the event until the person asks for it (no pop-ups).
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e as InstallEvent; emit(); });
window.addEventListener('appinstalled', () => { installEvent = null; emit(); });

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || import.meta.env.VITE_USE_EMULATORS === 'true' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const watch = (sw: ServiceWorker | null) => {
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          // "installed" with an existing controller means an update is waiting; on a first visit there is nothing to ask.
          if (sw.state === 'installed' && navigator.serviceWorker.controller) { waiting = sw; emit(); }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) { waiting = reg.waiting; emit(); }
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      const check = () => { void reg.update().catch(() => undefined); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      setInterval(check, 60 * 60 * 1000);
    }).catch(() => undefined);
  });
}

const RELOAD_KEY = 'tryline.sw.reloaded';

/** Switches to the waiting version and reloads once. A reload within 30 seconds of the last one is refused, so it can never loop. */
export function applyUpdate(): void {
  if (!waiting) return;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 30_000) return;
  } catch { /* storage blocked: rely on the one-shot flag below */ }
  let done = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (done) return;
    done = true;
    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* ignore */ }
    window.location.reload();
  });
  waiting.postMessage('SKIP_WAITING');
}

export const useUpdateAvailable = () => useSyncExternalStore(subscribe, () => waiting !== null);

export function useInstall() {
  const canPrompt = useSyncExternalStore(subscribe, () => installEvent !== null);
  return {
    standalone: isStandalone(),
    canPrompt,
    ios: isIos(),
    install: async () => { const e = installEvent; if (!e) return; installEvent = null; emit(); await e.prompt(); },
  };
}
