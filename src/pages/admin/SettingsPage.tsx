import { useEffect, useState, type FormEvent } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSettings, writeAudit } from '../../lib/data';
import { Button, Card, Input, PageHeader, useToast } from '../../components/ui';

export default function SettingsPage() {
  const { settings, loading } = useSettings();
  const toast = useToast();
  const [overAgeYears, setYears] = useState('18');
  const [maxOverAge, setMax] = useState('3');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading) { setYears(String(settings.overAgeYears)); setMax(String(settings.maxOverAge)); }
  }, [loading, settings.overAgeYears, settings.maxOverAge]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const y = Number(overAgeYears), m = Number(maxOverAge);
    if (!Number.isInteger(y) || !Number.isInteger(m) || y < 10 || y > 25 || m < 0 || m > 23) {
      toast.error('Enter whole numbers: age 10 to 25, and an over-age limit from 0 to 23.');
      return;
    }
    setBusy(true);
    try {
      await setDoc(doc(db, 'settings', 'competition'), { overAgeYears: y, maxOverAge: m });
      await writeAudit('settings.updated', 'settings', 'competition', `overAgeYears=${y}, maxOverAge=${m}`);
      toast.success('Settings saved.');
    } catch {
      toast.error('Could not save settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl">
      <PageHeader title="Competition settings" subtitle="These apply to every squad and team sheet." />
      <Card>
        <form onSubmit={save} className="flex flex-col gap-4">
          <Input label="Over-age threshold (years)" type="number" inputMode="numeric" required value={overAgeYears} onChange={(e) => setYears(e.target.value)}
            hint="A player is over-age when their completed years on the date are more than this." />
          <Input label="Over-age players allowed per team" type="number" inputMode="numeric" required value={maxOverAge} onChange={(e) => setMax(e.target.value)} />
          <div><Button type="submit" loading={busy}>Save settings</Button></div>
        </form>
      </Card>
    </div>
  );
}
