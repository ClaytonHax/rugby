import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { friendlyAuthError, useAuth } from '../../lib/auth';
import { Button } from '../../components/ui';
import { AuthShell } from './AuthShell';

export default function NoAccessPage() {
  const { firebaseUser, appUser, loading, refreshClaim, signOut } = useAuth();
  const navigate = useNavigate();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (appUser) return <Navigate to="/app" replace />;

  const check = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (await refreshClaim()) navigate('/app', { replace: true });
      else setMsg('Still no invitation found for this email.');
    } catch (err) {
      setMsg(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="No access yet" subtitle={`No administrator has invited ${firebaseUser.email}. Ask your school or union administrator to invite you, then check again.`}>
      {msg && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{msg}</p>}
      <div className="flex flex-col gap-3">
        <Button onClick={check} loading={busy}>Check again</Button>
        <Button variant="ghost" onClick={signOut}>Sign out</Button>
      </div>
    </AuthShell>
  );
}
