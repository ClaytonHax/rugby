import { MatchListPage } from './MatchListPage';

export default function ResultsPage() {
  return <MatchListPage title="Results" subtitle="Final scores, newest first." statuses={['final']} order="desc"
    emptyTitle="No results yet" emptyText="Final scores appear here when matches finish." />;
}
