import { useState, type ReactNode } from 'react';
import { doc } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, Lock, Pencil, Send, ShieldAlert, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, LinkButton, Modal, PageHeader, SkeletonList, StatusBadge, Textarea, useToast,
} from '../ui';
import { db } from '../../lib/firebase';
import { useDoc, useSettings } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { ageOn, isOverAge, todayISO } from '../../lib/eligibility';
import { useOwnerDocuments } from '../../lib/documents';
import {
  collectionName, deleteDraftPerson, ID_TYPE_LABELS, idDocType, isUnionRole, missingForSubmission, personName,
  reinstatePerson, rejectPerson, submitForVerification, suspendPerson, verifyPerson, type AnyPerson, type PersonKind,
} from '../../lib/people';
import { STAFF_ROLE_LABELS, type Player, type Staff } from '../../lib/types';
import { DocumentUploader } from './DocumentUploader';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="break-words text-sm font-medium text-ink">{children || <span className="text-ink-soft">Not given</span>}</dd>
    </div>
  );
}

type Dialog = null | 'reject' | 'suspend' | 'verify' | 'reinstate' | 'delete';

/** Full record view: identity, guardian, documents and the actions the current role may take. */
export function PersonDetail({ kind, id, review = false, backTo, onActed }: {
  kind: PersonKind; id: string; review?: boolean; backTo?: string; onActed?: () => void;
}) {
  const { appUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { data: p, loading, error } = useDoc<AnyPerson>(() => doc(db, collectionName(kind), id), [kind, id]);
  const owner = p ? { ownerType: kind, ownerId: p.id, schoolId: p.schoolId } : null;
  const docs = useOwnerDocuments(owner);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <SkeletonList rows={3} />;
  if (error) return <EmptyState title="Could not open this record" description={error} />;
  if (!p) return <EmptyState title="Record not found" description="It may have been deleted, or it belongs to another school." />;

  const role = appUser?.role;
  const union = isUnionRole(role);
  const listPath = kind === 'player' ? '/app/players' : '/app/staff';
  const editPath = `${listPath}/new?id=${p.id}`;
  const player = kind === 'player' ? (p as Player) : null;
  const staff = kind === 'staff' ? (p as Staff) : null;
  const missing = missingForSubmission(kind, p);
  const locked = p.status === 'verified' && !union; // identity changes need a registrar
  const docsLocked = (p.status === 'verified' || p.status === 'suspended') && !union;
  const canEdit = union || (p.status !== 'suspended');
  const age = ageOn(p.dob, todayISO());
  const over = player ? isOverAge(p.dob, todayISO(), settings) : false;

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      setDialog(null);
      setReason('');
      onActed?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const name = personName(p);
  const sectionTitle = 'mb-3 text-xl';

  return (
    <div>
      <PageHeader title={name} backTo={review ? undefined : backTo ?? listPath}
        subtitle={`${p.schoolName}${p.registrationNo ? ` - ${p.registrationNo}` : ''}`}
        actions={
          <>
            <StatusBadge status={p.status} className="self-center" />
            {canEdit && <LinkButton to={editPath} variant="secondary" icon={<Pencil className="size-4" />}>
              {p.status === 'draft' || p.status === 'rejected' ? 'Continue registration' : 'Edit'}
            </LinkButton>}
          </>
        } />

      {(p.status === 'rejected' || p.status === 'suspended') && (
        <div role="alert" className="mb-4 flex gap-3 rounded-xl border border-danger/40 bg-red-50 p-4 text-sm text-red-900">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{p.status === 'rejected' ? 'Rejected by the registrar' : 'Suspended'}</p>
            <p>{p.rejectionReason || 'No reason recorded.'}</p>
            {p.status === 'rejected' && <p className="mt-1">Fix the problem, then submit again.</p>}
            {p.status === 'suspended' && !union && <p className="mt-1">Contact the registrar to be reinstated.</p>}
          </div>
        </div>
      )}
      {locked && (
        <div className="mb-4 flex gap-3 rounded-xl border border-line bg-white p-4 text-sm text-ink">
          <Lock className="mt-0.5 size-5 shrink-0 text-pitch" aria-hidden />
          <p>This record is verified. Name, date of birth and ID details are locked. If something is wrong, ask a registrar to correct it.</p>
        </div>
      )}

      <div className={review ? 'grid gap-4 xl:grid-cols-2' : 'flex flex-col gap-4'}>
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className={sectionTitle}>Identity</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Row label="First name">{p.firstName}</Row>
              <Row label="Last name">{p.lastName}</Row>
              <Row label="Date of birth">{p.dob}</Row>
              <Row label="Age">
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="num text-lg">{age}</span>
                  {player && (over
                    ? <Badge tone="gold"><AlertTriangle className="mr-1 size-3" aria-hidden /> Over-age (limit {settings.overAgeYears})</Badge>
                    : <Badge tone="neutral">Within age limit</Badge>)}
                </span>
              </Row>
              <Row label="ID type">{ID_TYPE_LABELS[p.idType]}</Row>
              <Row label="ID number">{p.idNumber}</Row>
              {player && <Row label="Position">{[player.position, player.secondaryPosition].filter(Boolean).join(' / ')}</Row>}
              {staff && <Row label="Role">{STAFF_ROLE_LABELS[staff.staffRole]}</Row>}
              {staff && <Row label="Phone">{staff.phone}</Row>}
              {staff && <Row label="Email">{staff.email ?? ''}</Row>}
              {staff && <Row label="Qualification">{staff.qualification ?? ''}</Row>}
              <Row label="Teams">{p.teamIds.length ? `${p.teamIds.length} team${p.teamIds.length === 1 ? '' : 's'}` : ''}</Row>
            </dl>
          </Card>

          {player && (
            <Card>
              <h2 className={sectionTitle}>Guardian and consent</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <Row label="Guardian">{player.guardianName}</Row>
                <Row label="Phone">{player.guardianPhone}</Row>
                <Row label="Email">{player.guardianEmail ?? ''}</Row>
                <Row label="Consent to store this data">
                  {player.consentGiven
                    ? <span className="inline-flex items-center gap-1 text-status-verified"><CheckCircle2 className="size-4" aria-hidden /> Given</span>
                    : <span className="text-danger">Not given</span>}
                </Row>
              </dl>
            </Card>
          )}
        </div>

        <Card>
          <h2 className={sectionTitle}>Documents</h2>
          {docs.error && <p role="alert" className="mb-2 text-sm text-danger">{docs.error}</p>}
          <div className="flex flex-col gap-3">
            <DocumentUploader owner={owner!} type="photo" label="Photo" hint="Clear face photo, no hat or sunglasses."
              existing={docs.byType.photo} disabled={docsLocked} disabledReason="Documents on a verified record can only be changed by a registrar." autoLoad={review} />
            <DocumentUploader owner={owner!} type={idDocType(p)} label={ID_TYPE_LABELS[p.idType]}
              hint="Photograph or scan the whole page." existing={docs.byType[idDocType(p)]} disabled={docsLocked}
              disabledReason="Documents on a verified record can only be changed by a registrar." autoLoad={review} />
            {staff && <DocumentUploader owner={owner!} type="qualification" label="Qualification certificate" optional
              existing={docs.byType.qualification} disabled={docsLocked} disabledReason="Documents on a verified record can only be changed by a registrar." autoLoad={review} />}
          </div>
        </Card>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {(p.status === 'draft' || p.status === 'rejected') && !docsLocked && (
          <div className="flex w-full flex-col gap-2">
            {missing.length > 0 && <p className="text-sm text-ink-soft">Still needed before you can submit: {missing.join(', ')}.</p>}
            <div>
              <Button icon={<Send className="size-4" />} disabled={missing.length > 0} loading={busy}
                onClick={() => void run(() => submitForVerification(kind, p.id), 'Submitted for verification.')}>
                Submit for verification
              </Button>
            </div>
          </div>
        )}
        {union && p.status === 'pending' && (
          <>
            <Button icon={<CheckCircle2 className="size-4" />} disabled={missing.length > 0} onClick={() => setDialog('verify')}>Verify</Button>
            <Button variant="danger" onClick={() => { setReason(''); setDialog('reject'); }}>Reject</Button>
            {missing.length > 0 && <p className="w-full text-sm text-danger">Cannot verify: missing {missing.join(', ')}.</p>}
          </>
        )}
        {union && p.status === 'verified' && <Button variant="danger" onClick={() => { setReason(''); setDialog('suspend'); }}>Suspend</Button>}
        {union && p.status === 'suspended' && <Button onClick={() => setDialog('reinstate')}>Reinstate</Button>}
        {(role === 'union_admin' || role === 'school_admin') && p.status === 'draft' && (
          <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setDialog('delete')}>Delete draft</Button>
        )}
      </div>

      <ConfirmDialog open={dialog === 'verify'} title="Verify this record?" loading={busy} confirmLabel="Verify"
        message={`${name} will get a registration number and become eligible for rosters and team sheets. Confirm the photo and ${ID_TYPE_LABELS[p.idType].toLowerCase()} match the details.`}
        onConfirm={() => void run(async () => { const no = await verifyPerson(kind, p.id); toast.success(`Registration number ${no}`); }, 'Verified.')}
        onCancel={() => setDialog(null)} />
      <ConfirmDialog open={dialog === 'reinstate'} title="Reinstate?" loading={busy} confirmLabel="Reinstate"
        message={`${name} will become verified again.`}
        onConfirm={() => void run(() => reinstatePerson(kind, p.id), 'Reinstated.')} onCancel={() => setDialog(null)} />
      <ConfirmDialog open={dialog === 'delete'} title="Delete this draft?" tone="danger" loading={busy} confirmLabel="Delete"
        message="The draft, its uploaded documents and its ID registration will be removed."
        onConfirm={() => void run(async () => { await deleteDraftPerson(kind, p); navigate(listPath); }, 'Draft deleted.')} onCancel={() => setDialog(null)} />
      <Modal open={dialog === 'reject' || dialog === 'suspend'} onClose={() => setDialog(null)}
        title={dialog === 'suspend' ? 'Suspend record' : 'Reject record'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>Cancel</Button>
            <Button variant="danger" loading={busy} disabled={reason.trim().length < 3}
              onClick={() => void run(() => (dialog === 'suspend' ? suspendPerson(kind, p.id, reason) : rejectPerson(kind, p.id, reason)),
                dialog === 'suspend' ? 'Suspended.' : 'Rejected.')}>
              {dialog === 'suspend' ? 'Suspend' : 'Reject'}
            </Button>
          </>
        }>
        <Textarea label="Reason (shown to the school)" required value={reason} onChange={(e) => setReason(e.target.value)}
          hint={dialog === 'suspend' ? 'Why is this record being suspended?' : 'Say what the school must fix, for example "Photo is blurred".'} />
      </Modal>
    </div>
  );
}
