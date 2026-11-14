"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import PeriodPicker, { makePeriod, periodQuery, Period } from "@/components/accounting/PeriodPicker";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocationVersion } from "@/hooks/useLocationRefetch";

interface Line {
  accountId: string;
  account: string;
  code: string | null;
  amount: number;
}

interface PL {
  revenue: number;
  revenueBreakdown: Line[];
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  totalOpex: number;
  netProfit: number;
  netMargin: number;
  expenseBreakdown: Line[];
}

export default function ProfitLossPage() {
  const { format } = useCurrency();
  const version = useLocationVersion();
  const [period, setPeriod] = useState<Period>(() => makePeriod("this_year"));
  const [data, setData] = useState<PL | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: PL }>(`/accounting/profit-loss${periodQuery(period)}`)
      .then((res) => { if (active) { setData(res.data); setError(""); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load the report"); });
    return () => { active = false; };
  }, [period, version]);

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Profit & Loss"
        description="Revenue is counted when an invoice is finalized and removed if it is cancelled. Customer payments are not revenue."
      />
      <PeriodPicker value={period} onChange={setPeriod} />

      {error && <p className="text-sm text-danger">{error}</p>}
      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle>Income statement</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data.revenueBreakdown.length > 1 &&
                data.revenueBreakdown.map((l) => (
                  <Row key={l.accountId} label={l.account} value={format(l.amount)} className="text-ink-soft text-sm" />
                ))}
              <Row label="Revenue" value={format(data.revenue)} bold />
              <Row label="Cost of goods sold" value={`− ${format(data.cogs)}`} className="text-ink-soft" />
              <Divider />
              <Row
                label="Gross profit"
                value={format(data.grossProfit)}
                bold
                className={data.grossProfit >= 0 ? "text-success" : "text-danger"}
                sublabel={`${data.grossMargin.toFixed(1)}% margin`}
              />
              <Divider />
              <Row label="Operating expenses" value={`− ${format(data.totalOpex)}`} className="text-ink-soft" />
              <Divider />
              <Row
                label="Net profit"
                value={format(data.netProfit)}
                bold
                className={data.netProfit >= 0 ? "text-success" : "text-danger"}
                sublabel={`${data.netMargin.toFixed(1)}% margin`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Operating expenses</CardTitle></CardHeader>
            <CardContent>
              {data.expenseBreakdown.length === 0 ? (
                <p className="text-ink-soft text-sm py-4 text-center">No operating expenses in this period.</p>
              ) : (
                <div className="space-y-3">
                  {data.expenseBreakdown.map((e) => {
                    const pct = data.totalOpex > 0 ? Math.max(0, (e.amount / data.totalOpex) * 100) : 0;
                    return (
                      <div key={e.accountId}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-ink">{e.account}</span>
                          <span className="text-ink tabular-nums">{format(e.amount)}</span>
                        </div>
                        <div className="h-2 bg-ivory rounded-full overflow-hidden">
                          <div className="h-full bg-brand rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ label, value, bold, sublabel, className = "" }: {
  label: string; value: string; bold?: boolean; sublabel?: string; className?: string;
}) {
  return (
    <div className={`flex justify-between items-baseline gap-4 ${className}`}>
      <div>
        <span className={bold ? "font-semibold text-ink" : ""}>{label}</span>
        {sublabel && <span className="ml-2 text-xs text-ink-soft">{sublabel}</span>}
      </div>
      <span className={`tabular-nums ${bold ? "font-bold text-lg" : ""}`}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border-soft" />;
}
