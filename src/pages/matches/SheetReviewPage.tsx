import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, query, where } from 'firebase/firestore';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { db } from '../../lib/firebase';
import { friendlyError, savedText, useCollection, useSettings } from '../../lib/data';
import { approveSheet, rejectSheet, returnSheetToDraft } from '../../lib/sheets';
import { loadDocument } from '../../lib/documents';
import type { Match, TeamSheet } from '../../lib/types';
import { formatDate } from '../../components/MatchCard';
import { Button, Card, EmptyState, ErrorState, PageHeader, SkeletonList, Tabs, Textarea, useToast } from '../../components/ui';
import { SheetEntries, SheetStatusBadge } from './SheetView';

interface Item {
  match: Match;
  teamId: string;
  name: string;
  sheet: TeamSheet | null;
}

// Rules have no collection-group read on sheets, so we list scheduled/live matches
// and read each match's two sheet documents directly.
export default function SheetReviewPage() {
  const { settings } = useSettings();
  const toast = useToast();
  const matches = useCollection<Match>(() => query(collection(db, 'matches'), where('status', 'in', ['scheduled', 'live'])), []);
  const [sheets, setSheets] = useState<Record<string, TeamSheet | null>>({});
  const [loadingSheets, setLoadingSheets] = useState(true);
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState<'submitted' | 'all'>('submitted');
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const list = useMemo(
    () => [...matches.data].sort((a, b) => (a.date + a.kickoff).localeCompare(b.date + b.kickoff)).slice(0, 60),
    [matches.data],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingSheets(true);
    (async () => {
      const result: Record<string, TeamSheet | null> = {};
      await Promise.all(list.flatMap((m) => [m.homeTeamId, m.awayTeamId].map(async (tid) => {
        try {
          const s = await getDoc(doc(db, 'matches', m.id, 'sheets', tid));
          result[`${m.id}_${tid}`] = s.exists() ? (s.data() as TeamSheet) : null;
        } catch {
          result[`${m.id}_${tid}`] = null;
        }
      })));
      if (!cancelled) { setSheets(result); setLoadingSheets(false); }
    })();
    return () => { cancelled = true; };
  }, [list, reload]);

  const items: Item[] = useMemo(() => list.flatMap((m) => [
    { match: m, teamId: m.homeTeamId, name: m.homeName, sheet: sheets[`${m.id}_${m.homeTeamId}`] ?? null },
    { match: m, teamId: m.awayTeamId, name: m.awayName, sheet: sheets[`${m.id}_${m.awayTeamId}`] ?? null },
  ]).filter((i) => (filter === 'submitted' ? i.sheet?.status === 'submitted' : i.sheet !== null)), [list, sheets, filter]);

  const act = useCallback(async (key: string, fn: () => Promise<'saved' | 'queued'>, done: string) => {
    setBusy(key);
    setErrorKey(null);
    try {
      const outcome = await fn();
      toast.success(savedText(done, outcome));
      setReload((n) => n + 1);
    } catch (e) {
      setErrorKey(key);
      toast.error(friendlyError(e, 'Could not update the sheet.'));
    } finally {
      setBusy(null);
    }
  }, [toast]);

  async function openScan(docId: string) {
    try {
      const d = await loadDocument(docId);
      window.open(d.url, '_blank', 'noopener');
    } catch (e) {
      toast.error(friendlyError(e, 'Could not open the scan.'));
    }
  }

  return (
    <div>
      <PageHeader title="Team sheets" subtitle="Review sheets for scheduled and live matches."
        actions={<Button variant="secondary" size="sm" icon={<RefreshCw className="size-4" />} onClick={() => setReload((n) => n + 1)}>Refresh</Button>} />
      <Tabs idBase="sheets" label="Team sheets" value={filter} onChange={setFilter}
        tabs={[{ key: 'submitted', label: 'Awaiting review' }, { key: 'all', label: 'All sheets' }]} />
      <div role="tabpanel" id="sheets-panel" aria-labelledby={`sheets-${filter}`}>
      {matches.loading || loadingSheets ? <SkeletonList /> : matches.error ? <ErrorState title="Could not load matches" description={matches.error} onRetry={matches.retry} /> : items.length === 0 ? (
        <EmptyState title={filter === 'submitted' ? 'No sheets waiting' : 'No sheets yet'} description="Sheets appear here once schools build them for upcoming matches." />
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((i) => {
            const key = `${i.match.id}_${i.teamId}`;
            const s = i.sheet as TeamSheet;
            const overBad = s.overAgeCount > settings.maxOverAge;
            return (
              <Card key={key}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-2xl">{i.name}</h2>
                    <p className="text-sm text-ink-soft">{i.match.homeName} v {i.match.awayName} · {formatDate(i.match.date)} {i.match.kickoff}</p>
                  </div>
                  <SheetStatusBadge status={s.status} />
                </div>
                <p className={`mt-2 text-sm ${overBad ? 'font-semibold text-danger' : ''}`}>
                  {s.entries.length} players · over-age {s.overAgeCount}/{settings.maxOverAge}
                </p>
                {s.reviewNote && <p className="mt-1 text-sm text-ink-soft">Last note: {s.reviewNote}</p>}
                <div className="mt-3"><SheetEntries entries={s.entries} showOverAge /></div>
                {s.scanDocId && <Button className="mt-3" size="sm" variant="secondary" onClick={() => void openScan(s.scanDocId as string)}>Open scanned sheet</Button>}
                {s.status === 'submitted' && (
                  <div className="mt-4 flex flex-col gap-3">
                    <Textarea label={`Note for ${i.name} (required to reject)`} rows={2} value={note[key] ?? ''} onChange={(e) => setNote((n) => ({ ...n, [key]: e.target.value }))}
                      error={errorKey === key && !(note[key] ?? '').trim() ? 'Add a reason for rejecting.' : null} />
                    <div className="flex flex-wrap gap-2">
                      <Button icon={<CheckCircle2 className="size-4" />} loading={busy === key} onClick={() => act(key, () => approveSheet(s, note[key] ?? ''), 'Sheet approved.')}>Approve</Button>
                      <Button variant="danger" icon={<XCircle className="size-4" />} disabled={busy === key}
                        onClick={() => {
                          if (!(note[key] ?? '').trim()) { setErrorKey(key); return; }
                          void act(key, () => rejectSheet(s, note[key]), 'Sheet rejected.');
                        }}>Reject</Button>
                    </div>
                  </div>
                )}
                {(s.status === 'rejected' || s.status === 'approved') && (
                  <Button className="mt-4" variant="secondary" loading={busy === key}
                    onClick={() => act(key, () => returnSheetToDraft(s, note[key] ?? ''), 'Returned to draft so the school can edit it.')}>Return to draft</Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
