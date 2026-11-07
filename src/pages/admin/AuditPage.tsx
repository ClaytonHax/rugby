import { useMemo, useState } from 'react';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useCollection } from '../../lib/data';
import type { AuditLog } from '../../lib/types';
import { DataList, Input, PageHeader, type Column } from '../../components/ui';

const LIMIT = 200;

function formatWhen(log: AuditLog): string {
  const at = log.at?.toDate?.();
  return at ? at.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) : 'Saving...';
}

export default function AuditPage() {
  const [filter, setFilter] = useState('');
  const { data, loading, error } = useCollection<AuditLog>(
    () => query(collection(db, 'auditLogs'), orderBy('at', 'desc'), limit(LIMIT)),
    [],
  );

  const term = filter.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!term) return data;
    return data.filter((log) =>
      [log.action, log.targetType, log.targetId, log.detail ?? '', log.byName]
        .some((text) => text.toLowerCase().includes(term)),
    );
  }, [data, term]);

  const columns: Column<AuditLog>[] = [
    { key: 'action', header: 'Action', primary: true, cell: (l) => <span className="font-mono text-sm">{l.action}</span> },
    { key: 'when', header: 'When', cell: (l) => formatWhen(l) },
    { key: 'by', header: 'By', cell: (l) => l.byName },
    { key: 'target', header: 'Target', cell: (l) => `${l.targetType} ${l.targetId}` },
    { key: 'detail', header: 'Detail', cell: (l) => l.detail ?? '' },
  ];

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle={`The newest ${LIMIT} entries. Filter below to search within them.`}
      />
      <div className="mb-4 max-w-md">
        <Input
          label="Filter by action"
          type="search"
          placeholder="e.g. player.verified"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <DataList
        items={rows}
        columns={columns}
        rowKey={(l) => l.id}
        loading={loading}
        error={error}
        empty={
          <p className="rounded-xl border border-dashed border-line bg-white px-6 py-10 text-center text-sm text-ink-soft">
            {term ? `No entries match "${filter.trim()}".` : 'No audit entries yet.'}
          </p>
        }
      />
    </div>
  );
}
