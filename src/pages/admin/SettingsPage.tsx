import { useEffect, useRef, useState, type FormEvent } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { confirmWrite, friendlyError, savedText, useSettings, writeAudit } from '../../lib/data';
import { Button, Card, Input, PageHeader, SkeletonList, useFocusFirstInvalid, useToast } from '../../components/ui';

export default function SettingsPage() {
  const { settings, loading } = useSettings();
  const toast = useToast();
  const [overAgeYears, setYears] = useState('18');
  const [maxOverAge, setMax] = useState('3');
  const [errors, setErrors] = useState<{ years?: string; max?: string; form?: string }>({});
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const hydrated = useRef(false);
  useFocusFirstInvalid(tick);

  // Fill the form once from the saved settings. Later changes from elsewhere must not overwrite what is being typed.
  useEffect(() => {
    if (loading || hydrated.current) return;
    hydrated.current = true;
    setYears(String(settings.overAgeYears));
    setMax(String(settings.maxOverAge));
  }, [loading, settings.overAgeYears, settings.maxOverAge]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const y = Number(overAgeYears), m = Number(maxOverAge);
    const bad: typeof errors = {};
    if (overAgeYears.trim() === '' || !Number.isInteger(y) || y < 10 || y > 25) bad.years = 'Enter a whole number of years from 10 to 25.';
    if (maxOverAge.trim() === '' || !Number.isInteger(m) || m < 0 || m > 23) bad.max = 'Enter a whole number from 0 to 23.';
    if (bad.years || bad.max) { setErrors(bad); setTick((n) => n + 1); return; }
    setErrors({});
    setBusy(true);
    try {
      const outcome = await confirmWrite(setDoc(doc(db, 'settings', 'competition'), { overAgeYears: y, maxOverAge: m }),
        () => toast.error('The settings could not be saved.'));
      void writeAudit('settings.updated', 'settings', 'competition', `overAgeYears=${y}, maxOverAge=${m}`);
      toast.success(savedText('Settings saved.', outcome));
    } catch (err) {
      setErrors({ form: friendlyError(err, 'Could not save the settings. Try again.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl">
      <PageHeader title="Competition settings" subtitle="These apply to every squad and team sheet." />
      {loading ? <SkeletonList rows={2} /> : (
        <Card>
          <form onSubmit={save} noValidate className="flex flex-col gap-4">
            <Input label="Over-age threshold (years)" type="number" inputMode="numeric" min={10} max={25} required value={overAgeYears} error={errors.years}
              onChange={(e) => { setYears(e.target.value); setErrors((x) => ({ ...x, years: undefined })); }}
              hint="A player is over-age when their completed years on the date are more than this." />
            <Input label="Over-age players allowed per team" type="number" inputMode="numeric" min={0} max={23} required value={maxOverAge} error={errors.max}
              onChange={(e) => { setMax(e.target.value); setErrors((x) => ({ ...x, max: undefined })); }} />
            {errors.form && <p role="alert" className="text-sm font-medium text-danger">{errors.form}</p>}
            <div><Button type="submit" loading={busy}>Save settings</Button></div>
          </form>
        </Card>
      )}
    </div>
  );
}
