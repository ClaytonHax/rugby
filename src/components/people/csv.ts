/** CSV helpers. Every cell is quoted, and cells that start like a formula are neutralised. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  // Formula injection: spreadsheets treat these leading characters as formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
