import { useState, type FormEvent } from 'react';
import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import { deleteSchool, schoolUsage, usageIsEmpty, type SchoolUsage } from '../../lib/admin';
import { confirmWrite, friendlyError, savedText, useSchools, writeAudit } from '../../lib/data';
import type { School } from '../../lib/types';
import { Button, DataList, EmptyState, Input, Modal, PageHeader, Select, useFocusFirstInvalid, useToast, type Column } from '../../components/ui';

const PROVINCES = ['Bulawayo', 'Harare', 'Manicaland', 'Mashonaland Central', 'Mashonaland East', 'Mashonaland West', 'Masvingo', 'Matabeleland North', 'Matabeleland South', 'Midlands'];

export default function SchoolsAdminPage() {
  const { data: schools, loading, error, retry } = useSchools();
  const toast = useToast();
  const [editing, setEditing] = useState<School | 'new' | null>(null);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [town, setTown] = useState('');
  const [province, setProvince] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<School | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tick, setTick] = useState(0);
  useFocusFirstInvalid(tick);

  const openForm = (s: School | 'new') => {
    setEditing(s);
    setFormError(null);
    const cur = s === 'new' ? null : s;
    setName(cur?.name ?? ''); setShortName(cur?.shortName ?? ''); setTown(cur?.town ?? ''); setProvince(cur?.province ?? '');
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !town.trim() || !province) { setFormError('Fill in the school name, town and province.'); setTick((n) => n + 1); return; }
    setFormError(null);
    setBusy(true);
    const data = { name: name.trim(), town: town.trim(), province, ...(shortName.trim() ? { shortName: shortName.trim() } : {}) };
    let outcome: 'saved' | 'queued' = 'saved';
    try {
      if (editing === 'new') {
        const ref = doc(collection(db, 'schools'));
        outcome = await confirmWrite(setDoc(ref, data));
        void writeAudit('school.created', 'school', ref.id, data.name);
      } else if (editing) {
        outcome = await confirmWrite(updateDoc(doc(db, 'schools', editing.id), { ...data, shortName: shortName.trim() }));
        void writeAudit('school.updated', 'school', editing.id, data.name);
      }
      toast.success(savedText('School saved.', outcome));
      setEditing(null);
    } catch (err) {
      setFormError(friendlyError(err, 'Could not save the school. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const [usage, setUsage] = useState<SchoolUsage | null>(null);
  const [checking, setChecking] = useState<string | null>(null);

  const startDelete = async (s: School) => {
    setChecking(s.id);
    try {
      setUsage(await schoolUsage(s.id));
      setDel(s);
    } catch (err) {
      toast.error(friendlyError(err, 'Could not check what belongs to this school.'));
    } finally {
      setChecking(null);
    }
  };
  const closeDelete = () => { setDel(null); setUsage(null); };

  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      await deleteSchool(del.id, del.name);
      toast.success('School deleted.');
      closeDelete();
    } catch (err) {
      toast.error(friendlyError(err, 'Could not delete the school.'));
    } finally {
      setBusy(false);
    }
  };

  const q = search.trim().toLowerCase();
  const shown = q ? schools.filter((s) => `${s.name} ${s.town} ${s.province}`.toLowerCase().includes(q)) : schools;

  const cols: Column<School>[] = [
    { key: 'name', header: 'School', primary: true, cell: (s) => s.name },
    { key: 'town', header: 'Town', cell: (s) => s.town },
    { key: 'province', header: 'Province', cell: (s) => s.province },
    { key: 'act', header: '', cell: (s) => (
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />} onClick={() => openForm(s)} aria-label={`Edit ${s.name}`}>Edit</Button>
        <Button size="sm" variant="ghost" className="min-w-11" loading={checking === s.id} onClick={() => void startDelete(s)} aria-label={`Delete ${s.name}`}><Trash2 className="size-4 text-danger" aria-hidden /></Button>
      </div>
    ) },
  ];

  return (
    <div>
      <PageHeader title="Schools" subtitle="The public school directory." actions={<Button icon={<Plus className="size-4" />} onClick={() => openForm('new')}>Add school</Button>} />
      {schools.length > 6 && <div className="mb-4 max-w-sm"><Input label="Search schools" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, town or province" /></div>}
      <DataList items={shown} columns={cols} rowKey={(s) => s.id} loading={loading} error={error} onRetry={retry}
        empty={schools.length > 0
          ? <EmptyState title="No schools match" description="Try a different name, town or province." action={<Button variant="secondary" onClick={() => setSearch('')}>Clear search</Button>} />
          : <EmptyState title="No schools yet" description="Add the first member school to start inviting its staff." action={<Button onClick={() => openForm('new')}>Add school</Button>} />} />
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add school' : 'Edit school'}>
        <form onSubmit={save} noValidate className="flex flex-col gap-4">
          <Input label="School name" required autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} error={formError && !name.trim() ? 'Enter the school name.' : null} />
          <Input label="Short name" hint="Optional, e.g. for tight spaces." autoComplete="off" value={shortName} onChange={(e) => setShortName(e.target.value)} />
          <Input label="Town" required autoComplete="off" value={town} onChange={(e) => setTown(e.target.value)} error={formError && !town.trim() ? 'Enter the town.' : null} />
          <Select label="Province" required value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Choose a province"
            error={formError && !province ? 'Choose the province.' : null} options={PROVINCES.map((p) => ({ value: p, label: p }))} />
          {formError && name.trim() && town.trim() && province && <p role="alert" className="text-sm font-medium text-danger">{formError}</p>}
          <Button type="submit" loading={busy}>Save school</Button>
        </form>
      </Modal>
      <Modal open={!!del} onClose={closeDelete} title={usage && !usageIsEmpty(usage) ? 'This school cannot be deleted yet' : 'Delete school?'}
        footer={usage && !usageIsEmpty(usage)
          ? <Button onClick={closeDelete}>OK</Button>
          : <><Button variant="secondary" onClick={closeDelete} disabled={busy}>Keep school</Button><Button variant="danger" loading={busy} onClick={() => void remove()}>Delete school</Button></>}>
        {usage && !usageIsEmpty(usage) ? (
          <div className="text-sm">
            <p><strong>{del?.name}</strong> still has:</p>
            <ul className="my-2 list-disc pl-5">
              {usage.teams > 0 && <li>{usage.teams} {usage.teams === 1 ? 'team' : 'teams'}</li>}
              {usage.players > 0 && <li>{usage.players} {usage.players === 1 ? 'player' : 'players'}</li>}
              {usage.staff > 0 && <li>{usage.staff} staff {usage.staff === 1 ? 'record' : 'records'}</li>}
              {usage.users > 0 && <li>{usage.users} user {usage.users === 1 ? 'account' : 'accounts'}</li>}
              {usage.matches > 0 && <li>{usage.matches} {usage.matches === 1 ? 'match' : 'matches'}</li>}
            </ul>
            <p>Deleting it now would leave these without a school. Delete or move them first (matches, teams, players and staff, then remove user access), then try again.</p>
          </div>
        ) : (
          <p className="text-sm"><strong>{del?.name}</strong> has no teams, players, staff, users or matches. It will be removed from the public directory. This cannot be undone.</p>
        )}
      </Modal>
    </div>
  );
}
