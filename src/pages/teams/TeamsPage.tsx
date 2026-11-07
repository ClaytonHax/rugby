import { useMemo, useState, type FormEvent } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { Plus, Shirt } from 'lucide-react';
import { db } from '../../lib/firebase';
import { friendlyError, savedText, useCollection, useSchools } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { createTeam, hasSide, teamName } from '../../lib/teams';
import { AGE_GROUPS, type AgeGroup, type Team } from '../../lib/types';
import { Button, DataList, EmptyState, Input, Modal, PageHeader, Select, useFocusFirstInvalid, useToast } from '../../components/ui';

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
  const [errors, setErrors] = useState<{ school?: string; side?: string; season?: string; form?: string }>({});
  const [tick, setTick] = useState(0);
  const [search, setSearch] = useState('');
  useFocusFirstInvalid(tick);

  const school = byId[unionLevel ? schoolId : sid ?? ''];
  const preview = school ? teamName(school.name, ageGroup, hasSide(ageGroup) ? side.trim().toUpperCase() : '') : '';
  const q = search.trim().toLowerCase();
  const shown = q ? sorted.filter((t) => `${t.name} ${t.schoolName} ${t.season}`.toLowerCase().includes(q)) : sorted;

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const bad: typeof errors = {};
    if (!school) bad.school = 'Choose a school.';
    const s = Number(season);
    if (!Number.isInteger(s) || s < 2000 || s > 2100) bad.season = 'Enter a valid season year, for example 2026.';
    const cleanSide = hasSide(ageGroup) ? side.trim().toUpperCase() : '';
    if (hasSide(ageGroup) && !/^[A-Z]$/.test(cleanSide)) bad.side = 'Side must be a single letter, for example A or B.';
    if (!bad.school && !bad.season && !bad.side && teams.data.some((t) => t.schoolId === school.id && t.season === s && t.ageGroup === ageGroup && t.side === cleanSide)) {
      bad.form = 'That team already exists for this season.';
    }
    if (Object.keys(bad).length) { setErrors(bad); setTick((n) => n + 1); return; }
    setSaving(true);
    setErrors({});
    try {
      const outcome = await createTeam({ school, ageGroup, side: cleanSide, season: s });
      toast.success(savedText(`Created ${preview}.`, outcome));
      setOpen(false);
    } catch (err) {
      setErrors({ form: friendlyError(err, 'Could not create the team. Try again.') });
    } finally {
      setSaving(false);
    }
  }

  function openForm() {
    setErrors({});
    setOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Teams"
        subtitle="Squads for the season. Only verified players and staff can be added."
        actions={canCreate && <Button icon={<Plus className="size-4" />} onClick={openForm}>New team</Button>}
      />
      {sorted.length > 6 && <div className="mb-4 max-w-sm"><Input label="Search teams" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Team, school or season" /></div>}
      <DataList
        items={shown}
        loading={teams.loading}
        error={teams.error}
        onRetry={teams.retry}
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
            action={canCreate ? <Button onClick={openForm}>New team</Button> : undefined}
          />
        }
      />
      <Modal open={open} onClose={() => setOpen(false)} title="New team"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="team-form" loading={saving}>Create team</Button></>}>
        <form id="team-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
          {unionLevel && (
            <Select label="School" required value={schoolId} error={errors.school} onChange={(e) => { setSchoolId(e.target.value); setErrors((x) => ({ ...x, school: undefined })); }} placeholder="Choose a school"
              options={schools.map((s) => ({ value: s.id, label: s.name }))} />
          )}
          <Select label="Age group" required value={ageGroup} onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
            options={AGE_GROUPS.map((a) => ({ value: a, label: a }))} />
          {hasSide(ageGroup) && (
            <Input label="Side" required maxLength={1} autoCapitalize="characters" autoComplete="off" value={side} error={errors.side}
              onChange={(e) => { setSide(e.target.value); setErrors((x) => ({ ...x, side: undefined })); }} hint="A for the first team in the age group, B for the second." />
          )}
          <Input label="Season" required inputMode="numeric" autoComplete="off" value={season} error={errors.season}
            onChange={(e) => { setSeason(e.target.value); setErrors((x) => ({ ...x, season: undefined })); }} />
          {preview && <p className="text-sm text-ink-soft">Team name: <strong className="text-ink">{preview}</strong></p>}
          {errors.form && <p role="alert" className="text-sm font-medium text-danger">{errors.form}</p>}
        </form>
      </Modal>
    </div>
  );
}
