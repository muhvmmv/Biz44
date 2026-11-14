"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import { Wallet } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocationVersion } from "@/hooks/useLocationRefetch";


interface Payment {
  id: string; amount: number; method: string;
  reference: string | null; notes: string | null; paidAt: string;
  invoice: { invoiceNumber: string } | null;
}

export default function PaymentsPage() {
  const { format } = useCurrency();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const version = useLocationVersion();

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Payment[] }>("/payments")
      .then((res) => { if (active) setPayments(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);

  const total = payments.reduce((s, p) => s + p.amount, 0);
  const thisMonth = payments
    .filter((p) => new Date(p.paidAt).getMonth() === new Date().getMonth())
    .reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="All customer payments received." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-5">
          <p className="text-sm text-ink-soft">Total received</p>
          <p className="text-2xl font-bold mt-1 text-ink">{format(total)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-ink-soft">Number of payments</p>
          <p className="text-2xl font-bold mt-1 text-ink">{payments.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-ink-soft">This month</p>
          <p className="text-2xl font-bold mt-1 text-ink">{format(thisMonth)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : payments.length === 0 ? (
            <div className="py-16 text-center text-ink-soft">
              <Wallet className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No payments recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ivory text-ink-soft text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Invoice</th>
                    <th className="px-6 py-3 font-medium">Method</th>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-ivory">
                      <td className="px-6 py-3 text-ink-soft">{new Date(p.paidAt).toLocaleDateString()}</td>
                      <td className="px-6 py-3 font-medium text-ink">{p.invoice?.invoiceNumber || "—"}</td>
                      <td className="px-6 py-3"><Badge variant="info">{p.method.replace("_", " ")}</Badge></td>
                      <td className="px-6 py-3 text-ink-soft">{p.reference || "—"}</td>
                      <td className="px-6 py-3 text-right font-medium text-success">+{format(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}