import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { friendlyAuthError, useAuth } from '../../lib/auth';
import { Button, Input } from '../../components/ui';
import { AuthShell } from './AuthShell';

export default function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Reset password" subtitle="We will email you a link to choose a new password.">
      {sent ? (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-900">If an account exists for {email}, a reset link is on its way.</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input label="Email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
          <Button type="submit" loading={busy}>Send reset link</Button>
        </form>
      )}
      <p className="mt-4 text-sm"><Link className="font-medium text-pitch hover:underline" to="/login">Back to sign in</Link></p>
    </AuthShell>
  );
}
