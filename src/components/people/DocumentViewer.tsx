import { useCallback, useEffect, useState } from 'react';
import { Eye, FileText, Loader2 } from 'lucide-react';
import { Button } from '../ui';
import { loadDocument, type LoadedDocument } from '../../lib/documents';

/** Reassembles a stored document and shows it from an object URL (never from a public URL). */
export function DocumentViewer({ documentId, label, autoLoad = false }: { documentId: string; label: string; autoLoad?: boolean }) {
  const [doc, setDoc] = useState<LoadedDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDoc(await loadDocument(documentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this document.');
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (autoLoad) void load();
  }, [autoLoad, load]);

  useEffect(() => {
    const url = doc?.url;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [doc]);

  if (!doc) {
    return (
      <div className="flex flex-col items-start gap-2">
        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
        {loading ? (
          <p className="inline-flex items-center gap-2 text-sm text-ink-soft"><Loader2 className="size-4 animate-spin" aria-hidden /> Opening {label}...</p>
        ) : (
          <Button size="sm" variant="secondary" icon={<Eye className="size-4" />} onClick={() => void load()}>
            {error ? 'Try again' : 'View'}
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {doc.contentType === 'application/pdf' ? (
        <>
          <iframe title={label} src={doc.url} className="h-96 w-full rounded-lg border border-line bg-white" />
          <a href={doc.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-pitch underline">
            <FileText className="size-4" aria-hidden /> Open PDF in a new tab
          </a>
        </>
      ) : (
        <img src={doc.url} alt={label} className="max-h-[28rem] w-full rounded-lg border border-line bg-white object-contain" />
      )}
      {!autoLoad && <Button size="sm" variant="ghost" onClick={() => setDoc(null)}>Hide</Button>}
    </div>
  );
}
