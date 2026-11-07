import { useState, type FormEvent } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile } from 'firebase/auth';
import { db } from '../../lib/firebase';
import { friendlyAuthError, useAuth } from '../../lib/auth';
import { confirmWrite, friendlyError, savedText } from '../../lib/data';
import { ROLE_LABELS } from '../../lib/types';
import { InstallApp } from '../../components/PwaPrompts';
import { Button, Card, Input, PageHeader, useFocusFirstInvalid, useToast } from '../../components/ui';

export default function AccountPage() {
  const { appUser, firebaseUser, refreshClaim } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(appUser?.displayName ?? '');
  const [phone, setPhone] = useState(appUser?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useFocusFirstInvalid(tick);
  if (!appUser || !firebaseUser) return null;

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setNameError('Enter your name.'); setTick((n) => n + 1); return; }
    setNameError(null);
    setSaving(true);
    try {
      const outcome = await confirmWrite(updateDoc(doc(db, 'users', appUser.uid), { displayName: name.trim(), phone: phone.trim() }),
        () => toast.error('Your profile changes could not be saved.'));
      if (outcome === 'saved') {
        await updateProfile(firebaseUser, { displayName: name.trim() });
        await refreshClaim();
      }
      toast.success(savedText('Profile saved.', outcome));
    } catch (err) {
      toast.error(friendlyError(err, friendlyAuthError(err)));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setCurrentError(null);
    if (next.length < 8) { setPwError('Use a new password of at least 8 characters.'); setTick((n) => n + 1); return; }
    setPwBusy(true);
    try {
      await reauthenticateWithCredential(firebaseUser, EmailAuthProvider.credential(appUser.email, current));
      await updatePassword(firebaseUser, next);
      setCurrent(''); setNext('');
      toast.success('Password changed.');
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') setCurrentError('That is not your current password.');
      else setPwError(friendlyAuthError(err));
      setTick((n) => n + 1);
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className="max-w-xl">
      <PageHeader title="My account" subtitle={`${appUser.email} · ${ROLE_LABELS[appUser.role]}`} />
      <div className="flex flex-col gap-5">
        <Card>
          <form onSubmit={saveProfile} noValidate className="flex flex-col gap-4">
            <h2 className="text-xl">Profile</h2>
            <Input label="Full name" required autoComplete="name" autoCapitalize="words" value={name} error={nameError} onChange={(e) => { setName(e.target.value); setNameError(null); }} />
            <Input label="Phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <div><Button type="submit" loading={saving}>Save profile</Button></div>
          </form>
        </Card>
        <Card>
          <h2 className="mb-2 text-xl">Install on this device</h2>
          <p className="mb-3 text-sm text-ink-soft">Open Tryline from your home screen like an app. It opens even with no signal, and saved changes sync when you are back online.</p>
          <InstallApp />
        </Card>
        <Card>
          <form onSubmit={changePassword} className="flex flex-col gap-4">
            <h2 className="text-xl">Change password</h2>
            <Input label="Current password" type="password" autoComplete="current-password" required value={current} error={currentError} onChange={(e) => { setCurrent(e.target.value); setCurrentError(null); }} />
            <Input label="New password" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} hint="At least 8 characters." error={pwError} />
            <div><Button type="submit" loading={pwBusy}>Change password</Button></div>
          </form>
        </Card>
      </div>
    </div>
  );
}
