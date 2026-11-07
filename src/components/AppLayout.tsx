import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DEFAULT_SETTINGS } from '../lib/eligibility';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Building2, CalendarDays, ClipboardCheck, FileSearch, History, LayoutDashboard, LogOut, MoreHorizontal, Settings,
  ShieldCheck, UserCog, UserRound, Users, Shirt, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ROLE_LABELS, type Role } from '../lib/types';
import { Logo } from './Brand';
import { Modal } from './ui';

interface NavItem { to: string; label: string; icon: LucideIcon; roles?: Role[]; end?: boolean }

const ALL_REGISTRATION: Role[] = ['union_admin', 'registrar', 'school_admin', 'coach', 'manager'];
const UNION: Role[] = ['union_admin', 'registrar'];

export const NAV_ITEMS: NavItem[] = [
  { to: '/app', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/app/players', label: 'Players', icon: Users, roles: ALL_REGISTRATION },
  { to: '/app/staff', label: 'Staff', icon: UserCog, roles: ALL_REGISTRATION },
  { to: '/app/verification', label: 'Verification', icon: ShieldCheck, roles: UNION },
  { to: '/app/teams', label: 'Teams', icon: Shirt, roles: ALL_REGISTRATION },
  { to: '/app/matches', label: 'Matches', icon: CalendarDays },
  { to: '/app/sheets', label: 'Team sheets', icon: ClipboardCheck, roles: UNION },
  { to: '/app/compliance', label: 'Compliance', icon: FileSearch, roles: UNION },
  { to: '/app/audit', label: 'Audit log', icon: History, roles: UNION },
  { to: '/app/users', label: 'Users', icon: UserRound, roles: ['union_admin', 'school_admin'] },
  { to: '/app/schools', label: 'Schools', icon: Building2, roles: ['union_admin'] },
  { to: '/app/settings', label: 'Settings', icon: Settings, roles: ['union_admin'] },
];

export function AppLayout() {
  const { appUser, signOut } = useAuth();
  const navigate = useNavigate();
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
    `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${isActive ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'}`;
  const leave = async () => { await signOut(); navigate('/'); };

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden w-60 shrink-0 flex-col bg-pitch p-4 md:flex md:sticky md:top-0 md:h-dvh">
        <div className="mb-6 px-1"><Logo light to="/app" /></div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={link}><n.icon className="size-5" aria-hidden />{n.label}</NavLink>
          ))}
        </nav>
        <div className="mt-4 border-t border-white/15 pt-3">
          <NavLink to="/app/account" className={link}>
            <UserRound className="size-5" aria-hidden />
            <span className="min-w-0"><span className="block truncate">{appUser.displayName}</span>
              <span className="block text-xs text-white/60">{ROLE_LABELS[appUser.role]}</span></span>
          </NavLink>
          <button onClick={leave} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white">
            <LogOut className="size-5" aria-hidden />Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between bg-pitch px-4 py-2 md:hidden">
          <Logo light to="/app" />
          <NavLink to="/app/account" className="flex min-h-11 items-center gap-2 text-sm text-white" aria-label="Account">
            <span className="max-w-32 truncate">{appUser.displayName}</span><UserRound className="size-5" aria-hidden />
          </NavLink>
        </div>
        <main className="mx-auto w-full max-w-6xl px-4 py-5 pb-28 md:px-8 md:py-8 md:pb-10"><Outlet /></main>
      </div>

      <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-white md:hidden">
        {tabs.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive ? 'text-pitch' : 'text-ink-soft'}`}>
            <n.icon className="size-5" aria-hidden />{n.label}
          </NavLink>
        ))}
        {overflow.length > 0 && (
          <button onClick={() => setMore(true)} className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-ink-soft">
            <MoreHorizontal className="size-5" aria-hidden />More
          </button>
        )}
      </nav>

      <Modal open={more} onClose={() => setMore(false)} title="More">
        <div className="flex flex-col gap-1">
          {overflow.map((n) => (
            <NavLink key={n.to} to={n.to} onClick={() => setMore(false)} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-chalk">
              <n.icon className="size-5 text-pitch" aria-hidden />{n.label}
            </NavLink>
          ))}
          <NavLink to="/app/account" onClick={() => setMore(false)} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-chalk">
            <UserRound className="size-5 text-pitch" aria-hidden />My account
          </NavLink>
          <button onClick={leave} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-chalk">
            <LogOut className="size-5 text-pitch" aria-hidden />Sign out
          </button>
        </div>
      </Modal>
    </div>
  );
}
