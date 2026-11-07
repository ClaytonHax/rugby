import { useState, type FormEvent } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useSchools, writeAudit } from '../../lib/data';
import type { School } from '../../lib/types';
import { Button, ConfirmDialog, DataList, EmptyState, Input, Modal, PageHeader, useToast, type Column } from '../../components/ui';

const PROVINCES = ['Bulawayo', 'Harare', 'Manicaland', 'Mashonaland Central', 'Mashonaland East', 'Mashonaland West', 'Masvingo', 'Matabeleland North', 'Matabeleland South', 'Midlands'];

export default function SchoolsAdminPage() {
  const { data: schools, loading, error } = useSchools();
  const toast = useToast();
  const [editing, setEditing] = useState<School | 'new' | null>(null);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [town, setTown] = useState('');
  const [province, setProvince] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<School | null>(null);

  const openForm = (s: School | 'new') => {
    setEditing(s);
    const cur = s === 'new' ? null : s;
    setName(cur?.name ?? ''); setShortName(cur?.shortName ?? ''); setTown(cur?.town ?? ''); setProvince(cur?.province ?? '');
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const data = { name: name.trim(), town: town.trim(), province, ...(shortName.trim() ? { shortName: shortName.trim() } : {}) };
    try {
      if (editing === 'new') {
        const ref = await addDoc(collection(db, 'schools'), data);
        await writeAudit('school.created', 'school', ref.id, data.name);
      } else if (editing) {
        await updateDoc(doc(db, 'schools', editing.id), { ...data, shortName: shortName.trim() });
        await writeAudit('school.updated', 'school', editing.id, data.name);
      }
      toast.success('School saved.');
      setEditing(null);
    } catch {
      toast.error('Could not save the school.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'schools', del.id));
      await writeAudit('school.deleted', 'school', del.id, del.name);
      toast.success('School deleted.');
      setDel(null);
    } catch {
      toast.error('Could not delete the school.');
    } finally {
      setBusy(false);
    }
  };

  const cols: Column<School>[] = [
    { key: 'name', header: 'School', primary: true, cell: (s) => s.name },
    { key: 'town', header: 'Town', cell: (s) => s.town },
    { key: 'province', header: 'Province', cell: (s) => s.province },
    { key: 'act', header: '', cell: (s) => (
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />} onClick={() => openForm(s)} aria-label={`Edit ${s.name}`}>Edit</Button>
        <Button size="sm" variant="ghost" onClick={() => setDel(s)} aria-label={`Delete ${s.name}`}><Trash2 className="size-4 text-danger" /></Button>
      </div>
    ) },
  ];

  return (
    <div>
      <PageHeader title="Schools" subtitle="The public school directory." actions={<Button icon={<Plus className="size-4" />} onClick={() => openForm('new')}>Add school</Button>} />
      <DataList items={schools} columns={cols} rowKey={(s) => s.id} loading={loading} error={error}
        empty={<EmptyState title="No schools yet" description="Add the first member school to start inviting its staff." action={<Button onClick={() => openForm('new')}>Add school</Button>} />} />
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add school' : 'Edit school'}>
        <form onSubmit={save} className="flex flex-col gap-4">
          <Input label="School name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Short name" hint="Optional, e.g. for tight spaces." value={shortName} onChange={(e) => setShortName(e.target.value)} />
          <Input label="Town" required value={town} onChange={(e) => setTown(e.target.value)} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="prov" className="text-sm font-medium">Province<span className="text-danger" aria-hidden> *</span></label>
            <select id="prov" required value={province} onChange={(e) => setProvince(e.target.value)} className="min-h-11 rounded-lg border border-line bg-white px-3 text-base">
              <option value="">Choose a province</option>
              {PROVINCES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <Button type="submit" loading={busy}>Save school</Button>
        </form>
      </Modal>
      <ConfirmDialog open={!!del} title="Delete school?" message={`${del?.name} will be removed from the directory. Existing teams and records are not deleted.`}
        confirmLabel="Delete" tone="danger" loading={busy} onConfirm={remove} onCancel={() => setDel(null)} />
    </div>
  );
}
