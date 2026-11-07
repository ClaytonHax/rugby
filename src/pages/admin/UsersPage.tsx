import { useState, type FormEvent } from 'react';
import { collection, deleteDoc, doc, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { removeUserAccess } from '../../lib/admin';
import { confirmWrite, friendlyError, savedText, useCollection, useSchools, writeAudit } from '../../lib/data';
import { ROLE_LABELS, type AppUser, type Invite, type Role } from '../../lib/types';
import { Badge, Button, ConfirmDialog, DataList, Input, Modal, PageHeader, Select, useFocusFirstInvalid, useToast, type Column } from '../../components/ui';

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
  const [schoolError, setSchoolError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  useFocusFirstInvalid(tick);
  const [toggle, setToggle] = useState<AppUser | null>(null);
  const [revoke, setRevoke] = useState<Invite | null>(null);
  const [removeUser, setRemoveUser] = useState<AppUser | null>(null);

  if (!appUser) return null;
  const roles = isUnionAdmin ? ALL_ROLES : SCHOOL_INVITABLE;
  const needsSchool = isUnionAdmin ? NEEDS_SCHOOL.includes(role) : true;
  const schoolOptional = isUnionAdmin && role === 'scorer';
  const showSchool = isUnionAdmin && (needsSchool || schoolOptional);

  const reset = () => { setEmail(''); setRole('coach'); setSchoolId(''); setError(null); setSchoolError(null); setEmailError(null); };

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSchoolError(null);
    setEmailError(null);
    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) { setEmailError('Enter the full email address, for example name@school.co.zw.'); setTick((n) => n + 1); return; }
    const sid = isUnionAdmin ? (showSchool ? schoolId || null : null) : mySchool;
    if (needsSchool && !sid) { setSchoolError('Choose a school for this role.'); setTick((n) => n + 1); return; }
    if (users.data.some((u) => u.email.toLowerCase() === addr)) { setEmailError(`${addr} already has an account.`); setTick((n) => n + 1); return; }
    setBusy(true);
    try {
      const outcome = await confirmWrite(setDoc(doc(db, 'invites', addr), {
        email: addr, role, schoolId: sid, invitedBy: appUser.uid, createdAt: serverTimestamp(),
      }), () => toast.error(`The invitation for ${addr} could not be saved.`));
      void writeAudit('user.invited', 'invite', addr, `${ROLE_LABELS[role]}${sid ? ` at ${byId[sid]?.name ?? sid}` : ''}`);
      toast.success(savedText(`Invitation saved. Ask ${addr} to sign up with this address.`, outcome));
      setOpen(false); reset();
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
      setError(code === 'permission-denied'
        ? 'Could not save the invitation. One may already exist for this email: revoke it first, then invite again.'
        : friendlyError(err, 'Could not save the invitation. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmToggle = async () => {
    if (!toggle) return;
    setBusy(true);
    try {
      const outcome = await confirmWrite(updateDoc(doc(db, 'users', toggle.uid), { active: !toggle.active }));
      void writeAudit(toggle.active ? 'user.deactivated' : 'user.reactivated', 'user', toggle.uid, toggle.email);
      toast.success(savedText(toggle.active ? 'User deactivated.' : 'User reactivated.', outcome));
      setToggle(null);
    } catch (err) {
      toast.error(friendlyError(err, 'Could not update this user.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeUser) return;
    setBusy(true);
    try {
      await removeUserAccess(removeUser);
      toast.success(`${removeUser.displayName} no longer has access.`);
      setRemoveUser(null);
    } catch (err) {
      toast.error(friendlyError(err, 'Could not remove access.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revoke) return;
    setBusy(true);
    try {
      const outcome = await confirmWrite(deleteDoc(doc(db, 'invites', revoke.email)));
      void writeAudit('user.invite_revoked', 'invite', revoke.email);
      toast.success(savedText('Invitation revoked.', outcome));
      setRevoke(null);
    } catch (err) {
      toast.error(friendlyError(err, 'Could not revoke the invitation.'));
    } finally {
      setBusy(false);
    }
  };

  const canToggle = (u: AppUser) => u.uid !== appUser.uid && (isUnionAdmin || u.role !== 'school_admin');
  const q = search.trim().toLowerCase();
  const shownUsers = q ? users.data.filter((u) => `${u.displayName} ${u.email}`.toLowerCase().includes(q)) : users.data;
  const schoolName = (id: string | null) => (id ? byId[id]?.name ?? id : 'All schools');

  const userCols: Column<AppUser>[] = [
    { key: 'name', header: 'Name', primary: true, cell: (u) => <span>{u.displayName}<span className="block text-xs font-normal text-ink-soft">{u.email}</span></span> },
    { key: 'role', header: 'Role', cell: (u) => ROLE_LABELS[u.role] },
    { key: 'school', header: 'School', cell: (u) => schoolName(u.schoolId) },
    { key: 'status', header: 'Status', cell: (u) => <Badge tone={u.active ? 'green' : 'red'}>{u.active ? 'Active' : 'Deactivated'}</Badge> },
    { key: 'act', header: '', cell: (u) => canToggle(u) ? (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" aria-label={`${u.active ? 'Deactivate' : 'Reactivate'} ${u.displayName}`} onClick={() => setToggle(u)}>{u.active ? 'Deactivate' : 'Reactivate'}</Button>
        {isUnionAdmin && <Button size="sm" variant="ghost" className="text-danger" aria-label={`Remove access for ${u.displayName}`} onClick={() => setRemoveUser(u)}>Remove access</Button>}
      </div>
    ) : null },
  ];
  const inviteCols: Column<Invite>[] = [
    { key: 'email', header: 'Email', primary: true, cell: (i) => i.email },
    { key: 'role', header: 'Role', cell: (i) => ROLE_LABELS[i.role] },
    { key: 'school', header: 'School', cell: (i) => schoolName(i.schoolId) },
    { key: 'act', header: '', cell: (i) => <Button size="sm" variant="secondary" aria-label={`Revoke invitation for ${i.email}`} onClick={() => setRevoke(i)}>Revoke</Button> },
  ];

  return (
    <div>
      <PageHeader title="Users" subtitle={isUnionAdmin ? 'Invite anyone and manage access.' : 'Invite coaches, managers and scorers for your school.'}
        actions={<Button icon={<Plus className="size-4" />} onClick={() => { reset(); setOpen(true); }}>Invite user</Button>} />
      <h2 className="mb-2 text-xl">Pending invitations</h2>
      <div className="mb-8">
        <DataList items={invites.data} columns={inviteCols} rowKey={(i) => i.email} loading={invites.loading} error={invites.error} onRetry={invites.retry}
          empty={<p className="rounded-xl border border-dashed border-line bg-white p-4 text-sm text-ink-soft">No pending invitations. Use Invite user to add someone.</p>} />
      </div>
      <h2 className="mb-2 text-xl">Accounts</h2>
      {users.data.length > 6 && <div className="mb-3 max-w-sm"><Input label="Search accounts" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" /></div>}
      <DataList items={shownUsers} columns={userCols} rowKey={(u) => u.uid} loading={users.loading} error={users.error} onRetry={users.retry}
        empty={<p className="rounded-xl border border-dashed border-line bg-white p-4 text-sm text-ink-soft">{search ? 'No accounts match that search.' : 'No accounts yet. People appear here once they sign up from an invitation.'}</p>} />

      <Modal open={open} onClose={() => setOpen(false)} title="Invite a user">
        <form onSubmit={invite} noValidate className="flex flex-col gap-4">
          <Input label="Email" type="email" required autoComplete="off" autoCapitalize="none" spellCheck={false} value={email} error={emailError} onChange={(e) => { setEmail(e.target.value); setEmailError(null); }} />
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)} options={roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
          {showSchool && (
            <Select label="School" required={needsSchool} value={schoolId} error={schoolError} onChange={(e) => { setSchoolId(e.target.value); setSchoolError(null); }}
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
      <ConfirmDialog open={!!removeUser} title="Remove access?" tone="danger" confirmLabel="Remove access" loading={busy}
        message={<div className="flex flex-col gap-2">
          <p><strong>{removeUser?.displayName}</strong> ({removeUser?.email}) will lose all access to Tryline straight away and disappear from this list.</p>
          <p>Their login cannot be deleted from here, so the email address stays registered. If you invite the same address again, they get access back the next time they sign in.</p>
          <p className="text-ink-soft">Deactivate is gentler: it blocks sign-in but keeps the account, so it can be reactivated in one tap.</p>
        </div>}
        onConfirm={confirmRemove} onCancel={() => setRemoveUser(null)} />
      <ConfirmDialog open={!!revoke} title="Revoke invitation?" message={`${revoke?.email} will no longer be able to claim access.`}
        confirmLabel="Revoke" tone="danger" loading={busy} onConfirm={confirmRevoke} onCancel={() => setRevoke(null)} />
    </div>
  );
}
