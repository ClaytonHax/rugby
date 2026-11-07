import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, SkeletonList } from './Display';

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
  /** When set, rows are clickable and navigate here. */
  rowHref?: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  empty?: ReactNode;
}

export function DataList<T>({ items, columns, rowKey, rowHref, loading, error, empty }: DataListProps<T>) {
  const navigate = useNavigate();
  if (loading) return <SkeletonList />;
  if (error) return <EmptyState title="Could not load this list" description={error} />;
  if (items.length === 0) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary);
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-chalk text-xs uppercase tracking-wide text-ink-soft">
            <tr>{columns.map((c) => <th key={c.key} scope="col" className={`px-4 py-3 font-semibold ${c.className ?? ''}`}>{c.header}</th>)}</tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={rowKey(row)} onClick={rowHref ? () => navigate(rowHref(row)) : undefined}
                className={`border-b border-line last:border-0 ${rowHref ? 'cursor-pointer hover:bg-chalk' : ''}`}>
                {columns.map((c) => <td key={c.key} className={`px-4 py-3 ${c.className ?? ''}`}>{c.cell(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((row) => (
          <li key={rowKey(row)}>
            <div onClick={rowHref ? () => navigate(rowHref(row)) : undefined}
              className={`rounded-xl border border-line bg-white p-4 ${rowHref ? 'active:bg-chalk' : ''}`}>
              <div className="font-semibold text-ink">{primary.cell(row)}</div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                {rest.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-xs text-ink-soft">{c.header}</dt>
                    <dd className="break-words">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
