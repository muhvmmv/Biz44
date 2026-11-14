"use client";

import { useMemo } from "react";

export type PeriodKey = "this_month" | "last_month" | "this_quarter" | "this_year" | "last_year" | "all" | "custom";

export interface Period {
  key: PeriodKey;
  from: string; // YYYY-MM-DD or ""
  to: string;   // YYYY-MM-DD or ""
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Date range for a preset, in local time. */
export function periodRange(key: PeriodKey, now = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case "this_month":
      return { from: ymd(new Date(y, m, 1)), to: ymd(now) };
    case "last_month":
      return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case "this_quarter":
      return { from: ymd(new Date(y, Math.floor(m / 3) * 3, 1)), to: ymd(now) };
    case "this_year":
      return { from: ymd(new Date(y, 0, 1)), to: ymd(now) };
    case "last_year":
      return { from: ymd(new Date(y - 1, 0, 1)), to: ymd(new Date(y - 1, 11, 31)) };
    default:
      return { from: "", to: "" };
  }
}

export function makePeriod(key: PeriodKey): Period {
  return { key, ...periodRange(key) };
}

/** Query string for a period, e.g. "?from=2026-11-01&to=2026-11-14". */
export function periodQuery(p: Period, extra: Record<string, string> = {}) {
  const params = new URLSearchParams(extra);
  if (p.from) params.set("from", p.from);
  if (p.to) params.set("to", p.to);
  const q = params.toString();
  return q ? `?${q}` : "";
}

const LABELS: Record<PeriodKey, string> = {
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  this_year: "This year",
  last_year: "Last year",
  all: "All time",
  custom: "Custom",
};

const inputClass =
  "rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand";

/** Preset period selector with an optional custom date range. */
export default function PeriodPicker({
  value,
  onChange,
  options = ["this_month", "last_month", "this_quarter", "this_year", "last_year", "all", "custom"],
}: {
  value: Period;
  onChange: (p: Period) => void;
  options?: PeriodKey[];
}) {
  const label = useMemo(() => {
    if (!value.from && !value.to) return "All time";
    const f = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString();
    return `${value.from ? f(value.from) : "…"} – ${value.to ? f(value.to) : "today"}`;
  }, [value]);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <select
        value={value.key}
        onChange={(e) => {
          const key = e.target.value as PeriodKey;
          onChange(key === "custom" ? { ...value, key } : makePeriod(key));
        }}
        className={inputClass}
        aria-label="Period"
      >
        {options.map((k) => (
          <option key={k} value={k}>{LABELS[k]}</option>
        ))}
      </select>
      {value.key === "custom" ? (
        <div className="flex items-center gap-2">
          <input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} className={inputClass} aria-label="From" />
          <span className="text-ink-soft text-sm">to</span>
          <input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} className={inputClass} aria-label="To" />
        </div>
      ) : (
        <span className="text-sm text-ink-soft">{label}</span>
      )}
    </div>
  );
}
