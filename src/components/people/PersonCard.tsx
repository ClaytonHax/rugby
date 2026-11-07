import { ChevronRight } from 'lucide-react';
import { Badge, StatusBadge } from '../ui';
import { personName, type AnyPerson } from '../../lib/people';
import { STAFF_ROLE_LABELS, type Player, type Staff } from '../../lib/types';
import { ageOn, todayISO } from '../../lib/eligibility';

export function PersonCard({ person, kind, onClick, selected }: {
  person: AnyPerson; kind: 'player' | 'staff'; onClick?: () => void; selected?: boolean;
}) {
  const sub = kind === 'player'
    ? `${(person as Player).position || 'No position'} - age ${ageOn(person.dob, todayISO())}`
    : STAFF_ROLE_LABELS[(person as Staff).staffRole];
  return (
    <button type="button" onClick={onClick} aria-current={selected ? 'true' : undefined}
      className={`flex min-h-16 w-full items-center gap-3 rounded-xl border p-3 text-left ${selected ? 'border-pitch bg-pitch-50' : 'border-line bg-white'} hover:bg-chalk`}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">{personName(person)}</p>
        <p className="truncate text-sm text-ink-soft">{person.schoolName} - {sub}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <StatusBadge status={person.status} />
          <Badge tone="neutral">{kind === 'player' ? 'Player' : 'Staff'}</Badge>
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-ink-soft" aria-hidden />
    </button>
  );
}
