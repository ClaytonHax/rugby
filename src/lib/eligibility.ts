// The competition's eligibility rules. Pure functions, used by squads, team sheets and compliance.
import type { CompetitionSettings } from './types';

export const DEFAULT_SETTINGS: CompetitionSettings = { overAgeYears: 18, maxOverAge: 3 };

/** Completed years on a date. Both arguments are YYYY-MM-DD. */
export function ageOn(dob: string, on: string): number {
  const [by, bm, bd] = dob.split('-').map(Number);
  const [y, m, d] = on.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export function isOverAge(dob: string, on: string, s: CompetitionSettings = DEFAULT_SETTINGS): boolean {
  return ageOn(dob, on) > s.overAgeYears;
}

export function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/** Public display form of a name on the scoreboard: "T. Moyo". */
export function publicName(firstName: string, lastName: string): string {
  return `${firstName.trim().charAt(0).toUpperCase()}. ${lastName.trim()}`;
}
