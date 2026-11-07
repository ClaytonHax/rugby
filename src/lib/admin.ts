// Union administrator actions: removing access and deleting schools.
import { collection, deleteDoc, doc, getCountFromServer, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { confirmWrite, writeAudit } from './data';
import type { AppUser } from './types';

export interface SchoolUsage { teams: number; players: number; staff: number; users: number; matches: number }

/** How much still belongs to a school. Needs a connection: with no signal the check cannot run, so deleting is refused. */
export async function schoolUsage(schoolId: string): Promise<SchoolUsage> {
  const count = async (name: string, field: string, op: '==' | 'array-contains' = '==') =>
    (await getCountFromServer(query(collection(db, name), where(field, op, schoolId)))).data().count;
  const [teams, players, staff, users, matches] = await Promise.all([
    count('teams', 'schoolId'), count('players', 'schoolId'), count('staff', 'schoolId'), count('users', 'schoolId'),
    count('matches', 'schoolIds', 'array-contains'),
  ]);
  return { teams, players, staff, users, matches };
}

export const usageIsEmpty = (u: SchoolUsage) => u.teams + u.players + u.staff + u.users + u.matches === 0;

export async function deleteSchool(id: string, name: string): Promise<void> {
  const usage = await schoolUsage(id);
  if (!usageIsEmpty(usage)) throw new Error('This school still has records. Remove them first.');
  await confirmWrite(deleteDoc(doc(db, 'schools', id)));
  await writeAudit('school.deleted', 'school', id, name);
}

/** Deletes the user's profile. Their login stays registered, but without a profile they have no access until re-invited. */
export async function removeUserAccess(user: AppUser): Promise<void> {
  await confirmWrite(deleteDoc(doc(db, 'users', user.uid)));
  await writeAudit('user.removed', 'user', user.uid, user.email);
}
