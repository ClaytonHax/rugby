import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Logo } from './Brand';
import { LinkButton } from './ui';

const links = [
  { to: '/fixtures', label: 'Fixtures' },
  { to: '/results', label: 'Results' },
  { to: '/logs', label: 'Logs' },
  { to: '/schools', label: 'Schools' },
];

export function PublicLayout() {
  const { appUser } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-pitch">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2">
          <Logo light />
          <nav aria-label="Public" className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to}
                className={({ isActive }) => `flex min-h-11 items-center rounded-lg px-3 text-sm font-medium ${isActive ? 'bg-white/15 text-white' : 'text-white/75 hover:text-white'}`}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <LinkButton to={appUser ? '/app' : '/login'} variant="gold" size="sm">{appUser ? 'Open app' : 'Sign in'}</LinkButton>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:py-10"><Outlet /></main>
      <footer className="border-t border-line px-4 py-6 text-center text-xs text-ink-soft">
        Tryline is an independent registration and match tool for school rugby. It is not endorsed by any union or school.
      </footer>
    </div>
  );
}
