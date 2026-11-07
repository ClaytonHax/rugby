import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { friendlyError, savedText, useCollection } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { createMatch } from '../../lib/matches';
import { todayISO } from '../../lib/eligibility';
import { AGE_GROUPS, type AgeGroup, type Team } from '../../lib/types';
import { Button, Card, Input, PageHeader, Select, useFocusFirstInvalid, useToast } from '../../components/ui';

export default function MatchFormPage() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const teams = useCollection<Team>(() => collection(db, 'teams'), []);
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('U16');
  const [homeId, setHomeId] = useState('');
  const [awayId, setAwayId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [kickoff, setKickoff] = useState('15:00');
  const [venue, setVenue] = useState('');
  const [town, setTown] = useState('');
  const [competition, setCompetition] = useState('');
  const [referee, setReferee] = useState('');
  const [errors, setErrors] = useState<{ home?: string; away?: string; form?: string }>({});
  const [tick, setTick] = useState(0);
  useFocusFirstInvalid(tick);
  const [saving, setSaving] = useState(false);

  const options = useMemo(
    () => teams.data.filter((t) => t.ageGroup === ageGroup).sort((a, b) => b.season - a.season || a.name.localeCompare(b.name)),
    [teams.data, ageGroup],
  );
  const home = options.find((t) => t.id === homeId);
  const away = options.find((t) => t.id === awayId);
  const opts = options.map((t) => ({ value: t.id, label: `${t.name} (${t.season})` }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const bad: typeof errors = {};
    if (!home) bad.home = 'Choose the home team.';
    if (!away) bad.away = 'Choose the away team.';
    if (home && away && home.id === away.id) bad.away = 'Choose two different teams.';
    const unionLevel = appUser?.role === 'union_admin' || appUser?.role === 'registrar';
    if (home && away && !bad.away && !unionLevel && appUser?.schoolId !== home.schoolId && appUser?.schoolId !== away.schoolId) {
      bad.form = 'One of the two teams must be from your school.';
    }
    if (!home || !away || bad.home || bad.away || bad.form) { setErrors(bad); setTick((n) => n + 1); return; }
    setSaving(true);
    setErrors({});
    try {
      const { id, outcome } = await createMatch({ date, kickoff, venue, town, competition, ageGroup, referee, home, away });
      toast.success(savedText('Match created.', outcome));
      navigate(`/app/matches/${id}`, { replace: true });
    } catch (err) {
      setErrors({ form: friendlyError(err, 'Could not create the match. Try again.') });
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="New match" backTo="/app/matches" backLabel="Back to matches" />
      <form onSubmit={onSubmit}>
        <Card className="flex flex-col gap-4">
          <Select label="Age group" required value={ageGroup} onChange={(e) => { setAgeGroup(e.target.value as AgeGroup); setHomeId(''); setAwayId(''); setErrors({}); }}
            options={AGE_GROUPS.map((a) => ({ value: a, label: a }))} />
          <Select label="Home team" required value={homeId} error={errors.home} onChange={(e) => { setHomeId(e.target.value); setErrors((x) => ({ ...x, home: undefined })); }} placeholder="Choose home team" options={opts}
            hint={teams.error ? 'Teams could not be loaded. Reload the page and try again.' : !teams.loading && options.length === 0 ? `No ${ageGroup} teams exist yet. Create them on the Teams page.` : undefined} />
          <Select label="Away team" required value={awayId} error={errors.away} onChange={(e) => { setAwayId(e.target.value); setErrors((x) => ({ ...x, away: undefined })); }} placeholder="Choose away team" options={opts} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            <Input label="Kick-off" type="time" required value={kickoff} onChange={(e) => setKickoff(e.target.value)} />
          </div>
          <Input label="Venue" required autoComplete="off" value={venue} onChange={(e) => setVenue(e.target.value)} />
          <Input label="Town" required autoComplete="off" value={town} onChange={(e) => setTown(e.target.value)} />
          <Input label="Competition" required value={competition} onChange={(e) => setCompetition(e.target.value)} hint="For example: Schools League" />
          <Input label="Referee (optional)" autoComplete="off" autoCapitalize="words" value={referee} onChange={(e) => setReferee(e.target.value)} />
          {errors.form && <p role="alert" className="text-sm font-medium text-danger">{errors.form}</p>}
          <Button type="submit" loading={saving}>Create match</Button>
        </Card>
      </form>
    </div>
  );
}
