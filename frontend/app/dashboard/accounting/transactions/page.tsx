"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocationVersion } from "@/hooks/useLocationRefetch";

interface Transaction {
  id: string; type: string; description: string | null;
  amount: number; date: string;
  account: { name: string; type: string };
}

const typeVariant: Record<string, "success" | "danger" | "info" | "warning" | "default"> = {
  sale: "success",
  payment: "info",
  expense: "danger",
  payroll: "warning",
  refund: "warning",
  adjustment: "default",
};

export default function TransactionsPage() {
  const { format } = useCurrency();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const version = useLocationVersion();

  useEffect(() => {
    let active = true;
    const url = filter ? `/accounting/transactions?type=${filter}` : "/accounting/transactions";
    apiFetch<{ success: boolean; data: Transaction[] }>(url)
      .then((res) => { if (active) setTransactions(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filter, version]);

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" description="Every financial event in your business." />

      <div className="flex gap-2 flex-wrap">
        {["", "sale", "payment", "expense", "payroll", "refund"].map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              filter === t
                ? "bg-charcoal text-white"
                : "bg-white border border-border-soft text-ink-soft hover:border-brand"
            }`}
          >
            {t === "" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : transactions.length === 0 ? (
            <div className="py-16 text-center text-ink-soft">
              <p>No transactions yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ivory text-ink-soft text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Type</th>
                    <th className="px-6 py-3 font-medium">Account</th>
                    <th className="px-6 py-3 font-medium">Description</th>
                    <th className="px-6 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-ivory">
                      <td className="px-6 py-3 text-ink-soft">{new Date(t.date).toLocaleDateString()}</td>
                      <td className="px-6 py-3"><Badge variant={typeVariant[t.type] || "default"}>{t.type}</Badge></td>
                      <td className="px-6 py-3 text-ink">{t.account.name}</td>
                      <td className="px-6 py-3 text-ink-soft">{t.description || "—"}</td>
                      <td className="px-6 py-3 text-right font-medium text-ink">{format(t.amount)}</td>
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