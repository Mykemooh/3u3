/**
 * CSV for exports. Cells that start with = + - @ are prefixed with a
 * quote so a spreadsheet never runs them as formulas (CSV injection).
 */
export function csvCell(v: unknown): string {
  if (v == null) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export const dollars = (cents: number | null | undefined) => (cents == null ? '' : (cents / 100).toFixed(2));
