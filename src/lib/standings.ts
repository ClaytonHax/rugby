import type { Match } from './types';

export interface StandingRow {
  teamId: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pf: number;
  pa: number;
  pd: number;
  points: number;
}

/** Log from final matches only: win 4, draw 2, loss 0, no bonus points. Sorted by points, then PD, then PF. */
export function computeStandings(matches: Match[]): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  const row = (id: string, name: string): StandingRow => {
    let r = rows.get(id);
    if (!r) {
      r = { teamId: id, name, played: 0, won: 0, drawn: 0, lost: 0, pf: 0, pa: 0, pd: 0, points: 0 };
      rows.set(id, r);
    }
    return r;
  };
  for (const m of matches) {
    if (m.status !== 'final') continue;
    const h = row(m.homeTeamId, m.homeName);
    const a = row(m.awayTeamId, m.awayName);
    h.played++; a.played++;
    h.pf += m.homeScore; h.pa += m.awayScore;
    a.pf += m.awayScore; a.pa += m.homeScore;
    if (m.homeScore > m.awayScore) { h.won++; a.lost++; h.points += 4; }
    else if (m.homeScore < m.awayScore) { a.won++; h.lost++; a.points += 4; }
    else { h.drawn++; a.drawn++; h.points += 2; a.points += 2; }
  }
  for (const r of rows.values()) r.pd = r.pf - r.pa;
  return [...rows.values()].sort((x, y) => y.points - x.points || y.pd - x.pd || y.pf - x.pf || x.name.localeCompare(y.name));
}
