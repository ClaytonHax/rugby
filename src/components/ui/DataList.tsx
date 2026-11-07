import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState, ErrorState, SkeletonList } from './Display';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Shown as the card title on phones. */
  primary?: boolean;
  className?: string;
}

export interface DataListProps<T> {
  items: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** When set, rows are links to this address. */
  rowHref?: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: ReactNode;
}

export function DataList<T>({ items, columns, rowKey, rowHref, loading, error, onRetry, empty }: DataListProps<T>) {
  const navigate = useNavigate();
  if (loading) return <SkeletonList />;
  if (error) return <ErrorState title="Could not load this list" description={error} onRetry={onRetry} />;
  if (items.length === 0) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  const primary = columns.find((c) => c.primary) ?? columns[0];
  // Columns with no header hold row actions (buttons); on phones they sit under the details.
  const rest = columns.filter((c) => c !== primary && c.header !== '');
  const actions = columns.filter((c) => c !== primary && c.header === '');
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-chalk text-xs uppercase tracking-wide text-ink-soft">
            <tr>{columns.map((c) => <th key={c.key} scope="col" className={`px-4 py-3 font-semibold ${c.className ?? ''}`}>{c.header || <span className="sr-only">Actions</span>}</th>)}</tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={rowKey(row)}
                onClick={rowHref ? (e) => { if (!(e.target as HTMLElement).closest('a,button')) navigate(rowHref(row)); } : undefined}
                className={`border-b border-line last:border-0 ${rowHref ? 'cursor-pointer hover:bg-chalk' : ''}`}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 ${c.className ?? ''}`}>
                    {rowHref && c === primary ? <Link to={rowHref(row)} className="font-semibold text-pitch hover:underline">{c.cell(row)}</Link> : c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((row) => {
          const body = (
            <>
              <div className="font-semibold text-ink">{primary.cell(row)}</div>
              {rest.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  {rest.map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-xs text-ink-soft">{c.header}</dt>
                      <dd className="break-words">{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          );
          return (
            <li key={rowKey(row)}>
              {rowHref ? (
                <Link to={rowHref(row)} className="block rounded-xl border border-line bg-white p-4 active:bg-chalk">{body}</Link>
              ) : (
                <div className="rounded-xl border border-line bg-white p-4">
                  {body}
                  {actions.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{actions.map((c) => <div key={c.key}>{c.cell(row)}</div>)}</div>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
