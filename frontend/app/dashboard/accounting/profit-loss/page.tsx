"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

interface PL {
  revenue: number;
  totalExpenses: number;
  netProfit: number;
  margin: number;
  expenseBreakdown: { account: string; amount: number }[];
}

export default function ProfitLossPage() {
  const [data, setData] = useState<PL | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: PL }>("/accounting/profit-loss")
      .then((res) => { if (active) setData(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <div className="p-6"><Skeleton className="h-96" /></div>;
  if (!data) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Profit & Loss" description="Income statement for your business." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-5">
          <p className="text-sm text-neutral-500">Revenue</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600">${data.revenue.toFixed(2)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-neutral-500">Expenses</p>
          <p className="text-2xl font-bold mt-1 text-red-600">${data.totalExpenses.toFixed(2)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-neutral-500">Net Profit</p>
          <p className={`text-2xl font-bold mt-1 ${data.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            ${data.netProfit.toFixed(2)}
          </p>
          <p className="text-xs text-neutral-500 mt-1">{data.margin.toFixed(1)}% margin</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Expense Breakdown</CardTitle></CardHeader>
        <CardContent>
          {data.expenseBreakdown.length === 0 ? (
            <p className="text-neutral-500 text-sm py-4 text-center">No expenses recorded.</p>
          ) : (
            <div className="space-y-3">
              {data.expenseBreakdown.map((e) => {
                const pct = data.totalExpenses > 0 ? (e.amount / data.totalExpenses) * 100 : 0;
                return (
                  <div key={e.account}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{e.account}</span>
                      <span>${e.amount.toFixed(2)}</span>
                    </div>
                    <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
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