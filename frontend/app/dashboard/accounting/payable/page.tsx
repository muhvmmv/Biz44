"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import StatCard from "@/components/ui/StatCard";
import { Card, CardContent } from "@/components/ui/Card";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocationVersion } from "@/hooks/useLocationRefetch";

interface APData {
  summary: { total: number; current: number; days30: number; days60: number; days90: number };
  rows: {
    id: string;
    reference: string | null;
    supplier: string;
    date: string;
    dueDate: string | null;
    total: number;
    balance: number;
    daysOverdue: number;
    bucket: "current" | "days30" | "days60" | "days90";
  }[];
}

const BUCKET_LABEL = { current: "Not due", days30: "1–30 days", days60: "31–60 days", days90: "60+ days" };

export default function PayablePage() {
  const { format } = useCurrency();
  const version = useLocationVersion();
  const [data, setData] = useState<APData | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: APData }>("/accounting/payable")
      .then((r) => { if (active) setData(r.data); })
      .catch(console.error);
    return () => { active = false; };
  }, [version]);

  return (
    <div className="space-y-6">
      <PageHeader title="Accounts Payable" description="What you still owe suppliers, by how overdue it is. Purchases with no due date count from the delivery date." />

      {!data ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard label="Total owed" value={format(data.summary.total)} />
            <StatCard label="Not due" value={format(data.summary.current)} />
            <StatCard label="1–30 days" value={format(data.summary.days30)} tone="warning" />
            <StatCard label="31–60 days" value={format(data.summary.days60)} tone="warning" />
            <StatCard label="60+ days" value={format(data.summary.days90)} tone="negative" />
          </div>

          <Card>
            <CardContent className="p-0">
              {data.rows.length === 0 ? (
                <p className="py-16 text-center text-ink-soft">Nothing owed to suppliers.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-ivory text-ink-soft text-left">
                      <tr>
                        <th className="px-6 py-3 font-medium">Purchase</th>
                        <th className="px-6 py-3 font-medium">Supplier</th>
                        <th className="px-6 py-3 font-medium">Due</th>
                        <th className="px-6 py-3 font-medium text-right">Total</th>
                        <th className="px-6 py-3 font-medium text-right">Still owed</th>
                        <th className="px-6 py-3 font-medium">Age</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-soft">
                      {data.rows.map((r) => (
                        <tr key={r.id} className="hover:bg-ivory">
                          <td className="px-6 py-3">
                            <Link href={`/dashboard/purchases/${r.id}`} className="font-medium text-brand-dark hover:underline">
                              {r.reference || new Date(r.date).toLocaleDateString()}
                            </Link>
                          </td>
                          <td className="px-6 py-3">{r.supplier}</td>
                          <td className="px-6 py-3 text-ink-soft">{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "—"}</td>
                          <td className="px-6 py-3 text-right tabular-nums">{format(r.total)}</td>
                          <td className="px-6 py-3 text-right tabular-nums font-medium">{format(r.balance)}</td>
                          <td className="px-6 py-3">
                            <Badge variant={r.bucket === "current" ? "success" : r.bucket === "days90" ? "danger" : "warning"}>
                              {BUCKET_LABEL[r.bucket]}
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
      )}
    </div>
  );
}
