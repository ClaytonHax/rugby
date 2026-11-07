import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RecordStatus } from '../../lib/types';

export function Card({ children, className = '', padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={`rounded-xl border border-line bg-white ${padded ? 'p-4 md:p-5' : ''} ${className}`}>{children}</div>;
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
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}>{children}</span>;
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

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-white px-6 py-10 text-center">
      {icon && <div className="text-pitch" aria-hidden>{icon}</div>}
      <h2 className="text-xl text-ink">{title}</h2>
      {description && <p className="max-w-md text-sm text-ink-soft">{description}</p>}
      {action}
    </div>
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

export function PageHeader({ title, subtitle, actions, backTo }: { title: string; subtitle?: string; actions?: ReactNode; backTo?: string }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {backTo && (
          <Link to={backTo} className="mb-1 inline-flex min-h-8 items-center gap-1 text-sm font-medium text-pitch hover:underline">
            <ArrowLeft className="size-4" aria-hidden /> Back
          </Link>
        )}
        <h1 className="text-3xl leading-tight text-ink md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
