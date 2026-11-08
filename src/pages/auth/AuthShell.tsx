import type { ReactNode } from 'react';
import { CalendarCheck, ShieldCheck, Trophy } from 'lucide-react';
import { Logo } from '../../components/Brand';
import { useDocumentTitle } from '../../components/ui';

const POINTS = [
  { icon: ShieldCheck, text: 'Player registration checked against age and eligibility rules' },
  { icon: CalendarCheck, text: 'Team sheets approved before kickoff' },
  { icon: Trophy, text: 'Live scores and logs for every age group' },
];

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  useDocumentTitle(title);
  return (
    <div className="min-h-dvh bg-night md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:bg-white">
      <aside className="hidden flex-col justify-between bg-night p-10 text-white md:flex">
        <Logo light />
        <div>
          <p className="font-display text-5xl font-bold uppercase leading-none tracking-wide">School rugby,<br />run properly.</p>
          <ul className="mt-8 flex max-w-sm flex-col gap-4">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-start gap-3 text-sm text-white/85">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-night-2 text-gold"><p.icon className="size-4" aria-hidden /></span>
                <span className="pt-1.5">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/60">Tryline is independent and not endorsed by any union or school.</p>
      </aside>
      <div className="flex min-h-dvh flex-col items-center px-4 pb-8 pt-[max(2rem,env(safe-area-inset-top))] md:justify-center md:bg-surface md:pt-8">
        <div className="md:hidden"><Logo light /></div>
        <main className="mt-6 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl md:mt-0 md:border-t-4 md:border-gold md:shadow-sm">
          <h1 className="text-3xl uppercase tracking-wide text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
