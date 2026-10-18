import { describe, expect, it } from "vitest";
import type { Bucket } from "@/features/analytics/compute";
import { escapeCell, exportFilename, toCsv } from "./csv";
import { dailyRows, weeklyRows } from "./reports";
import { MAX_EXPORT_DAYS, parseExportRange } from "./range";

describe("formula injection protection", () => {
  it.each(["=SUM(A1:A9)", "+1+1", "-2+3", "@cmd", "  =1+1", "\t=1", "\r=1", "=HYPERLINK(\"http://evil\",\"x\")"])("neutralises %j", (v) => {
    const out = escapeCell(v);
    expect(out.replace(/^"/, "").startsWith("'")).toBe(true);
  });
  it("leaves ordinary text and real numbers alone", () => {
    expect(escapeCell("Write report")).toBe("Write report");
    expect(escapeCell("a-b")).toBe("a-b");
    expect(escapeCell(-5)).toBe("-5");
    expect(escapeCell(0)).toBe("0");
    expect(escapeCell(true)).toBe("true");
  });
  it("treats a negative-looking STRING as text (could be a formula)", () => expect(escapeCell("-5")).toBe("'-5"));
  it("handles empty values", () => {
    expect(escapeCell(null)).toBe("");
    expect(escapeCell(undefined)).toBe("");
    expect(escapeCell(NaN)).toBe("");
  });
});

describe("toCsv", () => {
  it("quotes commas, quotes and newlines (RFC 4180) with CRLF and a BOM", () => {
    const csv = toCsv(["a", "b"], [["x,y", 'say "hi"'], ["line1\nline2", 3]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿a,b\r\n"x,y","say ""hi"""\r\n"line1\nline2",3\r\n');
  });
  it("an empty dataset still has a header row", () => expect(toCsv(["id", "title"], [], { bom: false })).toBe("id,title\r\n"));
  it("pads short rows and escapes header cells too", () => expect(toCsv(["=x", "b"], [["only"]], { bom: false })).toBe("'=x,b\r\nonly,\r\n"));
});

describe("filenames and ranges", () => {
  it("builds useful ASCII filenames", () => {
    expect(exportFilename("occurrences", "2026-10-01", "2026-10-31")).toBe("tracker-occurrences_2026-10-01_to_2026-10-31.csv");
    expect(exportFilename("daily", "2026-10-01", "2026-10-07", "Farhan Khan!")).toBe("tracker-daily_Farhan-Khan-_2026-10-01_to_2026-10-07.csv");
  });
  it("validates and defaults the range", () => {
    expect(parseExportRange(null, null, "2026-10-21")).toEqual({ from: "2026-09-22", to: "2026-10-21" });
    expect(parseExportRange("2026-10-01", "2026-10-31", "2026-10-21")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(parseExportRange("2026-10-31", "2026-10-01", "2026-10-21")).toEqual({ error: "The start date is after the end date." });
    expect(parseExportRange("nope", null, "2026-10-21")).toHaveProperty("error");
    expect(parseExportRange("2024-01-01", "2026-01-01", "2026-10-21")).toEqual({ error: `Choose a range of at most ${MAX_EXPORT_DAYS} days.` });
  });
});

const b = (key: string, o: Partial<Bucket> = {}): Bucket => ({ key, label: key, scheduled: 0, due: 0, done: 0, unfinished: 0, completedDuring: 0, onTime: 0, rate: null, estimatedSeconds: 0, actualSeconds: 0, carried: 0, ...o });

describe("report rows", () => {
  it("daily rows mirror buckets; empty days have a blank rate", () => {
    const rows = dailyRows([b("2026-10-19", { scheduled: 3, due: 3, done: 2, unfinished: 1, completedDuring: 2, onTime: 2, estimatedSeconds: 7200, actualSeconds: 5400, carried: 1 }), b("2026-10-20")]);
    expect(rows[0]).toEqual(["2026-10-19", 3, 3, 2, 1, 2, 2, 66.7, 120, 90, 1]);
    expect(rows[1]![7]).toBeNull();
  });
  it("weekly rows sum days and recompute the rate from sums (not an average of rates)", () => {
    const rows = weeklyRows([
      b("2026-10-19", { due: 1, done: 1 }), b("2026-10-20", { due: 9, done: 3 }), b("2026-10-25", { due: 0 }), b("2026-10-26", { due: 2, done: 2 }),
    ], 1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["2026-10-19", "2026-10-25", 0, 10, 4, 6, 0, 0, 40, 0, 0, 0]);
    expect(rows[1]![0]).toBe("2026-10-26");
    expect(rows[1]![8]).toBe(100);
  });
  it("respects a Sunday week start and empty input", () => {
    expect(weeklyRows([b("2026-10-25"), b("2026-10-26")], 0).map((r) => r[0])).toEqual(["2026-10-25"]);
    expect(weeklyRows([], 1)).toEqual([]);
  });
});
