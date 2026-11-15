"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface Alert {
  id: string;
  severity: "danger" | "warning" | "info";
  title: string;
  detail: string;
  amount?: number;
  href: string;
  count: number;
}

// One shared request for everything that shows alerts (bell, sidebar badges).
let cache: { at: number; data: Alert[] } | null = null;
let inflight: Promise<Alert[]> | null = null;
const listeners = new Set<(a: Alert[]) => void>();

function load(force = false): Promise<Alert[]> {
  if (!force && cache && Date.now() - cache.at < 30_000) return Promise.resolve(cache.data);
  if (inflight) return inflight;
  inflight = apiFetch<{ success: boolean; data: Alert[] }>("/dashboard/alerts")
    .then((r) => {
      cache = { at: Date.now(), data: r.data };
      listeners.forEach((l) => l(r.data));
      return r.data;
    })
    .catch(() => cache?.data ?? [])
    .finally(() => { inflight = null; });
  return inflight;
}

/** Live alerts (refreshed on navigation, on location change and every 2 minutes). */
export function useAlerts(refreshKey?: unknown): Alert[] | null {
  const [alerts, setAlerts] = useState<Alert[] | null>(cache?.data ?? null);
  useEffect(() => {
    let active = true;
    const set = (a: Alert[]) => { if (active) setAlerts(a); };
    listeners.add(set);
    load().then(set);
    const onLocation = () => load(true);
    window.addEventListener("biz44:location-changed", onLocation);
    const t = setInterval(() => load(true), 120_000);
    return () => {
      active = false;
      listeners.delete(set);
      window.removeEventListener("biz44:location-changed", onLocation);
      clearInterval(t);
    };
  }, [refreshKey]);
  return alerts;
}

/** Badge counts for sidebar groups, from the alerts. */
export function navBadges(alerts: Alert[] | null): Record<string, number> {
  const count = (...ids: string[]) => (alerts ?? []).filter((a) => ids.includes(a.id)).reduce((s, a) => s + a.count, 0);
  return {
    Sales: count("invoices-overdue", "invoices-due-today"),
    Inventory: count("stock-out", "stock-low", "stock-check"),
    Purchasing: count("suppliers-overdue"),
    "Cash & Banks": count("cash-negative"),
  };
}
