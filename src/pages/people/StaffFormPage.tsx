import { RegistrationForm } from '../../components/people/RegistrationForm';

/** /app/staff/new registers a staff member; /app/staff/new?id=<staffId> resumes or edits one. */
export default function StaffFormPage() {
  return <RegistrationForm kind="staff" />;
}
