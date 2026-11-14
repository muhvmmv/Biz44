"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocationVersion } from "@/hooks/useLocationRefetch";

interface PL {
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  totalOpex: number;
  netProfit: number;
  netMargin: number;
  expenseBreakdown: { account: string; amount: number }[];
}

export default function ProfitLossPage() {
  const { format } = useCurrency();
  const [data, setData] = useState<PL | null>(null);
  const [loading, setLoading] = useState(true);
  const version = useLocationVersion();

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: PL }>("/accounting/profit-loss")
      .then((res) => { if (active) setData(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);

  if (loading) return <div className="p-6"><Skeleton className="h-96" /></div>;
  if (!data) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Profit & Loss" description="Income statement for your business." />

      <Card>
        <CardHeader><CardTitle>Income Statement</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Row label="Revenue" value={format(data.revenue)} bold />
          <Row label="Cost of Goods Sold" value={`− ${format(data.cogs)}`} className="text-ink-soft" />
          <Divider />
          <Row
            label="Gross Profit"
            value={format(data.grossProfit)}
            bold
            className={data.grossProfit >= 0 ? "text-success" : "text-danger"}
            sublabel={`${data.grossMargin.toFixed(1)}% margin`}
          />
          <Divider />
          <Row label="Operating Expenses" value={`− ${format(data.totalOpex)}`} className="text-ink-soft" />
          <Divider />
          <Row
            label="Net Profit"
            value={format(data.netProfit)}
            bold
            className={data.netProfit >= 0 ? "text-success" : "text-danger"}
            sublabel={`${data.netMargin.toFixed(1)}% margin`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Expense Breakdown</CardTitle></CardHeader>
        <CardContent>
          {data.expenseBreakdown.length === 0 ? (
            <p className="text-ink-soft text-sm py-4 text-center">No operating expenses recorded.</p>
          ) : (
            <div className="space-y-3">
              {data.expenseBreakdown.map((e) => {
                const pct = data.totalOpex > 0 ? (e.amount / data.totalOpex) * 100 : 0;
                return (
                  <div key={e.account}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-ink">{e.account}</span>
                      <span className="text-ink">{format(e.amount)}</span>
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
    </div>
  );
}

function Row({ label, value, bold, sublabel, className = "" }: {
  label: string; value: string; bold?: boolean; sublabel?: string; className?: string;
}) {
  return (
    <div className={`flex justify-between items-baseline ${className}`}>
      <div>
        <span className={bold ? "font-semibold text-ink" : "text-ink"}>{label}</span>
        {sublabel && <span className="ml-2 text-xs text-ink-soft">{sublabel}</span>}
      </div>
      <span className={bold ? "font-bold text-lg" : ""}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border-soft" />;
}