import { useEffect, useRef, useState, type FormEvent } from 'react';
import { doc } from 'firebase/firestore';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Lock, Save, Send } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, Select, SkeletonList, useFocusFirstInvalid, useToast } from '../ui';
import { db } from '../../lib/firebase';
import { friendlyError, useDoc } from '../../lib/data';
import { useOwnerDocuments } from '../../lib/documents';
import { todayISO } from '../../lib/eligibility';
import {
  canChangeIdNumber, collectionName, createPerson, DuplicateIdError, ID_TYPE_LABELS, ID_TYPES, idDocType,
  missingForSubmission, submitForVerification, updatePerson, validateDob,
  type AnyPerson, type PersonKind, type PersonPatch, type PlayerInput, type StaffInput,
} from '../../lib/people';
import { POSITIONS, STAFF_ROLE_LABELS, type IdType, type Player, type Staff, type StaffRole } from '../../lib/types';
import { DocumentUploader } from './DocumentUploader';
import { Stepper } from './Stepper';
import { useSchoolScope } from './useSchoolScope';

interface FormState {
  schoolId: string;
  firstName: string; lastName: string; dob: string; idType: IdType; idNumber: string;
  position: string; secondaryPosition: string;
  guardianName: string; guardianPhone: string; guardianEmail: string; consent: boolean;
  staffRole: StaffRole | ''; phone: string; email: string; qualification: string;
}
const EMPTY: FormState = {
  schoolId: '', firstName: '', lastName: '', dob: '', idType: 'birth_certificate', idNumber: '',
  position: '', secondaryPosition: '', guardianName: '', guardianPhone: '', guardianEmail: '', consent: false,
  staffRole: '', phone: '', email: '', qualification: '',
};
type Errors = Partial<Record<keyof FormState, string>>;
type StepKey = 'details' | 'guardian' | 'documents' | 'submit';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digits = (s: string) => s.replace(/\D/g, '').length;

function fromRecord(p: AnyPerson, kind: PersonKind): FormState {
  const base = { ...EMPTY, schoolId: p.schoolId, firstName: p.firstName, lastName: p.lastName, dob: p.dob, idType: p.idType, idNumber: p.idNumber };
  if (kind === 'player') {
    const pl = p as Player;
    return { ...base, position: pl.position, secondaryPosition: pl.secondaryPosition ?? '', guardianName: pl.guardianName,
      guardianPhone: pl.guardianPhone, guardianEmail: pl.guardianEmail ?? '', consent: pl.consentGiven };
  }
  const st = p as Staff;
  return { ...base, staffRole: st.staffRole, phone: st.phone, email: st.email ?? '', qualification: st.qualification ?? '' };
}

function validateDetails(f: FormState, kind: PersonKind, needSchool: boolean): Errors {
  const e: Errors = {};
  if (needSchool && !f.schoolId) e.schoolId = 'Choose the school.';
  if (!f.firstName.trim()) e.firstName = 'Enter the first name.';
  if (!f.lastName.trim()) e.lastName = 'Enter the last name.';
  const dobErr = validateDob(f.dob, kind, todayISO());
  if (dobErr) e.dob = dobErr;
  if (f.idNumber.replace(/[\s-]/g, '').length < 4) e.idNumber = 'Enter the ID number exactly as printed on the document.';
  if (kind === 'player' && !f.position) e.position = 'Choose the usual position.';
  if (kind === 'staff') {
    if (!f.staffRole) e.staffRole = 'Choose a role.';
    if (digits(f.phone) < 7) e.phone = 'Enter a phone number.';
    if (f.email.trim() && !EMAIL.test(f.email.trim())) e.email = 'That email address does not look right.';
  }
  return e;
}
function validateGuardian(f: FormState): Errors {
  const e: Errors = {};
  if (!f.guardianName.trim()) e.guardianName = 'Enter the parent or guardian name.';
  if (digits(f.guardianPhone) < 7) e.guardianPhone = 'Enter a phone number we can reach.';
  if (f.guardianEmail.trim() && !EMAIL.test(f.guardianEmail.trim())) e.guardianEmail = 'That email address does not look right.';
  if (!f.consent) e.consent = 'Consent from the parent or guardian is required before submitting.';
  return e;
}

/** Stepper used for both players and staff. A draft is saved after the first step so documents have an owner. */
export function RegistrationForm({ kind }: { kind: PersonKind }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { appUser, union, schools } = useSchoolScope();
  const recordId = params.get('id');
  const existing = useDoc<AnyPerson>(() => (recordId ? doc(db, collectionName(kind), recordId) : null), [recordId, kind]);
  const rec = existing.data;

  const steps: StepKey[] = kind === 'player' ? ['details', 'guardian', 'documents', 'submit'] : ['details', 'documents', 'submit'];
  const labels: Record<StepKey, string> = { details: 'Details', guardian: 'Guardian', documents: 'Documents', submit: 'Submit' };
  const [step, setStep] = useState(() => {
    const want = steps.indexOf((params.get('step') ?? '') as StepKey);
    return want >= 0 ? want : 0;
  });
  const [maxReached, setMaxReached] = useState(() => (recordId ? steps.length - 1 : 0));
  const [f, setF] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hydrated = useRef(false);
  const [invalidTick, setInvalidTick] = useState(0);
  useFocusFirstInvalid(invalidTick);

  const mySchool = appUser?.schoolId ?? '';
  useEffect(() => {
    if (!rec || hydrated.current) return;
    hydrated.current = true;
    setF(fromRecord(rec, kind));
  }, [rec, kind]);
  useEffect(() => {
    if (!recordId && !union && mySchool) setF((s) => (s.schoolId ? s : { ...s, schoolId: mySchool }));
  }, [recordId, union, mySchool]);

  const schoolId = rec?.schoolId ?? f.schoolId;
  const owner = recordId && schoolId ? { ownerType: kind, ownerId: recordId, schoolId } : null;
  const docs = useOwnerDocuments(owner);

  if (!appUser) return <SkeletonList rows={3} />;
  if (recordId && existing.loading) return <SkeletonList rows={4} />;
  if (recordId && existing.error) return <ErrorState page title="Could not open this record" description={existing.error} onRetry={existing.retry} />;
  if (recordId && !rec) {
    return <EmptyState page title="Record not found" description="It may have been deleted, or it belongs to another school." />;
  }
  const listPath = kind === 'player' ? '/app/players' : '/app/staff';
  if (rec && rec.status === 'suspended' && !union) {
    return <EmptyState page title="This record is suspended" description="Contact the registrar to be reinstated before making changes." />;
  }

  const verifiedLocked = !!rec && rec.status === 'verified' && !union;
  const idLocked = !!rec && (verifiedLocked || !canChangeIdNumber(appUser.role));
  const docsLocked = !!rec && rec.status === 'verified' && !union;
  const key = steps[step];
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function go(i: number) {
    setErrors({});
    setFormError(null);
    setStep(i);
    setMaxReached((m) => Math.max(m, i));
    window.scrollTo({ top: 0 });
  }

  async function saveStep(): Promise<boolean> {
    setFormError(null);
    if (key === 'details') {
      const e = validateDetails(f, kind, !rec && union);
      if (Object.keys(e).length) { setErrors(e); setInvalidTick((n) => n + 1); return false; }
      const school = schools.byId[rec?.schoolId ?? f.schoolId];
      const identity = {
        firstName: f.firstName.trim(), lastName: f.lastName.trim(), dob: f.dob, idType: f.idType, idNumber: f.idNumber.trim(),
      };
      try {
        if (!rec) {
          if (!school) { setFormError('Your school could not be loaded. Check your signal and try again.'); return false; }
          const core = { schoolId: school.id, schoolName: school.name, ...identity };
          const input: PlayerInput | StaffInput = kind === 'player'
            ? { ...core, position: f.position, secondaryPosition: f.secondaryPosition, guardianName: '', guardianPhone: '', consentGiven: false }
            : { ...core, staffRole: f.staffRole as StaffRole, phone: f.phone.trim(), email: f.email, qualification: f.qualification };
          const id = await createPerson(kind, input);
          hydrated.current = true; // the form already holds this data; do not overwrite it when the new record arrives
          setParams({ id }, { replace: true });
          toast.success('Draft saved.');
        } else {
          const patch: PersonPatch = kind === 'player'
            ? { position: f.position, secondaryPosition: f.secondaryPosition }
            : { staffRole: f.staffRole as StaffRole, phone: f.phone.trim(), email: f.email, qualification: f.qualification };
          if (!verifiedLocked) Object.assign(patch, identity);
          if (idLocked) { delete patch.idType; delete patch.idNumber; }
          await updatePerson(kind, rec, patch);
        }
        return true;
      } catch (err) {
        if (err instanceof DuplicateIdError) setErrors({ idNumber: err.message });
        else setFormError(friendlyError(err, 'Could not save. Try again.'));
        return false;
      }
    }
    if (key === 'guardian') {
      const e = validateGuardian(f);
      if (Object.keys(e).length) { setErrors(e); setInvalidTick((n) => n + 1); return false; }
      if (!rec) { setFormError('Still saving the draft. Wait a moment and try again.'); return false; }
      try {
        await updatePerson(kind, rec, {
          guardianName: f.guardianName.trim(), guardianPhone: f.guardianPhone.trim(), guardianEmail: f.guardianEmail, consentGiven: f.consent,
        });
        return true;
      } catch (err) {
        setFormError(friendlyError(err, 'Could not save. Try again.'));
        return false;
      }
    }
    return true;
  }

  async function next(e?: FormEvent) {
    e?.preventDefault();
    if (busy || key === 'submit') return;
    setBusy(true);
    try {
      if (await saveStep()) go(step + 1);
    } finally {
      setBusy(false);
    }
  }
  async function saveAndExit() {
    setBusy(true);
    try {
      if (key === 'guardian') {
        // Partial guardian details are fine in a draft; consent is only enforced on submit.
        if (rec) await updatePerson(kind, rec, { guardianName: f.guardianName.trim(), guardianPhone: f.guardianPhone.trim(), guardianEmail: f.guardianEmail, consentGiven: f.consent });
        toast.success('Draft saved.');
        navigate(recordId ? `${listPath}/${recordId}` : listPath);
      } else if (key === 'details') {
        if (await saveStep()) { toast.success('Draft saved.'); navigate(`${listPath}`); }
      } else {
        navigate(recordId ? `${listPath}/${recordId}` : listPath);
      }
    } catch (err) {
      setFormError(friendlyError(err, 'Could not save. Try again.'));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!recordId) return;
    setBusy(true);
    try {
      await submitForVerification(kind, recordId);
      toast.success('Submitted. A registrar will check it.');
      navigate(`${listPath}/${recordId}`);
    } catch (err) {
      setFormError(friendlyError(err, 'Could not submit. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  const missing = rec ? missingForSubmission(kind, rec) : ['Everything'];
  const noun = kind === 'player' ? 'player' : 'staff member';

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={rec ? `Edit ${noun}` : `Register a ${noun}`} backTo={recordId ? `${listPath}/${recordId}` : listPath} backLabel={recordId ? 'Back to the record' : kind === 'player' ? 'Back to players' : 'Back to staff'}
        documentTitle={rec ? `Edit ${noun}` : `Register a ${noun}`}
        subtitle={rec ? `${rec.firstName} ${rec.lastName}` : undefined} />
      <Stepper steps={steps.map((s) => labels[s])} current={step} maxReached={maxReached} onSelect={(i) => { if (i <= step || rec) go(i); }} />

      {verifiedLocked && (
        <div className="mb-4 flex gap-3 rounded-xl border border-line bg-white p-4 text-sm">
          <Lock className="mt-0.5 size-5 shrink-0 text-pitch" aria-hidden />
          <p>This record is verified, so name, date of birth and ID are locked. Ask a registrar if they need correcting.</p>
        </div>
      )}
      {rec?.status === 'rejected' && rec.rejectionReason && (
        <p role="alert" className="mb-4 rounded-xl border border-danger/40 bg-red-50 p-4 text-sm text-red-900">
          Rejected: {rec.rejectionReason}
        </p>
      )}

      <Card>
       <form onSubmit={(e) => void next(e)} noValidate>
        <h2 className="sr-only">Step {step + 1} of {steps.length}: {labels[key]}</h2>
        {key === 'details' && (
          <div className="grid gap-4 sm:grid-cols-2">
            {union && !rec && (
              <Select wrapperClassName="sm:col-span-2" label="School" required value={f.schoolId} error={errors.schoolId}
                onChange={(e) => set('schoolId', e.target.value)} placeholder="Choose a school"
                options={schools.data.map((s) => ({ value: s.id, label: s.name }))} />
            )}
            <Input label="First name" required autoComplete="off" autoCapitalize="words" value={f.firstName} error={errors.firstName} disabled={verifiedLocked} onChange={(e) => set('firstName', e.target.value)} />
            <Input label="Last name" required autoComplete="off" autoCapitalize="words" value={f.lastName} error={errors.lastName} disabled={verifiedLocked} onChange={(e) => set('lastName', e.target.value)} />
            <Input label="Date of birth" type="date" required max={todayISO()} value={f.dob} error={errors.dob} disabled={verifiedLocked} onChange={(e) => set('dob', e.target.value)} />
            <Select label="ID document type" required value={f.idType} disabled={idLocked}
              onChange={(e) => set('idType', e.target.value as IdType)}
              options={ID_TYPES.map((t) => ({ value: t, label: ID_TYPE_LABELS[t] }))} />
            <Input wrapperClassName="sm:col-span-2" label="ID number" required autoComplete="off" autoCapitalize="characters" value={f.idNumber}
              error={errors.idNumber} disabled={idLocked} onChange={(e) => set('idNumber', e.target.value)}
              hint={idLocked && !verifiedLocked ? 'To correct the ID number, ask your school administrator or a registrar.' : 'Used once to stop double registration. It is not shown publicly.'} />
            {kind === 'player' ? (
              <>
                <Select label="Usual position" required value={f.position} error={errors.position} placeholder="Choose a position"
                  onChange={(e) => set('position', e.target.value)} options={POSITIONS.map((p) => ({ value: p, label: p }))} />
                <Select label="Second position" value={f.secondaryPosition} placeholder="None"
                  onChange={(e) => set('secondaryPosition', e.target.value)} options={POSITIONS.map((p) => ({ value: p, label: p }))} />
              </>
            ) : (
              <>
                <Select label="Role" required value={f.staffRole} error={errors.staffRole} placeholder="Choose a role"
                  onChange={(e) => set('staffRole', e.target.value as StaffRole)}
                  options={(Object.keys(STAFF_ROLE_LABELS) as StaffRole[]).map((r) => ({ value: r, label: STAFF_ROLE_LABELS[r] }))} />
                <Input label="Phone" type="tel" inputMode="tel" autoComplete="tel" required value={f.phone} error={errors.phone} onChange={(e) => set('phone', e.target.value)} />
                <Input label="Email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={f.email} error={errors.email} onChange={(e) => set('email', e.target.value)} />
                <Input label="Qualification" value={f.qualification} hint="For example World Rugby coaching level or first-aid certificate." onChange={(e) => set('qualification', e.target.value)} />
              </>
            )}
          </div>
        )}

        {key === 'guardian' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Parent or guardian name" required autoComplete="off" autoCapitalize="words" value={f.guardianName} error={errors.guardianName} onChange={(e) => set('guardianName', e.target.value)} />
            <Input label="Guardian phone" type="tel" inputMode="tel" autoComplete="off" required value={f.guardianPhone} error={errors.guardianPhone} onChange={(e) => set('guardianPhone', e.target.value)} />
            <Input wrapperClassName="sm:col-span-2" label="Guardian email" type="email" autoComplete="off" autoCapitalize="none" spellCheck={false} value={f.guardianEmail} error={errors.guardianEmail} onChange={(e) => set('guardianEmail', e.target.value)} />
            <div className="sm:col-span-2">
              <label className="flex min-h-11 items-start gap-3 rounded-lg border border-line bg-chalk p-3">
                <input type="checkbox" className="mt-1 size-5 shrink-0 accent-pitch" checked={f.consent} onChange={(e) => set('consent', e.target.checked)}
                  aria-invalid={!!errors.consent} aria-describedby={errors.consent ? 'consent-error' : undefined} />
                <span className="text-sm text-ink">
                  The parent or guardian has agreed that this player's name, date of birth, photo and identity document are stored for school
                  rugby registration, are visible only to authorised school and union staff, and that only initial and surname appear publicly on match scoring.
                </span>
              </label>
              {errors.consent && <p id="consent-error" role="alert" className="mt-1 text-xs font-medium text-danger">{errors.consent}</p>}
            </div>
          </div>
        )}

        {key === 'documents' && (
          <div className="flex flex-col gap-3">
            {!owner ? <p className="text-sm text-ink-soft">Save the details first.</p> : (
              <>
                <DocumentUploader owner={owner} type="photo" label="Photo" hint="Face clearly visible, no hat or sunglasses. Use the camera or choose a picture."
                  existing={docs.byType.photo} disabled={docsLocked} disabledReason="Documents on a verified record can only be changed by a registrar." />
                <DocumentUploader owner={owner} type={idDocType({ idType: f.idType })} label={ID_TYPE_LABELS[f.idType]}
                  hint="Photograph the whole page, flat and well lit. A PDF scan also works." existing={docs.byType[idDocType({ idType: f.idType })]}
                  disabled={docsLocked} disabledReason="Documents on a verified record can only be changed by a registrar." />
                {kind === 'staff' && (
                  <DocumentUploader owner={owner} type="qualification" label="Qualification certificate" optional
                    existing={docs.byType.qualification} disabled={docsLocked} disabledReason="Documents on a verified record can only be changed by a registrar." />
                )}
                <p className="text-xs text-ink-soft">Pictures are shrunk on your phone before upload. Files stay private to authorised staff.</p>
              </>
            )}
          </div>
        )}

        {key === 'submit' && rec && (
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl">{rec.firstName} {rec.lastName}</h2>
            <p className="text-sm text-ink-soft">{rec.schoolName} - {ID_TYPE_LABELS[rec.idType]} {rec.idNumber}</p>
            {missing.length === 0 ? (
              <p className="rounded-lg bg-pitch-50 p-3 text-sm text-pitch">Everything required is in place. Submit this record for the registrar to verify.</p>
            ) : (
              <div role="alert" className="rounded-lg border border-gold bg-gold/15 p-3 text-sm">
                <p className="font-semibold">Still needed:</p>
                <ul className="ml-5 list-disc">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            )}
            {rec.status === 'verified' && <p className="text-sm text-ink-soft">This record is already verified. Changes you saved apply immediately.</p>}
          </div>
        )}

        {formError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-danger">{formError}</p>}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />} disabled={step === 0 || busy} onClick={() => go(step - 1)}>Back</Button>
          <div className="flex flex-wrap gap-2">
            {key !== 'submit' && (key === 'details' || key === 'guardian') && (
              <Button variant="secondary" icon={<Save className="size-4" />} disabled={busy} onClick={() => void saveAndExit()}>Save draft</Button>
            )}
            {key !== 'submit' ? (
              <Button type="submit" loading={busy}>Next <ArrowRight className="size-4" aria-hidden /></Button>
            ) : rec && (rec.status === 'draft' || rec.status === 'rejected') ? (
              <Button icon={<Send className="size-4" />} loading={busy} disabled={missing.length > 0} onClick={() => void submit()}>Submit for verification</Button>
            ) : (
              <Button onClick={() => navigate(`${listPath}/${recordId ?? ''}`)}>Done</Button>
            )}
          </div>
        </div>
       </form>
      </Card>
    </div>
  );
}
