import { useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { Plus, Shirt } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useCollection, useSchools } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { createTeam, hasSide, teamName } from '../../lib/teams';
import { AGE_GROUPS, type AgeGroup, type Team } from '../../lib/types';
import { Button, DataList, EmptyState, Input, Modal, PageHeader, Select, useToast } from '../../components/ui';

export default function TeamsPage() {
  const { appUser } = useAuth();
  const { data: schools, byId } = useSchools();
  const toast = useToast();
  const unionLevel = appUser?.role === 'union_admin' || appUser?.role === 'registrar';
  const sid = appUser?.schoolId ?? null;
  const canCreate = appUser?.role === 'union_admin' || appUser?.role === 'registrar' || appUser?.role === 'school_admin';

  const teams = useCollection<Team>(
    () => (unionLevel ? collection(db, 'teams') : sid ? query(collection(db, 'teams'), where('schoolId', '==', sid)) : null),
    [unionLevel, sid],
  );
  const sorted = useMemo(
    () => [...teams.data].sort((a, b) => b.season - a.season || a.name.localeCompare(b.name)),
    [teams.data],
  );

  const [open, setOpen] = useState(false);
  const [schoolId, setSchoolId] = useState(sid ?? '');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('U16');
  const [side, setSide] = useState('A');
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const school = byId[unionLevel ? schoolId : sid ?? ''];
  const preview = school ? teamName(school.name, ageGroup, hasSide(ageGroup) ? side.trim().toUpperCase() : '') : '';

  async function submit() {
    if (!school) { setError('Choose a school.'); return; }
    const s = Number(season);
    if (!Number.isInteger(s) || s < 2000 || s > 2100) { setError('Enter a valid season year.'); return; }
    const cleanSide = hasSide(ageGroup) ? side.trim().toUpperCase() : '';
    if (hasSide(ageGroup) && !/^[A-Z]$/.test(cleanSide)) { setError('Side must be a single letter, for example A or B.'); return; }
    if (teams.data.some((t) => t.schoolId === school.id && t.season === s && t.ageGroup === ageGroup && t.side === cleanSide)) {
      setError('That team already exists for this season.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createTeam({ school, ageGroup, side: cleanSide, season: s });
      toast.success(`Created ${preview}`);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the team.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Teams"
        subtitle="Squads for the season. Only verified players and staff can be added."
        actions={canCreate && <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New team</Button>}
      />
      <DataList
        items={sorted}
        loading={teams.loading}
        error={teams.error}
        rowKey={(t) => t.id}
        rowHref={(t) => `/app/teams/${t.id}`}
        columns={[
          { key: 'name', header: 'Team', primary: true, cell: (t) => t.name },
          { key: 'age', header: 'Age group', cell: (t) => t.ageGroup },
          { key: 'season', header: 'Season', cell: (t) => t.season },
          ...(unionLevel ? [{ key: 'school', header: 'School', cell: (t: Team) => t.schoolName }] : []),
        ]}
        empty={
          <EmptyState
            icon={<Shirt className="size-10" />}
            title="No teams yet"
            description={canCreate ? 'Create a team, then add verified players and staff to its squad.' : 'Ask your school administrator to create the team.'}
            action={canCreate ? <Button onClick={() => setOpen(true)}>New team</Button> : undefined}
          />
        }
      />
      <Modal open={open} onClose={() => setOpen(false)} title="New team"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit} loading={saving}>Create team</Button></>}>
        <div className="flex flex-col gap-4">
          {unionLevel && (
            <Select label="School" value={schoolId} onChange={(e) => setSchoolId(e.target.value)} placeholder="Choose a school"
              options={schools.map((s) => ({ value: s.id, label: s.name }))} />
          )}
          <Select label="Age group" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
            options={AGE_GROUPS.map((a) => ({ value: a, label: a }))} />
          {hasSide(ageGroup) && (
            <Input label="Side" maxLength={1} value={side} onChange={(e) => setSide(e.target.value)} hint="A for the first team in the age group, B for the second." />
          )}
          <Input label="Season" inputMode="numeric" value={season} onChange={(e) => setSeason(e.target.value)} />
          {preview && <p className="text-sm text-ink-soft">Team name: <strong className="text-ink">{preview}</strong></p>}
          {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
