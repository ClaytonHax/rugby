import { useEffect, type ReactNode } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from './Button';
import type { RecordStatus } from '../../lib/types';

export function Card({ children, className = '', padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={`rounded-xl border border-line/70 bg-white shadow-sm ${padded ? 'p-4 md:p-5' : ''} ${className}`}>{children}</div>;
}

export type BadgeTone = 'neutral' | 'green' | 'amber' | 'red' | 'gold' | 'darkred';
const tones: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-gray-700',
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-900',
  red: 'bg-red-100 text-red-800',
  gold: 'bg-gold/25 text-ink',
  darkred: 'bg-red-200 text-red-950',
};
export function Badge({ tone = 'neutral', children, className = '' }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${tones[tone]} ${className}`}>{children}</span>;
}

const statusMap: Record<RecordStatus, { tone: BadgeTone; label: string }> = {
  draft: { tone: 'neutral', label: 'Draft' },
  pending: { tone: 'amber', label: 'Pending' },
  verified: { tone: 'green', label: 'Verified' },
  rejected: { tone: 'red', label: 'Rejected' },
  suspended: { tone: 'darkred', label: 'Suspended' },
};
export function StatusBadge({ status, className }: { status: RecordStatus; className?: string }) {
  const s = statusMap[status];
  return <Badge tone={s.tone} className={className}>{s.label}</Badge>;
}

/** `page` makes the title the page's h1, for screens that show nothing else (not found, no access). */
export function EmptyState({ title, description, action, icon, page = false }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode; page?: boolean }) {
  const Heading = page ? 'h1' : 'h2';
  useDocumentTitle(page ? title : null);
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-white shadow-sm px-6 py-10 text-center">
      {icon && <div className="text-pitch" aria-hidden>{icon}</div>}
      <Heading className="text-xl text-ink">{title}</Heading>
      {description && <p className="max-w-md text-sm text-ink-soft">{description}</p>}
      {action}
    </div>
  );
}

/** A list or page that failed to load. Offers a retry (the caller's, or a full reload). */
export function ErrorState({ title = 'Could not load this', description, onRetry, page = false }: { title?: string; description?: string | null; onRetry?: () => void; page?: boolean }) {
  return (
    <EmptyState title={title} page={page} description={description ?? 'Check your signal and try again.'}
      action={<Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={onRetry ?? (() => window.location.reload())}>Try again</Button>} />
  );
}

export function Skeleton({ className = 'h-5 w-full' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-line/70 ${className}`} />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}
    </div>
  );
}

/** Sets the browser tab title while mounted. Pass null to leave it alone. */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · Tryline`;
    return () => { document.title = 'Tryline'; };
  }, [title]);
}

export function PageHeader({ title, subtitle, actions, backTo, backLabel = 'Back', documentTitle }: {
  title: string; subtitle?: string; actions?: ReactNode; backTo?: string; backLabel?: string;
  /** Tab title when the heading holds personal data (a name) that should not sit in browser history. */
  documentTitle?: string;
}) {
  useDocumentTitle(documentTitle ?? title);
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-l-4 border-gold pl-3">
      <div className="min-w-0">
        {backTo && (
          <Link to={backTo} className="mb-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-pitch hover:underline">
            <ArrowLeft className="size-4" aria-hidden /> {backLabel}
          </Link>
        )}
        <h1 className="text-3xl uppercase leading-tight tracking-wide text-ink md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
