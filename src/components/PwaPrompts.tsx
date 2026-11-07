import { useState } from 'react';
import { Download, RefreshCw, Share } from 'lucide-react';
import { applyUpdate, useInstall, useUpdateAvailable } from '../lib/pwa';
import { Button } from './ui';

/** Quiet banner when a new version is waiting. Nothing reloads until the person taps. */
export function UpdatePrompt() {
  const available = useUpdateAvailable();
  if (!available) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[55] flex justify-center px-4 md:bottom-6">
      <div className="flex max-w-md items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 text-sm shadow-lg">
        <RefreshCw className="size-5 shrink-0 text-pitch" aria-hidden />
        <span>New version available.</span>
        <Button size="sm" onClick={applyUpdate}>Reload</Button>
      </div>
    </div>
  );
}

/** "Install app" action. Hidden once installed; on iPhone and iPad shows the Add to Home Screen steps instead. */
export function InstallApp({ className = '' }: { className?: string }) {
  const { standalone, canPrompt, ios, install } = useInstall();
  const [help, setHelp] = useState(false);
  if (standalone || (!canPrompt && !ios)) return null;
  return (
    <div className={className}>
      <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => (canPrompt ? void install() : setHelp((v) => !v))}
        aria-expanded={canPrompt ? undefined : help}>Install app</Button>
      {help && !canPrompt && (
        <p className="mt-2 text-sm text-ink-soft">
          To install on iPhone or iPad: tap <Share className="inline size-4 align-text-bottom" aria-hidden /> <strong>Share</strong> in Safari, then <strong>Add to Home Screen</strong>.
        </p>
      )}
    </div>
  );
}
