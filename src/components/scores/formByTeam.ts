import type { Match } from '../../lib/types';
import type { FormResult } from './FormChips';

/** Results per team id, oldest first, from final matches. */
export function formByTeam(matches: Match[]): Map<string, FormResult[]> {
  const out = new Map<string, FormResult[]>();
  const add = (id: string, r: FormResult) => out.set(id, [...(out.get(id) ?? []), r]);
  for (const m of [...matches].sort((a, b) => (a.date + a.kickoff).localeCompare(b.date + b.kickoff))) {
    if (m.status !== 'final') continue;
    const d = m.homeScore - m.awayScore;
    add(m.homeTeamId, d > 0 ? 'W' : d < 0 ? 'L' : 'D');
    add(m.awayTeamId, d > 0 ? 'L' : d < 0 ? 'W' : 'D');
  }
  return out;
}
