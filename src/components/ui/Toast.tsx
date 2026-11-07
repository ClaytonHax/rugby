import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: ToastTone; message: string }
interface ToastApi {
  toast: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = ++counter;
    setItems((l) => [...l, { id, tone, message }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 4000);
  }, []);
  const api = useMemo<ToastApi>(() => ({
    toast, success: (m) => toast(m, 'success'), error: (m) => toast(m, 'error'),
  }), [toast]);
  const icon = {
    success: <CheckCircle2 className="size-5 shrink-0 text-green-700" aria-hidden />,
    error: <XCircle className="size-5 shrink-0 text-danger" aria-hidden />,
    info: <Info className="size-5 shrink-0 text-pitch" aria-hidden />,
  };
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {items.map((t) => (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : undefined} className="pointer-events-auto flex max-w-md items-start gap-2 rounded-lg border border-line bg-white px-4 py-3 text-sm shadow-lg">
            {icon[t.tone]}<span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
