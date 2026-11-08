import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { AGE_GROUPS } from '../lib/types';
import { Logo } from './Brand';
import { LinkButton } from './ui';
import { OfflineBanner } from './OfflineBanner';
import { useAgeFilter } from './scores/useAgeFilter';

const links = [
  { to: '/fixtures', label: 'Fixtures' },
  { to: '/results', label: 'Results' },
  { to: '/logs', label: 'Logs' },
  { to: '/schools', label: 'Schools' },
];
const AGE_PATHS = ['/', '/fixtures', '/results'];

export function PublicLayout() {
  const { appUser } = useAuth();
  const { pathname } = useLocation();
  const [age] = useAgeFilter();
  const showAges = AGE_PATHS.includes(pathname.replace(/(.)\/$/, '$1'));
  const tab = (on: boolean) => `flex min-h-11 shrink-0 items-center border-b-[3px] px-3 text-xs font-bold uppercase tracking-wider ${on ? 'border-gold' : 'border-transparent'}`;
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="skip-link">Skip to content</a>
      <OfflineBanner />
      <header>
        <div className="bg-night pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 px-4 sm:flex-nowrap">
            <div className="flex min-h-14 items-center"><Logo light /></div>
            <nav aria-label="Public" className="order-last flex w-full sm:order-none sm:ml-4 sm:w-auto sm:flex-1 sm:self-stretch">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to}
                  className={({ isActive }) => `flex min-h-11 min-w-0 flex-1 items-center justify-center border-b-[3px] px-1 text-sm font-bold uppercase tracking-wide sm:flex-none sm:px-4 ${isActive ? 'border-gold bg-night-2 text-white' : 'border-transparent text-white/80 hover:bg-night-2/60 hover:text-white'}`}>
                  {l.label}
                </NavLink>
              ))}
            </nav>
            <LinkButton to={appUser ? '/app' : '/login'} variant="gold" size="sm">{appUser ? 'Open app' : 'Sign in'}</LinkButton>
          </div>
        </div>
        {showAges && (
          <div className="border-b border-line bg-white">
            <nav aria-label="Age group" className="no-scrollbar mx-auto flex max-w-6xl overflow-x-auto px-2">
              <Link to={{ pathname }} replace aria-current={age ? undefined : 'true'} className={`${tab(!age)} ${age ? 'text-ink-soft hover:text-ink' : 'text-ink'}`}>All</Link>
              {AGE_GROUPS.map((a) => (
                <Link key={a} to={{ pathname, search: `?age=${encodeURIComponent(a)}` }} replace aria-current={age === a ? 'true' : undefined}
                  className={`${tab(age === a)} ${age === a ? 'text-ink' : 'text-ink-soft hover:text-ink'}`}>{a}</Link>
              ))}
            </nav>
          </div>
        )}
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 md:py-6"><Outlet /></main>
      <footer className="border-t border-line px-4 py-6 text-center text-xs text-ink-soft">
        Tryline is an independent registration and match tool for school rugby. It is not endorsed by any union or school.
      </footer>
    </div>
  );
}
