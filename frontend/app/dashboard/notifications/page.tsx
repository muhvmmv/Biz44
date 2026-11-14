"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, Info, CheckCircle2, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocationVersion } from "@/hooks/useLocationRefetch";
import type { Alert } from "@/components/shell/Header";
import { cn } from "@/lib/utils";

const SEVERITY = {
  danger: { icon: AlertCircle, cls: "bg-danger-soft text-danger", label: "Urgent" },
  warning: { icon: AlertTriangle, cls: "bg-warning-soft text-warning", label: "Attention" },
  info: { icon: Info, cls: "bg-info-soft text-info", label: "For information" },
};

export default function NotificationsPage() {
  const { format } = useCurrency();
  const version = useLocationVersion();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Alert[] }>("/dashboard/alerts")
      .then((r) => { if (active) { setAlerts(r.data); setError(null); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load alerts"); });
    return () => { active = false; };
  }, [version]);

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Needs attention" description="Worked out from your live data each time you open it: overdue money, stock running low, and records that need checking." />
      {error ? (
        <Card><EmptyState tone="error" title="Couldn't check for alerts" description={error} /></Card>
      ) : !alerts ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : alerts.length === 0 ? (
        <Card>
          <EmptyState icon={<CheckCircle2 size={22} className="text-success" />} title="All clear" description="Nothing is overdue, stock levels are fine and the stock check found no problems." />
        </Card>
      ) : (
        <ul className="space-y-3">
          {alerts.map((a) => {
            const S = SEVERITY[a.severity];
            return (
              <li key={a.id}>
                <Link href={a.href} className="flex items-center gap-4 rounded-2xl border border-border-soft bg-surface p-4 shadow-card transition-shadow hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", S.cls)}>
                    <S.icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{a.title}</span>
                    <span className="block text-sm text-ink-soft">
                      {a.amount !== undefined ? `${format(a.amount)} ${a.detail}` : a.detail}
                    </span>
                  </span>
                  <span className="hidden text-xs font-medium text-ink-soft sm:block">{S.label}</span>
                  <ChevronRight size={18} className="shrink-0 text-ink-faint" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
