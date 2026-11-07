import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { friendlyAuthError, useAuth } from '../../lib/auth';
import { Button, Input } from '../../components/ui';
import { AuthShell } from './AuthShell';

export default function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEmailError(null);
    if (password.length < 8) { setError('Use a password of at least 8 characters.'); return; }
    setBusy(true);
    try {
      await signUp(email, password, name);
      navigate('/app', { replace: true });
    } catch (err) {
      const msg = friendlyAuthError(err);
      if (/email/i.test(msg)) setEmailError(msg);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Use the email address your administrator invited. Access is granted from that invitation.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input label="Full name" autoComplete="name" autoCapitalize="words" required value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} error={emailError} onChange={(e) => { setEmail(e.target.value); setEmailError(null); }} />
        <Input label="Password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters." error={error} />
        <Button type="submit" loading={busy}>Create account</Button>
      </form>
      <p className="mt-4 text-sm text-ink-soft">Already have an account? <Link className="font-medium text-pitch hover:underline" to="/login">Sign in</Link></p>
    </AuthShell>
  );
}
