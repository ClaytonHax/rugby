import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FIELDS = 'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), select:not([disabled]), textarea:not([disabled])';

export function Modal({ open, onClose, title, children, footer, focusFirstField = true }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode;
  /** Focus the first input when the dialog opens. Turn off when the keyboard would hide a list the user needs to see. */
  focusFirstField?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Callers pass a new onClose on every render. Keeping the latest one in a ref means the effect below
  // only runs when the dialog opens or closes, so typing never moves focus.
  const onCloseRef = useRef(onClose);
  const focusFirstRef = useRef(focusFirstField);
  useEffect(() => {
    onCloseRef.current = onClose;
    focusFirstRef.current = focusFirstField;
  });

  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    const prev = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.contains(document.activeElement)) {
      const first = focusFirstRef.current ? dialog.querySelector<HTMLElement>(FIELDS) : null;
      (first ?? dialog).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) { e.preventDefault(); dialog.focus(); return; }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || active === dialog)) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && active === lastEl) { e.preventDefault(); firstEl.focus(); }
      else if (!dialog.contains(active)) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (prev && document.contains(prev)) prev.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-ink/60 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl focus-visible:outline-none sm:rounded-xl">
        <div className="flex items-center justify-between gap-2 rounded-t-2xl border-b-2 border-gold bg-band py-1 pl-5 pr-2 sm:rounded-t-xl">
          <h2 id={titleId} className="min-w-0 text-2xl uppercase tracking-wide">{title}</h2>
          <Button variant="ghost" size="sm" className="min-w-11 shrink-0" onClick={onClose} aria-label="Close"><X className="size-5" aria-hidden /></Button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary', loading, onConfirm, onCancel }: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string; cancelLabel?: string;
  tone?: 'primary' | 'danger'; loading?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} footer={
      <>
        <Button variant="secondary" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </>
    }>
      <div className="text-sm text-ink">{message}</div>
    </Modal>
  );
}
