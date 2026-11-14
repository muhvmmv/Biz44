"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import { ShoppingCart } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocationVersion } from "@/hooks/useLocationRefetch";

interface Purchase {
  id: string;
  reference: string | null;
  date: string;
  dueDate: string | null;
  total: number;
  amountPaid: number;
  returnedAmount?: number;
  status: string;
  supplier: { id: string; name: string } | null;
  items: { id: string; quantity: number; unitCost: number }[];
}

const statusVariant = (
  s: string
): "success" | "warning" | "danger" | "info" | "default" => {
  if (s === "paid") return "success";
  if (s === "partially_paid") return "info";
  if (s === "overdue") return "danger";
  if (s === "unpaid") return "warning";
  return "default";
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Fully Paid" },
];

export default function PurchasesPage() {
  const { format } = useCurrency();
  const version = useLocationVersion();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;

    // Defer the synchronous state update to avoid React 19 cascading render warnings
    const timer = setTimeout(() => {
      if (active) setLoading(true);
    }, 0);

    const url = filter === "all" ? "/purchases" : `/purchases?status=${filter}`;
    apiFetch<{ success: boolean; data: Purchase[] }>(url)
      .then((res) => {
        if (active) setPurchases(res.data);
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [filter, version]);

  const filtered = purchases.filter((p) => {
    const q = search.toLowerCase();
    return (
      (p.reference || "").toLowerCase().includes(q) ||
      (p.supplier?.name || "").toLowerCase().includes(q)
    );
  });

  // Summary cards
  const totalPurchases = purchases.reduce((s, p) => s + p.total, 0);
  const totalOutstanding = purchases.reduce(
    (s, p) => s + Math.max(0, p.total - p.amountPaid - (p.returnedAmount || 0)),
    0
  );
  const overdueCount = purchases.filter((p) => p.status === "overdue").length;
  const unpaidCount = purchases.filter(
    (p) => p.status === "unpaid" || p.status === "partially_paid" || p.status === "overdue"
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchases"
        description="Inventory purchases and supplier payments."
      />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-ink-soft">Total purchases</p>
            <p className="text-2xl font-bold mt-1 text-ink">
              {format(totalPurchases)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-ink-soft">Outstanding</p>
            <p className="text-2xl font-bold mt-1 text-warning">
              {format(totalOutstanding)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-ink-soft">Unpaid purchases</p>
            <p className="text-2xl font-bold mt-1 text-ink">{unpaidCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-ink-soft">Overdue</p>
            <p className="text-2xl font-bold mt-1 text-danger">{overdueCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                filter === f.value
                  ? "bg-charcoal text-white"
                  : "bg-white border border-border-soft text-ink-soft hover:border-brand"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search by reference or supplier..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64 sm:ml-auto rounded-lg border border-border-soft bg-white px-4 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-ink-soft">
              <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No purchases found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ivory text-ink-soft text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Supplier</th>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Due</th>
                    <th className="px-6 py-3 font-medium text-right">Total</th>
                    <th className="px-6 py-3 font-medium text-right">Paid</th>
                    <th className="px-6 py-3 font-medium text-right">Balance</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {filtered.map((p) => {
                    const balance = p.total - p.amountPaid - (p.returnedAmount || 0);
                    return (
                      <tr key={p.id} className="hover:bg-ivory">
                        <td className="px-6 py-4">
                          <Link
                            href={`/dashboard/purchases/${p.id}`}
                            className="font-medium text-brand-dark hover:underline"
                          >
                            {p.reference || "—"}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-ink-soft">
                          {p.supplier?.name || "—"}
                        </td>
                        <td className="px-6 py-4 text-ink-soft">
                          {new Date(p.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-ink-soft">
                          {p.dueDate
                            ? new Date(p.dueDate).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-6 py-4 text-right text-ink">
                          {format(p.total)}
                        </td>
                        <td className="px-6 py-4 text-right text-ink-soft">
                          {format(p.amountPaid)}
                        </td>
                        <td className="px-6 py-4 text-right font-medium">
                          <span
                            className={balance > 0.01 ? "text-warning" : "text-ink"}
                          >
                            {format(balance)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={statusVariant(p.status)}>
                            {p.status.replace("_", " ")}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}