import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useCollection } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { createMatch } from '../../lib/matches';
import { todayISO } from '../../lib/eligibility';
import { AGE_GROUPS, type AgeGroup, type Team } from '../../lib/types';
import { Button, Card, Input, PageHeader, Select } from '../../components/ui';

export default function MatchFormPage() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
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
  const [error, setError] = useState<string | null>(null);
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
    if (!home || !away) { setError('Choose both teams.'); return; }
    if (home.id === away.id) { setError('Choose two different teams.'); return; }
    const unionLevel = appUser?.role === 'union_admin' || appUser?.role === 'registrar';
    if (!unionLevel && appUser?.schoolId !== home.schoolId && appUser?.schoolId !== away.schoolId) {
      setError('One of the two teams must be from your school.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = await createMatch({ date, kickoff, venue, town, competition, ageGroup, referee, home, away });
      navigate(`/app/matches/${id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the match.');
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="New match" backTo="/app/matches" />
      <form onSubmit={onSubmit}>
        <Card className="flex flex-col gap-4">
          <Select label="Age group" required value={ageGroup} onChange={(e) => { setAgeGroup(e.target.value as AgeGroup); setHomeId(''); setAwayId(''); }}
            options={AGE_GROUPS.map((a) => ({ value: a, label: a }))} />
          <Select label="Home team" required value={homeId} onChange={(e) => setHomeId(e.target.value)} placeholder="Choose home team" options={opts}
            hint={!teams.loading && options.length === 0 ? `No ${ageGroup} teams exist yet. Create them on the Teams page.` : undefined} />
          <Select label="Away team" required value={awayId} onChange={(e) => setAwayId(e.target.value)} placeholder="Choose away team" options={opts} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            <Input label="Kick-off" type="time" required value={kickoff} onChange={(e) => setKickoff(e.target.value)} />
          </div>
          <Input label="Venue" required value={venue} onChange={(e) => setVenue(e.target.value)} />
          <Input label="Town" required value={town} onChange={(e) => setTown(e.target.value)} />
          <Input label="Competition" required value={competition} onChange={(e) => setCompetition(e.target.value)} hint="For example: Schools League" />
          <Input label="Referee (optional)" value={referee} onChange={(e) => setReferee(e.target.value)} />
          {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
          <Button type="submit" loading={saving}>Create match</Button>
        </Card>
      </form>
    </div>
  );
}
