import { Link } from 'react-router-dom';
import { ClipboardCheck, ShieldCheck, Trophy } from 'lucide-react';
import { useMatchesByStatus } from '../../lib/useMatches';
import { MatchCard } from '../../components/MatchCard';
import { useAuth } from '../../lib/auth';
import { EmptyState, ErrorState, LinkButton, SkeletonList } from '../../components/ui';

const features = [
  { icon: ShieldCheck, title: 'Registered once, checked once', text: 'Every player and coach is registered with a photo, an ID document and guardian consent, and verified by the union registrar. Duplicate IDs are caught automatically.' },
  { icon: ClipboardCheck, title: 'Team sheets that follow the rules', text: 'Only verified players make the sheet, and the over-age limit is enforced before a sheet can be submitted.' },
  { icon: Trophy, title: 'Live scores and honest logs', text: 'Scorers record tries and kicks from the touchline. Fixtures, results and league logs are public and update as matches finish.' },
];

export default function HomePage() {
  const upcoming = useMatchesByStatus(['scheduled', 'live'], 'asc');
  const results = useMatchesByStatus(['final'], 'desc');
  const { appUser } = useAuth();
  return (
    <div className="flex flex-col gap-12">
      <section className="rounded-2xl bg-pitch px-6 py-10 text-white md:px-12 md:py-16">
        <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-amber-300">Zimbabwean high school rugby</p>
        <h1 className="max-w-2xl text-5xl leading-none md:text-7xl">Register players. Settle team sheets. Score the day.</h1>
        <p className="mt-4 max-w-xl text-white/80">Tryline gives schools and the union one trusted record of who is eligible to play, built for a phone on the touchline.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton to={appUser ? '/app' : '/login'} variant="gold">{appUser ? 'Open the app' : 'Sign in'}</LinkButton>
          <LinkButton to="/fixtures" variant="secondary">See fixtures</LinkButton>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-xl border border-line bg-white p-5">
            <f.icon className="size-7 text-pitch" aria-hidden />
            <h2 className="mt-3 text-2xl">{f.title}</h2>
            <p className="mt-1 text-sm text-ink-soft">{f.text}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between"><h2 className="text-3xl">Upcoming fixtures</h2><Link className="text-sm font-medium text-pitch hover:underline" to="/fixtures">All fixtures</Link></div>
        {upcoming.loading ? <SkeletonList rows={2} /> : upcoming.error ? <ErrorState title="Could not load fixtures" description={upcoming.error} onRetry={upcoming.retry} /> : upcoming.data.length === 0
          ? <EmptyState title="No fixtures scheduled yet" description="Fixtures appear here once a school or the union schedules them." />
          : <div className="grid gap-3 md:grid-cols-2">{upcoming.data.slice(0, 4).map((m) => <MatchCard key={m.id} match={m} />)}</div>}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between"><h2 className="text-3xl">Latest results</h2><Link className="text-sm font-medium text-pitch hover:underline" to="/results">All results</Link></div>
        {results.loading ? <SkeletonList rows={2} /> : results.error ? <ErrorState title="Could not load results" description={results.error} onRetry={results.retry} /> : results.data.length === 0
          ? <EmptyState title="No results yet" description="Final scores appear here when matches finish." />
          : <div className="grid gap-3 md:grid-cols-2">{results.data.slice(0, 4).map((m) => <MatchCard key={m.id} match={m} />)}</div>}
      </section>
    </div>
  );
}
