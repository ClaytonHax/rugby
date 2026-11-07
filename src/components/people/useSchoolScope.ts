import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useSchools } from '../../lib/data';
import { isUnionRole } from '../../lib/people';

/** Which school's records to list. School-level users are fixed to their own; union users may pick or see all. */
export function useSchoolScope() {
  const { appUser } = useAuth();
  const schools = useSchools();
  const [pick, setPick] = useState('');
  const union = isUnionRole(appUser?.role);
  const schoolId = union ? (pick || null) : (appUser?.schoolId ?? null);
  return { appUser, union, schools, pick, setPick, schoolId, canQuery: union || !!schoolId };
}
