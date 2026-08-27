/**
 * Client-side CSV/export helpers. Used across admin/employer tables.
 * No dependency — builds a CSV and triggers a download in the browser.
 */

export function toCsv(rows: Record<string, any>[], columns?: { key: string; label: string }[]): string {
  if (!rows.length) return "";
  const cols = columns ?? Object.keys(rows[0]).map((k) => ({ key: k, label: k }));
  const esc = (v: any) => {
    const s = v == null ? "" : Array.isArray(v) ? v.join("; ") : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map((c) => esc(c.label)).join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c.key])).join(",")).join("\n");
  return `${header}\n${body}`;
}

export function downloadCsv(filename: string, rows: Record<string, any>[], columns?: { key: string; label: string }[]) {
  const csv = toCsv(rows, columns);
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
