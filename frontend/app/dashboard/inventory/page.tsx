"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import {
  Package,
  AlertTriangle,
  XCircle,
  DollarSign,
  ShoppingCart,
  ArrowRight,
} from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocationVersion } from "@/hooks/useLocationRefetch";

interface Product {
  id: string;
  quantity: number;
  price: number;
  cost: number;
  totalCostValue: number;
  reorderPoint: number;
}

interface Purchase {
  id: string;
  reference: string | null;
  date: string;
  dueDate: string | null;
  total: number;
  amountPaid: number;
  returnedAmount?: number;
  status: string;
  supplier: { name: string } | null;
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

export default function InventoryPage() {
  const { format } = useCurrency();
  const version = useLocationVersion();
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Defer synchronous state update to satisfy react-hooks/set-state-in-effect
    const timer = setTimeout(() => {
      if (active) setLoading(true);
    }, 0);

    Promise.all([
      apiFetch<{ success: boolean; data: Product[] }>("/products"),
      apiFetch<{ success: boolean; data: Purchase[] }>(
        "/purchases?status=unpaid"
      ),
    ])
      .then(([pRes, purRes]) => {
        if (!active) return;
        setProducts(pRes.data);
        setPurchases(purRes.data);
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [version]);

  const totalProducts = products.length;
  const totalUnits = products.reduce((s, p) => s + p.quantity, 0);
  const totalValue = products.reduce((s, p) => s + p.totalCostValue, 0);
  const lowStock = products.filter(
    (p) => p.quantity > 0 && p.quantity <= p.reorderPoint
  ).length;
  const outOfStock = products.filter((p) => p.quantity === 0).length;

  // Purchase payment summary
  const outstandingTotal = purchases.reduce(
    (s, p) => s + Math.max(0, p.total - p.amountPaid - (p.returnedAmount || 0)),
    0
  );
  const overdueCount = purchases.filter((p) => p.status === "overdue").length;

  const stats = [
    {
      label: "Total Products",
      value: totalProducts.toString(),
      icon: Package,
      color: "text-brand-dark bg-brand-light",
    },
    {
      label: "Total Units",
      value: totalUnits.toLocaleString(),
      icon: Package,
      color: "text-info bg-[#E3EBF1]",
    },
    {
      label: "Inventory Value",
      value: format(totalValue),
      icon: DollarSign,
      color: "text-charcoal bg-charcoal-light",
    },
    {
      label: "Low Stock",
      value: lowStock.toString(),
      icon: AlertTriangle,
      color: "text-warning bg-[#F7EEDC]",
    },
    {
      label: "Out of Stock",
      value: outOfStock.toString(),
      icon: XCircle,
      color: "text-danger bg-[#F4E2E1]",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Overview of your stock levels and value."
      />

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="p-5">
                <div
                  className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-3`}
                >
                  <Icon size={20} />
                </div>
                <p className="text-sm text-ink-soft">{label}</p>
                <p className="text-2xl font-bold mt-1 text-ink">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Purchase payment tracking section */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-brand-dark" />
              Supplier Payments
            </CardTitle>
            <p className="text-sm text-ink-soft mt-1">
              Inventory purchases awaiting payment to suppliers.
            </p>
          </div>
          <Link href="/dashboard/purchases">
            <button className="flex items-center gap-1 text-sm font-medium text-brand-dark hover:text-brand-dark">
              View all <ArrowRight size={14} />
            </button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {/* Summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 px-5 pb-4">
            <div className="bg-ivory rounded-lg p-4">
              <p className="text-xs text-ink-soft">Total outstanding</p>
              <p className="text-lg font-bold mt-0.5 text-warning">
                {format(outstandingTotal)}
              </p>
            </div>
            <div className="bg-ivory rounded-lg p-4">
              <p className="text-xs text-ink-soft">Unpaid purchases</p>
              <p className="text-lg font-bold mt-0.5 text-ink">
                {purchases.length}
              </p>
            </div>
            <div className="bg-ivory rounded-lg p-4">
              <p className="text-xs text-ink-soft">Overdue</p>
              <p className="text-lg font-bold mt-0.5 text-danger">
                {overdueCount}
              </p>
            </div>
          </div>

          {purchases.length === 0 ? (
            <div className="text-center text-ink-soft py-8 text-sm border-t border-border-soft">
              All supplier payments are up to date ✓
            </div>
          ) : (
            <div className="overflow-x-auto border-t border-border-soft">
              <table className="w-full text-sm">
                <thead className="bg-ivory text-ink-soft text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Supplier</th>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Due</th>
                    <th className="px-6 py-3 font-medium text-right">Total</th>
                    <th className="px-6 py-3 font-medium text-right">Balance</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {purchases.slice(0, 8).map((p) => {
                    const balance = p.total - p.amountPaid - (p.returnedAmount || 0);
                    return (
                      <tr key={p.id} className="hover:bg-ivory">
                        <td className="px-6 py-3">
                          <Link
                            href={`/dashboard/purchases/${p.id}`}
                            className="font-medium text-brand-dark hover:underline"
                          >
                            {p.reference || "—"}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-ink-soft">
                          {p.supplier?.name || "—"}
                        </td>
                        <td className="px-6 py-3 text-ink-soft">
                          {new Date(p.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 text-ink-soft">
                          {p.dueDate
                            ? new Date(p.dueDate).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-6 py-3 text-right text-ink">
                          {format(p.total)}
                        </td>
                        <td className="px-6 py-3 text-right font-medium text-warning">
                          {format(balance)}
                        </td>
                        <td className="px-6 py-3">
                          <Badge variant={statusVariant(p.status)}>
                            {p.status.replace("_", " ")}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {purchases.length > 8 && (
                <div className="px-6 py-3 border-t border-border-soft text-center">
                  <Link
                    href="/dashboard/purchases"
                    className="text-sm font-medium text-brand-dark hover:underline"
                  >
                    View all {purchases.length} unpaid purchases
                  </Link>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}