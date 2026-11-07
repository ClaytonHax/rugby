import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useCollection, useSettings } from '../../lib/data';
import { isOverAge, todayISO } from '../../lib/eligibility';
import type { DocType, Player, Staff, Team, TeamRoster } from '../../lib/types';
import { formatDate } from '../../components/MatchCard';
import { DataList, EmptyState, PageHeader, StatusBadge, type Column } from '../../components/ui';

const ID_TYPES: DocType[] = ['birth_certificate', 'national_id', 'passport'];
const PENDING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

interface OverCapRow {
  team: Team;
  overAgeNames: string[];
}

type Person = (Player | Staff) & { kind: 'Player' | 'Staff' };

interface PersonRow {
  key: string;
  kind: 'Player' | 'Staff';
  name: string;
  status: Person['status'];
  href: string;
  detail: string;
}


function personName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`;
}

function missingDocs(docTypes: DocType[]): string {
  const missing: string[] = [];
  if (!docTypes.includes('photo')) missing.push('photo');
  if (!ID_TYPES.some((t) => docTypes.includes(t))) missing.push('ID document');
  return missing.join(' and ');
}

function personRow(p: Person): PersonRow {
  const base = p.kind === 'Player' ? `/app/players/${p.id}` : `/app/staff/${p.id}`;
  return { key: `${p.kind}-${p.id}`, kind: p.kind, name: personName(p), status: p.status, href: base, detail: '' };
}

const linkClass = 'font-semibold text-pitch underline-offset-2 hover:underline';

export default function CompliancePage() {
  const { settings, loading: settingsLoading } = useSettings();
  const teams = useCollection<Team>(() => collection(db, 'teams'), []);
  const rosters = useCollection<TeamRoster>(() => collection(db, 'teamRosters'), []);
  const players = useCollection<Player>(() => collection(db, 'players'), []);
  const staff = useCollection<Staff>(() => collection(db, 'staff'), []);

  const today = todayISO();
  const retryAll = () => { teams.retry(); rosters.retry(); players.retry(); staff.retry(); };
  const loading = settingsLoading || teams.loading || rosters.loading || players.loading || staff.loading;
  const error = teams.error ?? rosters.error ?? players.error ?? staff.error;

  const overCap = useMemo<OverCapRow[]>(() => {
    const playersById = new Map(players.data.map((p) => [p.id, p]));
    const rosterByTeam = new Map(rosters.data.map((r) => [r.teamId, r]));
    const rows: OverCapRow[] = [];
    for (const team of teams.data) {
      const roster = rosterByTeam.get(team.id);
      if (!roster) continue;
      const overAgeNames = roster.playerIds
        .map((id) => playersById.get(id))
        .filter((p): p is Player => !!p && isOverAge(p.dob, today, settings))
        .map(personName);
      if (overAgeNames.length > settings.maxOverAge) rows.push({ team, overAgeNames });
    }
    return rows;
  }, [teams.data, rosters.data, players.data, settings, today]);

  const everyone = useMemo<Person[]>(() => [
    ...players.data.map((p): Person => ({ ...p, kind: 'Player' })),
    ...staff.data.map((s): Person => ({ ...s, kind: 'Staff' })),
  ], [players.data, staff.data]);

  const missingRows = useMemo<PersonRow[]>(() =>
    everyone
      .filter((p) => p.status !== 'draft' && missingDocs(p.docTypes) !== '')
      .map((p) => ({ ...personRow(p), detail: `Missing ${missingDocs(p.docTypes)}` })),
    [everyone]);

  const pendingRows = useMemo<PersonRow[]>(() => {
    const cutoff = Date.now() - PENDING_DAYS * DAY_MS;
    return everyone
      .filter((p) => p.status === 'pending')
      .map((p) => ({ p, changed: p.updatedAt?.toMillis() }))
      .filter((x): x is { p: Person; changed: number } => x.changed !== undefined && x.changed < cutoff)
      .map(({ p, changed }) => ({
        ...personRow(p),
        detail: `Since ${new Date(changed).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      }));
  }, [everyone]);

  const overCapColumns: Column<OverCapRow>[] = [
    { key: 'team', header: 'Team', primary: true, cell: (r) => <Link to={`/app/teams/${r.team.id}`} className={linkClass}>{r.team.name}</Link> },
    { key: 'count', header: 'Over-age', cell: (r) => `${r.overAgeNames.length} (limit ${settings.maxOverAge})` },
    { key: 'players', header: 'Over-age players', cell: (r) => r.overAgeNames.join(', ') },
  ];

  const personColumns: Column<PersonRow>[] = [
    { key: 'name', header: 'Name', primary: true, cell: (r) => <Link to={r.href} className={linkClass}>{r.name}</Link> },
    { key: 'kind', header: 'Type', cell: (r) => r.kind },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'detail', header: 'Detail', cell: (r) => r.detail },
  ];

  const nothing = (title: string) => (
    <EmptyState title={title} description="Nothing needs attention here right now." />
  );

  return (
    <div>
      <PageHeader
        title="Compliance"
        subtitle={`Checked against today (${formatDate(today)}). Over-age limit is ${settings.maxOverAge} per team.`}
      />

      <section aria-labelledby="overage-heading" className="mb-8">
        <h2 id="overage-heading" className="mb-3 text-2xl text-ink">Teams over the over-age limit</h2>
        <DataList
          items={overCap}
          columns={overCapColumns}
          rowKey={(r) => r.team.id}
          loading={loading}
          error={error}
          onRetry={retryAll}
          empty={nothing('No team is over the limit')}
        />
      </section>

      <section aria-labelledby="docs-heading" className="mb-8">
        <h2 id="docs-heading" className="mb-3 text-2xl text-ink">Missing photo or ID document</h2>
        <p className="mb-3 text-sm text-ink-soft">Registered records (not drafts) that cannot be verified without these.</p>
        <DataList
          items={missingRows}
          columns={personColumns}
          rowKey={(r) => r.key}
          loading={loading}
          error={error}
          onRetry={retryAll}
          empty={nothing('No records are missing documents')}
        />
      </section>

      <section aria-labelledby="pending-heading">
        <h2 id="pending-heading" className="mb-3 text-2xl text-ink">Pending for more than {PENDING_DAYS} days</h2>
        <DataList
          items={pendingRows}
          columns={personColumns}
          rowKey={(r) => r.key}
          loading={loading}
          error={error}
          onRetry={retryAll}
          empty={nothing('No records have been pending for long')}
        />
      </section>
    </div>
  );
}
