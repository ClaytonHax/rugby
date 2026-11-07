import { useMemo } from 'react';
import { Download, Plus, UserPlus } from 'lucide-react';
import { Badge, Button, DataList, EmptyState, Input, LinkButton, PageHeader, Select, StatusBadge } from '../ui';
import { useCollection, useSettings } from '../../lib/data';
import { ageOn, isOverAge, todayISO } from '../../lib/eligibility';
import { personName, personsQuery, type AnyPerson, type PersonKind } from '../../lib/people';
import { STAFF_ROLE_LABELS, type Player, type RecordStatus, type Staff } from '../../lib/types';
import { useSessionState } from '../../lib/useSessionState';
import { downloadCsv, toCsv } from './csv';
import { useSchoolScope } from './useSchoolScope';

const STATUSES: RecordStatus[] = ['draft', 'pending', 'verified', 'rejected', 'suspended'];
const STATUS_LABEL: Record<RecordStatus, string> = { draft: 'Draft', pending: 'Pending', verified: 'Verified', rejected: 'Rejected', suspended: 'Suspended' };

function matchesAge(filter: string, dob: string, over: boolean): boolean {
  if (filter === 'any') return true;
  if (filter === 'over') return over;
  const age = ageOn(dob, todayISO());
  if (filter === 'u13') return age <= 12;
  if (filter === 'o19') return age >= 19;
  return age === Number(filter);
}

export function PeopleList({ kind }: { kind: PersonKind }) {
  const { appUser, union, schools, pick, setPick, schoolId, canQuery } = useSchoolScope();
  const { settings } = useSettings();
  const state = useCollection<AnyPerson>(() => personsQuery(kind, schoolId, union), [kind, schoolId, union]);
  // Kept for the tab session, so coming back from a record shows the same filtered list.
  const [search, setSearch] = useSessionState<string>(`people.${kind}.search`, '');
  const [status, setStatus] = useSessionState<string>(`people.${kind}.status`, 'any');
  const [age, setAge] = useSessionState<string>(`people.${kind}.age`, 'any');
  const today = todayISO();
  const base = kind === 'player' ? '/app/players' : '/app/staff';
  const noun = kind === 'player' ? 'player' : 'staff member';

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.data
      .filter((p) => (status === 'any' || p.status === status)
        && (kind === 'staff' || matchesAge(age, p.dob, isOverAge(p.dob, today, settings)))
        && (!q || personName(p).toLowerCase().includes(q)))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  }, [state.data, search, status, age, kind, today, settings]);

  function exportCsv() {
    // No ID numbers, DOBs or guardian details: names, age, position, status and registration number only.
    const csv = toCsv(
      ['School', 'Registration no', 'First name', 'Last name', 'Age', 'Over-age', 'Position', 'Status'],
      rows.map((p) => {
        const pl = p as Player;
        return [p.schoolName, p.registrationNo ?? '', p.firstName, p.lastName, ageOn(p.dob, today),
          isOverAge(p.dob, today, settings) ? 'Yes' : 'No', pl.position, STATUS_LABEL[p.status]];
      }),
    );
    downloadCsv(`register-${today}.csv`, csv);
  }

  const ageOptions = [
    { value: 'any', label: 'Any age' }, { value: 'over', label: `Over-age (above ${settings.overAgeYears})` },
    { value: 'u13', label: '12 and under' },
    ...[13, 14, 15, 16, 17, 18].map((n) => ({ value: String(n), label: `Age ${n}` })),
    { value: 'o19', label: '19 and over' },
  ];

  return (
    <div>
      <PageHeader title={kind === 'player' ? 'Players' : 'Coaches and staff'}
        subtitle={state.loading || !canQuery ? undefined : `${rows.length} of ${state.data.length} shown`}
        actions={
          <>
            {kind === 'player' && <Button variant="secondary" icon={<Download className="size-4" />} disabled={rows.length === 0} onClick={exportCsv}>Export CSV</Button>}
            <LinkButton to={`${base}/new`} icon={<Plus className="size-4" />}>Register {noun}</LinkButton>
          </>
        } />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="Search by name" type="search" autoComplete="off" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or surname" />
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}
          options={[{ value: 'any', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
        {kind === 'player' && <Select label="Age" value={age} onChange={(e) => setAge(e.target.value)} options={ageOptions} />}
        {union && (
          <Select label="School" value={pick} onChange={(e) => setPick(e.target.value)} placeholder="All schools"
            options={schools.data.map((s) => ({ value: s.id, label: s.name }))} />
        )}
      </div>
      {!canQuery ? (
        <EmptyState title="No school assigned" description={`Your account is not linked to a school yet, so there are no ${kind === 'player' ? 'players' : 'staff'} to show. Ask your administrator.`} />
      ) : (
        <DataList<AnyPerson> items={rows} loading={state.loading} error={state.error} onRetry={state.retry} rowKey={(p) => p.id} rowHref={(p) => `${base}/${p.id}`}
          empty={state.data.length === 0 ? (
            <EmptyState icon={<UserPlus className="size-8" />} title={`No ${kind === 'player' ? 'players' : 'staff'} registered yet`}
              description={`Register a ${noun} to start. You will need a photo and an ID document${kind === 'player' ? ', plus guardian consent' : ''}.`}
              action={<LinkButton to={`${base}/new`}>Register {noun}</LinkButton>} />
          ) : <EmptyState title="No matches" description="Try a different name or clear the filters." action={
            <Button variant="secondary" onClick={() => { setSearch(''); setStatus('any'); setAge('any'); }}>Clear filters</Button>} />}
          columns={[
            { key: 'name', header: 'Name', primary: true, cell: (p) => <span>{personName(p)}</span> },
            { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
            ...(kind === 'player' ? [
              { key: 'age', header: 'Age', cell: (p: AnyPerson) => {
                const over = isOverAge(p.dob, today, settings);
                return <span className="inline-flex items-center gap-1.5"><span className="num text-base">{ageOn(p.dob, today)}</span>{over && <Badge tone="gold">Over-age</Badge>}</span>;
              } },
              { key: 'pos', header: 'Position', cell: (p: AnyPerson) => (p as Player).position },
            ] : [
              { key: 'role', header: 'Role', cell: (p: AnyPerson) => STAFF_ROLE_LABELS[(p as Staff).staffRole] },
            ]),
            ...(union || appUser?.schoolId === null ? [{ key: 'school', header: 'School', cell: (p: AnyPerson) => p.schoolName }] : []),
            { key: 'reg', header: 'Reg. no', cell: (p) => p.registrationNo ?? (p.status === 'verified' ? '' : 'Not yet issued') },
          ]} />
      )}
    </div>
  );
}
