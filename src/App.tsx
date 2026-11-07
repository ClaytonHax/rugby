import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { ToastProvider, SkeletonList } from './components/ui';
import { RequireRole } from './components/RequireRole';
import { AppLayout } from './components/AppLayout';
import { PublicLayout } from './components/PublicLayout';
import type { Role } from './lib/types';

const L = (f: () => Promise<{ default: ComponentType }>) => lazy(f);

const Dashboard = L(() => import('./pages/dashboard/Dashboard'));
const PlayersPage = L(() => import('./pages/people/PlayersPage'));
const PlayerFormPage = L(() => import('./pages/people/PlayerFormPage'));
const PlayerDetailPage = L(() => import('./pages/people/PlayerDetailPage'));
const StaffPage = L(() => import('./pages/people/StaffPage'));
const StaffFormPage = L(() => import('./pages/people/StaffFormPage'));
const StaffDetailPage = L(() => import('./pages/people/StaffDetailPage'));
const VerificationPage = L(() => import('./pages/people/VerificationPage'));
const TeamsPage = L(() => import('./pages/teams/TeamsPage'));
const TeamDetailPage = L(() => import('./pages/teams/TeamDetailPage'));
const MatchesPage = L(() => import('./pages/matches/MatchesPage'));
const MatchFormPage = L(() => import('./pages/matches/MatchFormPage'));
const MatchAdminPage = L(() => import('./pages/matches/MatchAdminPage'));
const TeamSheetPage = L(() => import('./pages/matches/TeamSheetPage'));
const ScorePage = L(() => import('./pages/matches/ScorePage'));
const SheetReviewPage = L(() => import('./pages/matches/SheetReviewPage'));
const CompliancePage = L(() => import('./pages/admin/CompliancePage'));
const AuditPage = L(() => import('./pages/admin/AuditPage'));
const UsersPage = L(() => import('./pages/admin/UsersPage'));
const SchoolsAdminPage = L(() => import('./pages/admin/SchoolsAdminPage'));
const SettingsPage = L(() => import('./pages/admin/SettingsPage'));
const AccountPage = L(() => import('./pages/auth/AccountPage'));
const LoginPage = L(() => import('./pages/auth/LoginPage'));
const SignupPage = L(() => import('./pages/auth/SignupPage'));
const ResetPasswordPage = L(() => import('./pages/auth/ResetPasswordPage'));
const NoAccessPage = L(() => import('./pages/auth/NoAccessPage'));
const HomePage = L(() => import('./pages/public/HomePage'));
const FixturesPage = L(() => import('./pages/public/FixturesPage'));
const ResultsPage = L(() => import('./pages/public/ResultsPage'));
const LogsPage = L(() => import('./pages/public/LogsPage'));
const SchoolsPublicPage = L(() => import('./pages/public/SchoolsPublicPage'));
const SchoolPublicPage = L(() => import('./pages/public/SchoolPublicPage'));
const MatchPublicPage = L(() => import('./pages/public/MatchPublicPage'));

const REG: Role[] = ['union_admin', 'registrar', 'school_admin', 'coach', 'manager'];
const UNION: Role[] = ['union_admin', 'registrar'];

function guard(roles: Role[], el: ReactNode) {
  return <RequireRole roles={roles}>{el}</RequireRole>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<div className="p-6"><SkeletonList /></div>}>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/fixtures" element={<FixturesPage />} />
                <Route path="/results" element={<ResultsPage />} />
                <Route path="/logs" element={<LogsPage />} />
                <Route path="/schools" element={<SchoolsPublicPage />} />
                <Route path="/schools/:id" element={<SchoolPublicPage />} />
                <Route path="/matches/:id" element={<MatchPublicPage />} />
              </Route>

              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/no-access" element={<NoAccessPage />} />

              <Route path="/app" element={<RequireRole><AppLayout /></RequireRole>}>
                <Route index element={<Dashboard />} />
                <Route path="players" element={guard(REG, <PlayersPage />)} />
                <Route path="players/new" element={guard(REG, <PlayerFormPage />)} />
                <Route path="players/:id" element={guard(REG, <PlayerDetailPage />)} />
                <Route path="staff" element={guard(REG, <StaffPage />)} />
                <Route path="staff/new" element={guard(REG, <StaffFormPage />)} />
                <Route path="staff/:id" element={guard(REG, <StaffDetailPage />)} />
                <Route path="verification" element={guard(UNION, <VerificationPage />)} />
                <Route path="teams" element={guard(REG, <TeamsPage />)} />
                <Route path="teams/:id" element={guard(REG, <TeamDetailPage />)} />
                <Route path="matches" element={<MatchesPage />} />
                <Route path="matches/new" element={guard(REG, <MatchFormPage />)} />
                <Route path="matches/:id" element={<MatchAdminPage />} />
                <Route path="matches/:id/sheet/:teamId" element={guard(REG, <TeamSheetPage />)} />
                <Route path="matches/:id/score" element={<ScorePage />} />
                <Route path="sheets" element={guard(UNION, <SheetReviewPage />)} />
                <Route path="compliance" element={guard(UNION, <CompliancePage />)} />
                <Route path="audit" element={guard(UNION, <AuditPage />)} />
                <Route path="users" element={guard(['union_admin', 'school_admin'], <UsersPage />)} />
                <Route path="schools" element={guard(['union_admin'], <SchoolsAdminPage />)} />
                <Route path="settings" element={guard(['union_admin'], <SettingsPage />)} />
                <Route path="account" element={<AccountPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
