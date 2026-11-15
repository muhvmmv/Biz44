"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { reportError } from "@/components/ui/Feedback";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocationVersion } from "@/hooks/useLocationRefetch";

interface ARData {
  summary: { total: number; current: number; days30: number; days60: number; days90: number };
  rows: {
    id: string; invoiceNumber: string; customer: string;
    dueDate: string | null; balance: number; daysOverdue: number; bucket: string;
  }[];
}

export default function ReceivablePage() {
  const { format } = useCurrency();
  const [data, setData] = useState<ARData | null>(null);
  const [loading, setLoading] = useState(true);
  const version = useLocationVersion();

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: ARData }>("/accounting/receivable")
      .then((res) => { if (active) setData(res.data); })
      .catch((e: unknown) => reportError(e, "Could not load this page"))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);

  return (
    <div className="space-y-6">
      <PageHeader title="Accounts Receivable" description="Money customers owe you." />

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card><CardContent className="p-5">
              <p className="text-sm text-ink-soft">Total</p>
              <p className="text-2xl font-bold mt-1 text-ink">{format(data.summary.total)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-ink-soft">Current</p>
              <p className="text-2xl font-bold mt-1 text-success">{format(data.summary.current)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-ink-soft">1–30 days</p>
              <p className="text-2xl font-bold mt-1 text-warning">{format(data.summary.days30)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-ink-soft">31–60 days</p>
              <p className="text-2xl font-bold mt-1 text-orange-700">{format(data.summary.days60)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-ink-soft">60+ days</p>
              <p className="text-2xl font-bold mt-1 text-danger">{format(data.summary.days90)}</p>
            </CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-0">
              {data.rows.length === 0 ? (
                <div className="py-16 text-center text-ink-soft">
                  <p>No outstanding invoices. 🎉</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-ivory text-ink-soft text-left">
                      <tr>
                        <th className="px-6 py-3 font-medium">Invoice</th>
                        <th className="px-6 py-3 font-medium">Customer</th>
                        <th className="px-6 py-3 font-medium">Due Date</th>
                        <th className="px-6 py-3 font-medium text-right">Balance</th>
                        <th className="px-6 py-3 font-medium text-right">Days Overdue</th>
                        <th className="px-6 py-3 font-medium">Bucket</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-soft">
                      {data.rows.map((r) => (
                        <tr key={r.id} className="hover:bg-ivory">
                          <td className="px-6 py-3">
                            <Link href={`/dashboard/invoices/${r.id}`} className="font-medium text-brand-dark hover:underline">
                              {r.invoiceNumber}
                            </Link>
                          </td>
                          <td className="px-6 py-3 text-ink">{r.customer}</td>
                          <td className="px-6 py-3 text-ink-soft">{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "—"}</td>
                          <td className="px-6 py-3 text-right font-medium text-ink">{format(r.balance)}</td>
                          <td className="px-6 py-3 text-right text-ink-soft">{r.daysOverdue}</td>
                          <td className="px-6 py-3">
                            <Badge variant={
                              r.bucket === "current" ? "success" :
                              r.bucket === "days30" ? "warning" :
                              r.bucket === "days60" ? "warning" : "danger"
                            }>
                              {r.bucket.replace("days", "")}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}