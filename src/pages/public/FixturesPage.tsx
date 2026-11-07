import { MatchListPage } from './MatchListPage';

export default function FixturesPage() {
  return <MatchListPage title="Fixtures" subtitle="Upcoming and live matches." statuses={['scheduled', 'live']} order="asc"
    emptyTitle="No fixtures to show" emptyText="Nothing is scheduled for this selection." />;
}
