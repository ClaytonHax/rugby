import { useMemo, useState } from 'react';
import { collection, query, where, type Query } from 'firebase/firestore';
import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageHeader, Select, SkeletonList } from '../../components/ui';
import { PersonCard } from '../../components/people/PersonCard';
import { PersonDetail } from '../../components/people/PersonDetail';
import { useSchoolScope } from '../../components/people/useSchoolScope';
import { db } from '../../lib/firebase';
import { useCollection } from '../../lib/data';
import type { AnyPerson, PersonKind } from '../../lib/people';

function pendingQuery(name: 'players' | 'staff', schoolId: string | null): Query {
  const c = collection(db, name);
  return schoolId ? query(c, where('status', '==', 'pending'), where('schoolId', '==', schoolId)) : query(c, where('status', '==', 'pending'));
}

interface Item { kind: PersonKind; person: AnyPerson }

export default function VerificationPage() {
  const { schools, pick, setPick, schoolId } = useSchoolScope();
  const players = useCollection<AnyPerson>(() => pendingQuery('players', schoolId), [schoolId]);
  const staff = useCollection<AnyPerson>(() => pendingQuery('staff', schoolId), [schoolId]);
  const [selected, setSelected] = useState<{ kind: PersonKind; id: string } | null>(null);

  const items = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...players.data.map((person) => ({ kind: 'player' as const, person })),
      ...staff.data.map((person) => ({ kind: 'staff' as const, person })),
    ];
    // Oldest submission first.
    return all.sort((a, b) => (a.person.updatedAt?.toMillis() ?? 0) - (b.person.updatedAt?.toMillis() ?? 0));
  }, [players.data, staff.data]);

  const loading = players.loading || staff.loading;
  const error = players.error ?? staff.error;

  function afterAction() {
    // Move on to the next record in the queue.
    const idx = items.findIndex((i) => i.person.id === selected?.id);
    const nextItem = items[idx + 1] ?? items[idx - 1];
    setSelected(nextItem && nextItem.person.id !== selected?.id ? { kind: nextItem.kind, id: nextItem.person.id } : null);
  }

  return (
    <div>
      <PageHeader title="Verification queue" subtitle={loading ? undefined : `${items.length} waiting`} />
      <div className="mb-4 max-w-xs">
        <Select label="School" value={pick} onChange={(e) => { setPick(e.target.value); setSelected(null); }} placeholder="All schools"
          options={schools.data.map((s) => ({ value: s.id, label: s.name }))} />
      </div>
      {loading ? <SkeletonList /> : error ? <ErrorState title="Could not load the queue" description={error} onRetry={() => { players.retry(); staff.retry(); }} /> : items.length === 0 ? (
        <EmptyState icon={<ClipboardCheck className="size-8" />} title="Nothing to verify" description="New submissions from schools will appear here, oldest first." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
          <ul className={`flex flex-col gap-2 ${selected ? 'hidden lg:flex' : ''}`}>
            {items.map((i) => (
              <li key={`${i.kind}-${i.person.id}`}>
                <PersonCard person={i.person} kind={i.kind} selected={selected?.id === i.person.id}
                  onClick={() => { setSelected({ kind: i.kind, id: i.person.id }); window.scrollTo({ top: 0 }); }} />
              </li>
            ))}
          </ul>
          <div className={selected ? '' : 'hidden lg:block'}>
            {selected ? (
              <>
                <Button variant="ghost" className="mb-2 lg:hidden" icon={<ArrowLeft className="size-4" />} onClick={() => { setSelected(null); window.scrollTo({ top: 0 }); }}>Back to queue</Button>
                <PersonDetail key={selected.id} kind={selected.kind} id={selected.id} review onActed={afterAction} />
              </>
            ) : <EmptyState title="Choose a record" description="Select someone from the queue to compare their photo and ID document with the details." />}
          </div>
        </div>
      )}
    </div>
  );
}
