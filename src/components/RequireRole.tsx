import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import type { Role } from '../lib/types';
import { EmptyState, SkeletonList } from './ui';

/** Guard: signed in, has a profile, and (optionally) holds one of `roles`. */
export function RequireRole({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { firebaseUser, appUser, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="p-6"><SkeletonList /></div>;
  if (!firebaseUser) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!appUser) return <Navigate to="/no-access" replace />;
  if (roles && !roles.includes(appUser.role)) {
    return <EmptyState title="Not available for your role" description="Ask your school or union administrator if you need access to this page." />;
  }
  return <>{children}</>;
}
