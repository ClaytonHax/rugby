import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import type { Role } from '../lib/types';
import { EmptyState, ErrorState, SkeletonList } from './ui';

/** Guard: signed in, has a profile, and (optionally) holds one of `roles`. */
export function RequireRole({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { firebaseUser, appUser, loading, profileError, refreshClaim } = useAuth();
  const location = useLocation();
  if (loading) return <div className="p-6"><SkeletonList /></div>;
  // Return here after signing in, including any query string such as ?id=...
  if (!firebaseUser) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  if (!appUser && profileError) {
    return (
      <div className="p-6">
        <ErrorState page title="Could not load your account" description="Your account details did not load, usually because of poor signal. Try again."
          onRetry={() => void refreshClaim().catch(() => undefined)} />
      </div>
    );
  }
  if (!appUser) return <Navigate to="/no-access" replace />;
  if (roles && !roles.includes(appUser.role)) {
    return <EmptyState page title="Not available for your role" description="Ask your school or union administrator if you need access to this page." />;
  }
  return <>{children}</>;
}
