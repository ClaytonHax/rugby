import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { friendlyAuthError, useAuth } from '../../lib/auth';
import { Button, Input } from '../../components/ui';
import { AuthShell } from './AuthShell';

export default function LoginPage() {
  const { firebaseUser, loading, notice, signIn } = useAuth();
  const location = useLocation();
  const requested = (location.state as { from?: string } | null)?.from;
  const from = requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : '/app';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && firebaseUser) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Sign in" subtitle="Registrars, administrators, coaches, managers and scorers.">
      {notice && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-danger">{notice}</p>}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input label="Email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={error} />
        <Button type="submit" loading={busy}>Sign in</Button>
      </form>
      <div className="mt-4 flex flex-col gap-1 text-sm">
        <Link className="font-medium text-pitch hover:underline" to="/reset-password">Forgot your password?</Link>
        <span className="text-ink-soft">Invited to Tryline? <Link className="font-medium text-pitch hover:underline" to="/signup">Create your account</Link></span>
      </div>
    </AuthShell>
  );
}
