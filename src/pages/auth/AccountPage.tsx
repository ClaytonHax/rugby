import { useState, type FormEvent } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile } from 'firebase/auth';
import { db } from '../../lib/firebase';
import { friendlyAuthError, useAuth } from '../../lib/auth';
import { ROLE_LABELS } from '../../lib/types';
import { Button, Card, Input, PageHeader, useToast } from '../../components/ui';

export default function AccountPage() {
  const { appUser, firebaseUser, refreshClaim } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(appUser?.displayName ?? '');
  const [phone, setPhone] = useState(appUser?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  if (!appUser || !firebaseUser) return null;

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', appUser.uid), { displayName: name.trim(), phone: phone.trim() });
      await updateProfile(firebaseUser, { displayName: name.trim() });
      await refreshClaim();
      toast.success('Profile saved.');
    } catch (err) {
      toast.error(friendlyAuthError(err));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (next.length < 8) { setPwError('Use a new password of at least 8 characters.'); return; }
    setPwBusy(true);
    try {
      await reauthenticateWithCredential(firebaseUser, EmailAuthProvider.credential(appUser.email, current));
      await updatePassword(firebaseUser, next);
      setCurrent(''); setNext('');
      toast.success('Password changed.');
    } catch (err) {
      setPwError(friendlyAuthError(err));
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className="max-w-xl">
      <PageHeader title="My account" subtitle={`${appUser.email} · ${ROLE_LABELS[appUser.role]}`} />
      <div className="flex flex-col gap-5">
        <Card>
          <form onSubmit={saveProfile} className="flex flex-col gap-4">
            <h2 className="text-xl">Profile</h2>
            <Input label="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <div><Button type="submit" loading={saving}>Save profile</Button></div>
          </form>
        </Card>
        <Card>
          <form onSubmit={changePassword} className="flex flex-col gap-4">
            <h2 className="text-xl">Change password</h2>
            <Input label="Current password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
            <Input label="New password" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} error={pwError} />
            <div><Button type="submit" loading={pwBusy}>Change password</Button></div>
          </form>
        </Card>
      </div>
    </div>
  );
}
