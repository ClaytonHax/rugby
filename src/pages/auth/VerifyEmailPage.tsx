import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { friendlyAuthError, useAuth } from '../../lib/auth';
import { Button } from '../../components/ui';
import { AuthShell } from './AuthShell';

export default function VerifyEmailPage() {
  const { firebaseUser, appUser, loading, refreshClaim, resendVerification, signOut } = useAuth();
  const navigate = useNavigate();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const ok = await refreshClaim();
      if (ok) navigate('/app', { replace: true });
      else if (!auth.currentUser?.emailVerified) setMsg('Not verified yet. Open the link in the email we sent, then try again.');
      else navigate('/no-access', { replace: true });
    } catch (err) {
      setMsg(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onFocus = () => { if (firebaseUser && !firebaseUser.emailVerified) void refreshClaim(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [firebaseUser, refreshClaim]);

  if (loading) return null;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (appUser) return <Navigate to="/app" replace />;
  if (firebaseUser.emailVerified) return <Navigate to="/no-access" replace />;

  return (
    <AuthShell title="Verify your email" subtitle={`We sent a link to ${firebaseUser.email}. Open it, then come back here.`}>
      {msg && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{msg}</p>}
      <div className="flex flex-col gap-3">
        <Button onClick={check} loading={busy}>I have verified my email</Button>
        <Button variant="secondary" onClick={async () => { try { await resendVerification(); setMsg('Verification email sent again.'); } catch (e) { setMsg(friendlyAuthError(e)); } }}>Resend email</Button>
        <Button variant="ghost" onClick={signOut}>Use a different account</Button>
      </div>
    </AuthShell>
  );
}
