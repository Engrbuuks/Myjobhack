"use client";
import { downloadCsv } from "@/lib/exportCsv";

export function ExportButton({ rows, columns, filename, label = "Export CSV" }: {
  rows: Record<string, any>[];
  columns?: { key: string; label: string }[];
  filename: string;
  label?: string;
}) {
  const disabled = !rows || rows.length === 0;
  return (
    <button
      className="btn-ghost !h-9 text-sm"
      disabled={disabled}
      onClick={() => downloadCsv(filename, rows, columns)}
      title={disabled ? "Nothing to export" : "Download as CSV"}>
      ⤓ {label}{rows?.length ? ` (${rows.length})` : ""}
    </button>
  );
}
