import { useRef, useState } from 'react';
import { Camera, CheckCircle2, CircleDashed, Lock, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, useToast } from '../ui';
import { canViewDocument, deleteDocument, docId, uploadDocument, type DocOwner } from '../../lib/documents';
import { useAuth } from '../../lib/auth';
import { friendlyError } from '../../lib/data';
import type { DocType, StoredDocument } from '../../lib/types';
import { DocumentViewer } from './DocumentViewer';

function formatSize(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * Upload / replace / remove one document. "Uploaded" comes from metadata, so roles that cannot read
 * the bytes (coaches and managers for ID documents) still see the state, but get no view button.
 */
export function DocumentUploader({ owner, type, label, hint, existing, disabled, disabledReason, optional, autoLoad }: {
  owner: DocOwner;
  type: DocType;
  label: string;
  hint?: string;
  existing?: StoredDocument;
  disabled?: boolean;
  disabledReason?: string;
  optional?: boolean;
  autoLoad?: boolean;
}) {
  const { appUser } = useAuth();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const done = existing?.complete === true;
  const uploading = progress !== null;
  const canView = done && canViewDocument(appUser?.role, type);
  const id = docId(owner.ownerType, owner.ownerId, type);

  async function onFile(file: File | undefined) {
    if (input.current) input.current.value = '';
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      await uploadDocument(owner, type, file, setProgress);
      toast.success(`${label} uploaded.`);
    } catch (err) {
      setError(friendlyError(err, 'The upload failed. Try again.'));
    } finally {
      setProgress(null);
    }
  }

  async function remove() {
    setRemoving(true);
    try {
      await deleteDocument(id);
      toast.success(`${label} removed.`);
      setConfirmRemove(false);
    } catch (err) {
      toast.error(friendlyError(err, 'Could not remove the document.'));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-start gap-3">
        {done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-status-verified" aria-hidden />
          : <CircleDashed className="mt-0.5 size-5 shrink-0 text-ink-soft" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{label}{optional && <span className="ml-1 text-xs font-normal text-ink-soft">(optional)</span>}</p>
          {done && existing ? (
            <p className="text-sm text-status-verified">Uploaded <span className="text-ink-soft">- {existing.fileName}, {formatSize(existing.size)}</span></p>
          ) : existing ? (
            <p className="text-sm text-danger">The last upload did not finish. Please upload again.</p>
          ) : (
            <p className="text-sm text-ink-soft">{hint ?? 'Not uploaded yet.'}</p>
          )}
          {done && !canView && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-ink-soft"><Lock className="size-3" aria-hidden /> Only your school administrator and the registrar can open this file.</p>
          )}
        </div>
      </div>

      {uploading && (
        <div className="mt-3" role="progressbar" aria-label={`Uploading ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress ?? 0) * 100)}>
          <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-pitch transition-all" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} /></div>
          <p className="mt-1 text-xs text-ink-soft">Uploading {Math.round((progress ?? 0) * 100)}%. Keep this page open.</p>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {disabled ? (
          <p className="text-xs text-ink-soft">{disabledReason ?? 'Documents cannot be changed right now.'}</p>
        ) : (
          <>
            <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-label={`Choose file for ${label}`}
              accept={type === 'photo' ? 'image/*' : 'image/*,application/pdf'}
              onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button size="sm" variant={done ? 'secondary' : 'primary'} icon={<Camera className="size-4" />} loading={uploading} aria-label={done ? `Replace ${label.toLowerCase()}` : undefined}
              onClick={() => input.current?.click()}>
              {done ? 'Replace' : type === 'photo' ? 'Take or choose photo' : 'Take photo or choose file'}
            </Button>
            {existing && !uploading && (
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} aria-label={`Remove ${label.toLowerCase()}`} onClick={() => setConfirmRemove(true)}>Remove</Button>
            )}
          </>
        )}
      </div>
      {canView && <div className="mt-3"><DocumentViewer documentId={id} label={label} autoLoad={autoLoad} /></div>}
      <ConfirmDialog open={confirmRemove} title={`Remove ${label.toLowerCase()}?`} tone="danger" confirmLabel="Remove" loading={removing}
        message="The file will be permanently deleted. You will need to upload it again before this record can be submitted."
        onConfirm={() => void remove()} onCancel={() => setConfirmRemove(false)} />
    </div>
  );
}
