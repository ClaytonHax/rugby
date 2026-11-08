import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DEFAULT_SETTINGS } from '../lib/eligibility';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2, CalendarDays, ClipboardCheck, FileSearch, History, LayoutDashboard, LogOut, MoreHorizontal, Settings,
  ShieldCheck, UserCog, UserRound, Users, Shirt, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ROLE_LABELS, type Role } from '../lib/types';
import { Logo } from './Brand';
import { Modal } from './ui';
import { OfflineBanner } from './OfflineBanner';
import { InstallApp } from './PwaPrompts';

type NavGroup = 'Overview' | 'Registration' | 'Competition' | 'Union admin';
interface NavItem { to: string; label: string; icon: LucideIcon; roles?: Role[]; end?: boolean; group: NavGroup }
const GROUPS: NavGroup[] = ['Overview', 'Registration', 'Competition', 'Union admin'];

const ALL_REGISTRATION: Role[] = ['union_admin', 'registrar', 'school_admin', 'coach', 'manager'];
const UNION: Role[] = ['union_admin', 'registrar'];

export const NAV_ITEMS: NavItem[] = [
  { to: '/app', label: 'Home', icon: LayoutDashboard, end: true, group: 'Overview' },
  { to: '/app/players', label: 'Players', icon: Users, roles: ALL_REGISTRATION, group: 'Registration' },
  { to: '/app/staff', label: 'Staff', icon: UserCog, roles: ALL_REGISTRATION, group: 'Registration' },
  { to: '/app/verification', label: 'Verification', icon: ShieldCheck, roles: UNION, group: 'Registration' },
  { to: '/app/teams', label: 'Teams', icon: Shirt, roles: ALL_REGISTRATION, group: 'Registration' },
  { to: '/app/matches', label: 'Matches', icon: CalendarDays, group: 'Competition' },
  { to: '/app/sheets', label: 'Team sheets', icon: ClipboardCheck, roles: UNION, group: 'Competition' },
  { to: '/app/compliance', label: 'Compliance', icon: FileSearch, roles: UNION, group: 'Competition' },
  { to: '/app/audit', label: 'Audit log', icon: History, roles: UNION, group: 'Union admin' },
  { to: '/app/users', label: 'Users', icon: UserRound, roles: ['union_admin', 'school_admin'], group: 'Union admin' },
  { to: '/app/schools', label: 'Schools', icon: Building2, roles: ['union_admin'], group: 'Union admin' },
  { to: '/app/settings', label: 'Settings', icon: Settings, roles: ['union_admin'], group: 'Union admin' },
];

export function AppLayout() {
  const { appUser, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  const isUnionAdmin = appUser?.role === 'union_admin';
  // The rules read settings/competition for every roster and team sheet write, and deny them when it is missing.
  // On a fresh database the union administrator's first visit creates it with the defaults.
  useEffect(() => {
    if (!isUnionAdmin) return;
    void (async () => {
      try {
        const ref = doc(db, 'settings', 'competition');
        if (!(await getDoc(ref)).exists()) await setDoc(ref, DEFAULT_SETTINGS);
      } catch { /* the Settings page lets the administrator retry */ }
    })();
  }, [isUnionAdmin]);
  if (!appUser) return null;
  const items = NAV_ITEMS.filter((n) => !n.roles || n.roles.includes(appUser.role));
  const tabs = items.length > 5 ? items.slice(0, 4) : items;
  const overflow = items.length > 5 ? items.slice(4) : [];

  const link = ({ isActive }: { isActive: boolean }) =>
    `relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium ${isActive ? 'bg-white/10 text-white before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-r before:bg-gold' : 'text-white/75 hover:bg-white/5 hover:text-white'}`;
  const moreLink = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-chalk ${isActive ? 'bg-pitch-50 text-pitch' : ''}`;
  const leave = async () => { setMore(false); await signOut(); navigate('/'); };
  const section = pathname === '/app/account' ? 'My account'
    : [...items].sort((x, y) => y.to.length - x.to.length).find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`))?.label ?? 'Home';
  const initials = appUser.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const inOverflow = overflow.some((n) => pathname === n.to || pathname.startsWith(`${n.to}/`)) || pathname === '/app/account';

  return (
    <div className="min-h-dvh md:flex">
      <a href="#main" className="skip-link">Skip to content</a>
      <aside className="hidden w-60 shrink-0 flex-col bg-night p-3 md:flex md:sticky md:top-0 md:h-dvh">
        <div className="mb-4 px-2"><Logo light to="/app" /></div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-4 overflow-y-auto">
          {GROUPS.map((g) => {
            const list = items.filter((n) => n.group === g);
            if (!list.length) return null;
            return (
              <div key={g} className="flex flex-col gap-0.5">
                <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-white/60">{g}</p>
                {list.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={link}><n.icon className="size-5" aria-hidden />{n.label}</NavLink>)}
              </div>
            );
          })}
        </nav>
        <div className="mt-3 border-t border-white/10 pt-3">
          <NavLink to="/app/account" className={link}>
            <span aria-hidden className="num flex size-8 shrink-0 items-center justify-center rounded-full bg-gold text-sm text-ink">{initials}</span>
            <span className="min-w-0"><span className="block truncate">{appUser.displayName}</span>
              <span className="block text-xs text-white/80">{ROLE_LABELS[appUser.role]}</span></span>
          </NavLink>
          <button type="button" onClick={leave} className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-white/75 hover:bg-white/5 hover:text-white">
            <LogOut className="size-5" aria-hidden />Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <OfflineBanner />
        <div className="sticky top-0 z-30 hidden min-h-14 items-center justify-between border-b border-line bg-white px-8 md:flex">
          <p className="font-display text-xl font-bold uppercase tracking-wide text-ink">{section}</p>
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{ROLE_LABELS[appUser.role]}</span>
        </div>
        <div className="flex items-center justify-between bg-night px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden">
          <Logo light to="/app" />
          <NavLink to="/app/account" className="flex min-h-11 items-center gap-2 text-sm text-white" aria-label={`Account: ${appUser.displayName}`}>
            <span className="max-w-32 truncate">{appUser.displayName}</span><UserRound className="size-5" aria-hidden />
          </NavLink>
        </div>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-5 pb-28 md:px-8 md:py-6 md:pb-10"><Outlet /></main>
      </div>

      <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-white shadow-[0_-2px_8px_rgba(6,42,32,0.08)] md:hidden">
        {tabs.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${isActive ? 'text-pitch' : 'text-ink-soft'}`}>
            {({ isActive }) => (
              <>
                <span className={`h-1 w-8 rounded-full ${isActive ? 'bg-gold' : 'bg-transparent'}`} aria-hidden />
                <n.icon className="size-5" aria-hidden />{n.label}
              </>
            )}
          </NavLink>
        ))}
        {overflow.length > 0 && (
          <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" aria-current={inOverflow ? 'page' : undefined}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${inOverflow ? 'text-pitch' : 'text-ink-soft'}`}>
            <span className={`h-1 w-8 rounded-full ${inOverflow ? 'bg-gold' : 'bg-transparent'}`} aria-hidden />
            <MoreHorizontal className="size-5" aria-hidden />More
          </button>
        )}
      </nav>

      <Modal open={more} onClose={() => setMore(false)} title="More">
        <div className="flex flex-col gap-1">
          {overflow.map((n) => (
            <NavLink key={n.to} to={n.to} onClick={() => setMore(false)} className={moreLink}>
              <n.icon className="size-5 text-pitch" aria-hidden />{n.label}
            </NavLink>
          ))}
          <NavLink to="/app/account" onClick={() => setMore(false)} className={moreLink}>
            <UserRound className="size-5 text-pitch" aria-hidden />My account
          </NavLink>
          <InstallApp className="px-3 py-1" />
          <button type="button" onClick={leave} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-chalk">
            <LogOut className="size-5 text-pitch" aria-hidden />Sign out
          </button>
        </div>
      </Modal>
    </div>
  );
}
