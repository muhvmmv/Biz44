"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import { Wallet } from "lucide-react";

interface Payment {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  paidAt: string;
  invoice: { invoiceNumber: string } | null;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Payment[] }>("/payments")
      .then((res) => { if (active) setPayments(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const total = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="All customer payments received."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-neutral-500">Total received</p>
            <p className="text-2xl font-bold mt-1">${total.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-neutral-500">Number of payments</p>
            <p className="text-2xl font-bold mt-1">{payments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-neutral-500">This month</p>
            <p className="text-2xl font-bold mt-1">
              ${payments
                .filter((p) => new Date(p.paidAt).getMonth() === new Date().getMonth())
                .reduce((s, p) => s + p.amount, 0)
                .toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : payments.length === 0 ? (
            <div className="py-16 text-center text-neutral-400">
              <Wallet className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
              <p>No payments recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-500 text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Invoice</th>
                    <th className="px-6 py-3 font-medium">Method</th>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-neutral-50">
                      <td className="px-6 py-3 text-neutral-600">
                        {new Date(p.paidAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3 font-medium text-neutral-900">
                        {p.invoice?.invoiceNumber || "—"}
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant="info">{p.method.replace("_", " ")}</Badge>
                      </td>
                      <td className="px-6 py-3 text-neutral-500">{p.reference || "—"}</td>
                      <td className="px-6 py-3 text-right font-medium text-emerald-600">
                        +${p.amount.toFixed(2)}
                      </td>
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