import { useState, type FormEvent } from 'react';
import { collection, deleteDoc, doc, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { useCollection, useSchools, writeAudit } from '../../lib/data';
import { ROLE_LABELS, type AppUser, type Invite, type Role } from '../../lib/types';
import { Badge, Button, ConfirmDialog, DataList, Input, Modal, PageHeader, Select, useToast, type Column } from '../../components/ui';

const ALL_ROLES: Role[] = ['union_admin', 'registrar', 'school_admin', 'coach', 'manager', 'scorer'];
const SCHOOL_INVITABLE: Role[] = ['coach', 'manager', 'scorer'];
const NEEDS_SCHOOL: Role[] = ['school_admin', 'coach', 'manager'];

export default function UsersPage() {
  const { appUser } = useAuth();
  const toast = useToast();
  const { data: schools, byId } = useSchools();
  const isUnionAdmin = appUser?.role === 'union_admin';
  const mySchool = appUser?.schoolId ?? null;

  const users = useCollection<AppUser>(
    () => (isUnionAdmin ? collection(db, 'users') : mySchool ? query(collection(db, 'users'), where('schoolId', '==', mySchool)) : null),
    [isUnionAdmin, mySchool],
  );
  const invites = useCollection<Invite>(
    () => (isUnionAdmin ? collection(db, 'invites') : mySchool ? query(collection(db, 'invites'), where('schoolId', '==', mySchool)) : null),
    [isUnionAdmin, mySchool],
  );

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('coach');
  const [schoolId, setSchoolId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toggle, setToggle] = useState<AppUser | null>(null);
  const [revoke, setRevoke] = useState<Invite | null>(null);

  if (!appUser) return null;
  const roles = isUnionAdmin ? ALL_ROLES : SCHOOL_INVITABLE;
  const needsSchool = isUnionAdmin ? NEEDS_SCHOOL.includes(role) : true;
  const schoolOptional = isUnionAdmin && role === 'scorer';
  const showSchool = isUnionAdmin && (needsSchool || schoolOptional);

  const reset = () => { setEmail(''); setRole('coach'); setSchoolId(''); setError(null); };

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const addr = email.trim().toLowerCase();
    const sid = isUnionAdmin ? (showSchool ? schoolId || null : null) : mySchool;
    if (needsSchool && !sid) { setError('Choose a school for this role.'); return; }
    setBusy(true);
    try {
      await setDoc(doc(db, 'invites', addr), {
        email: addr, role, schoolId: sid, invitedBy: appUser.uid, createdAt: serverTimestamp(),
      });
      await writeAudit('user.invited', 'invite', addr, `${ROLE_LABELS[role]}${sid ? ` at ${byId[sid]?.name ?? sid}` : ''}`);
      toast.success(`Invitation saved. Ask ${addr} to sign up with this address.`);
      setOpen(false); reset();
    } catch {
      setError('Could not save the invitation. One may already exist for this email: revoke it first, then invite again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmToggle = async () => {
    if (!toggle) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'users', toggle.uid), { active: !toggle.active });
      await writeAudit(toggle.active ? 'user.deactivated' : 'user.reactivated', 'user', toggle.uid, toggle.email);
      toast.success(toggle.active ? 'User deactivated.' : 'User reactivated.');
      setToggle(null);
    } catch {
      toast.error('Could not update this user.');
    } finally {
      setBusy(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revoke) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'invites', revoke.email));
      await writeAudit('user.invite_revoked', 'invite', revoke.email);
      toast.success('Invitation revoked.');
      setRevoke(null);
    } catch {
      toast.error('Could not revoke the invitation.');
    } finally {
      setBusy(false);
    }
  };

  const canToggle = (u: AppUser) => u.uid !== appUser.uid && (isUnionAdmin || u.role !== 'school_admin');
  const schoolName = (id: string | null) => (id ? byId[id]?.name ?? id : 'All schools');

  const userCols: Column<AppUser>[] = [
    { key: 'name', header: 'Name', primary: true, cell: (u) => <span>{u.displayName}<span className="block text-xs font-normal text-ink-soft">{u.email}</span></span> },
    { key: 'role', header: 'Role', cell: (u) => ROLE_LABELS[u.role] },
    { key: 'school', header: 'School', cell: (u) => schoolName(u.schoolId) },
    { key: 'status', header: 'Status', cell: (u) => <Badge tone={u.active ? 'green' : 'red'}>{u.active ? 'Active' : 'Deactivated'}</Badge> },
    { key: 'act', header: '', cell: (u) => canToggle(u) ? <Button size="sm" variant="secondary" onClick={() => setToggle(u)}>{u.active ? 'Deactivate' : 'Reactivate'}</Button> : null },
  ];
  const inviteCols: Column<Invite>[] = [
    { key: 'email', header: 'Email', primary: true, cell: (i) => i.email },
    { key: 'role', header: 'Role', cell: (i) => ROLE_LABELS[i.role] },
    { key: 'school', header: 'School', cell: (i) => schoolName(i.schoolId) },
    { key: 'act', header: '', cell: (i) => <Button size="sm" variant="secondary" onClick={() => setRevoke(i)}>Revoke</Button> },
  ];

  return (
    <div>
      <PageHeader title="Users" subtitle={isUnionAdmin ? 'Invite anyone and manage access.' : 'Invite coaches, managers and scorers for your school.'}
        actions={<Button icon={<Plus className="size-4" />} onClick={() => { reset(); setOpen(true); }}>Invite user</Button>} />
      <h2 className="mb-2 text-xl">Pending invitations</h2>
      <div className="mb-8">
        <DataList items={invites.data} columns={inviteCols} rowKey={(i) => i.email} loading={invites.loading} error={invites.error}
          empty={<p className="rounded-xl border border-dashed border-line bg-white p-4 text-sm text-ink-soft">No pending invitations.</p>} />
      </div>
      <h2 className="mb-2 text-xl">Active accounts</h2>
      <DataList items={users.data} columns={userCols} rowKey={(u) => u.uid} loading={users.loading} error={users.error} />

      <Modal open={open} onClose={() => setOpen(false)} title="Invite a user">
        <form onSubmit={invite} className="flex flex-col gap-4">
          <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)} options={roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
          {showSchool && (
            <Select label="School" required={needsSchool} value={schoolId} onChange={(e) => setSchoolId(e.target.value)}
              placeholder={schoolOptional ? 'All schools' : 'Choose a school'} options={schools.map((s) => ({ value: s.id, label: s.name }))} />
          )}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <Button type="submit" loading={busy}>Save invitation</Button>
        </form>
      </Modal>
      <ConfirmDialog open={!!toggle} title={toggle?.active ? 'Deactivate user?' : 'Reactivate user?'}
        message={toggle?.active ? `${toggle?.displayName} will be signed out and unable to use Tryline until reactivated.` : `${toggle?.displayName} will be able to sign in again.`}
        confirmLabel={toggle?.active ? 'Deactivate' : 'Reactivate'} tone={toggle?.active ? 'danger' : 'primary'} loading={busy}
        onConfirm={confirmToggle} onCancel={() => setToggle(null)} />
      <ConfirmDialog open={!!revoke} title="Revoke invitation?" message={`${revoke?.email} will no longer be able to claim access.`}
        confirmLabel="Revoke" tone="danger" loading={busy} onConfirm={confirmRevoke} onCancel={() => setRevoke(null)} />
    </div>
  );
}
