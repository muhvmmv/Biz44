"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";

interface ARData {
  summary: { total: number; current: number; days30: number; days60: number; days90: number };
  rows: {
    id: string;
    invoiceNumber: string;
    customer: string;
    dueDate: string | null;
    balance: number;
    daysOverdue: number;
    bucket: string;
  }[];
}

export default function ReceivablePage() {
  const [data, setData] = useState<ARData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: ARData }>("/accounting/receivable")
      .then((res) => { if (active) setData(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

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
              <p className="text-sm text-neutral-500">Total</p>
              <p className="text-2xl font-bold mt-1">${data.summary.total.toFixed(2)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-neutral-500">Current</p>
              <p className="text-2xl font-bold mt-1 text-emerald-600">${data.summary.current.toFixed(2)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-neutral-500">1–30 days</p>
              <p className="text-2xl font-bold mt-1 text-amber-600">${data.summary.days30.toFixed(2)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-neutral-500">31–60 days</p>
              <p className="text-2xl font-bold mt-1 text-orange-600">${data.summary.days60.toFixed(2)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-neutral-500">60+ days</p>
              <p className="text-2xl font-bold mt-1 text-red-600">${data.summary.days90.toFixed(2)}</p>
            </CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-0">
              {data.rows.length === 0 ? (
                <div className="py-16 text-center text-neutral-400">
                  <p>No outstanding invoices. 🎉</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-neutral-500 text-left">
                      <tr>
                        <th className="px-6 py-3 font-medium">Invoice</th>
                        <th className="px-6 py-3 font-medium">Customer</th>
                        <th className="px-6 py-3 font-medium">Due Date</th>
                        <th className="px-6 py-3 font-medium text-right">Balance</th>
                        <th className="px-6 py-3 font-medium text-right">Days Overdue</th>
                        <th className="px-6 py-3 font-medium">Bucket</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {data.rows.map((r) => (
                        <tr key={r.id} className="hover:bg-neutral-50">
                          <td className="px-6 py-3">
                            <Link href={`/dashboard/invoices/${r.id}`} className="font-medium text-brand-700 hover:underline">
                              {r.invoiceNumber}
                            </Link>
                          </td>
                          <td className="px-6 py-3 text-neutral-700">{r.customer}</td>
                          <td className="px-6 py-3 text-neutral-600">
                            {r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-6 py-3 text-right font-medium">${r.balance.toFixed(2)}</td>
                          <td className="px-6 py-3 text-right text-neutral-600">{r.daysOverdue}</td>
                          <td className="px-6 py-3">
                            <Badge
                              variant={
                                r.bucket === "current" ? "success" :
                                r.bucket === "days30" ? "warning" :
                                r.bucket === "days60" ? "warning" : "danger"
                              }
                            >
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