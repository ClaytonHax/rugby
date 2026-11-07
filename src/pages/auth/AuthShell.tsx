import type { ReactNode } from 'react';
import { Logo } from '../../components/Brand';
import { useDocumentTitle } from '../../components/ui';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  useDocumentTitle(title);
  return (
    <div className="flex min-h-dvh flex-col items-center bg-pitch px-4 py-8">
      <Logo light />
      <main className="mt-6 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="text-3xl text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </main>
    </div>
  );
}
