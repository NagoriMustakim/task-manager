/**
 * CSV writing with protection against spreadsheet formula injection.
 * Task titles, notes, reasons and other cells are untrusted: a cell that starts with = + - @ (or a
 * tab/CR) can run as a formula in Excel/Sheets, so such TEXT is prefixed with an apostrophe.
 * Real numbers and booleans are written as-is.
 */
const FORMULA_START = /^[\s\u0000-\u001f]*[=+\-@]/;

export type Cell = string | number | boolean | null | undefined;

export function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  let s = value.normalize("NFC").replace(/\u0000/g, "");
  if (FORMULA_START.test(s) || s.startsWith("\t") || s.startsWith("\r")) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: Cell[][], opts: { bom?: boolean } = {}): string {
  const lines = [columns.map(escapeCell).join(","), ...rows.map((r) => columns.map((_, i) => escapeCell(r[i])).join(","))];
  return `${opts.bom === false ? "" : "﻿"}${lines.join("\r\n")}\r\n`;
}

export const EXPORT_KINDS = ["tasks", "occurrences", "history", "time", "daily", "weekly"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const KIND_LABEL: Record<ExportKind, string> = {
  tasks: "Tasks", occurrences: "Scheduled occurrences", history: "Task history", time: "Time entries", daily: "Daily report", weekly: "Weekly report",
};

/** e.g. tracker-occurrences_2026-10-01_to_2026-10-31.csv (ASCII only, safe in a header). */
export function exportFilename(kind: ExportKind, from: string, to: string, subjectLabel?: string): string {
  const who = subjectLabel ? `_${subjectLabel.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 24)}` : "";
  return `tracker-${kind}${who}_${from}_to_${to}.csv`;
}
