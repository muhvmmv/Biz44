"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import { ArrowDown, ArrowUp, Package } from "lucide-react";
import { useLocationVersion } from "@/hooks/useLocationRefetch";

interface StockMovement {
  id: string; type: string; quantity: number; balance: number;
  reference: string | null; notes: string | null; createdAt: string;
  product: { name: string; sku: string | null };
}

const typeConfig: Record<string, { label: string; variant: "success" | "danger" | "warning" | "info" | "default" }> = {
  receipt: { label: "Receipt", variant: "success" },
  opening: { label: "Opening stock", variant: "success" },
  sale: { label: "Sale", variant: "info" },
  return: { label: "Return", variant: "success" },
  supplier_return: { label: "Supplier Return", variant: "warning" },
  adjustment: { label: "Adjustment", variant: "warning" },
  count: { label: "Stock count", variant: "warning" },
  damage: { label: "Damage", variant: "danger" },
  transfer: { label: "Transfer", variant: "default" },
};

export default function StockMovementsPage() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const version = useLocationVersion();

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: StockMovement[] }>("/stock")
      .then((res) => { if (active) setMovements(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);

  return (
    <div className="space-y-6">
      <PageHeader title="Stock Movements" description="Complete history of all inventory movements." />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : movements.length === 0 ? (
            <div className="py-16 text-center text-ink-soft">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No stock movements yet.</p>
              <p className="text-sm mt-1">Movements appear here when you receive inventory or make sales.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ivory text-ink-soft text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Type</th>
                    <th className="px-6 py-3 font-medium">Product</th>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium text-right">Change</th>
                    <th className="px-6 py-3 font-medium text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {movements.map((m) => {
                    const cfg = typeConfig[m.type] || typeConfig.adjustment;
                    return (
                      <tr key={m.id} className="hover:bg-ivory">
                        <td className="px-6 py-3 text-ink-soft">
                          {new Date(m.createdAt).toLocaleDateString()}{" "}
                          <span className="text-ink-soft opacity-60 text-xs">
                            {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </td>
                        <td className="px-6 py-3"><Badge variant={cfg.variant}>{cfg.label}</Badge></td>
                        <td className="px-6 py-3">
                          <div className="font-medium text-ink">{m.product.name}</div>
                          {m.product.sku && <div className="text-xs text-ink-soft">{m.product.sku}</div>}
                        </td>
                        <td className="px-6 py-3 text-ink-soft">{m.reference || "—"}</td>
                        <td className="px-6 py-3 text-right">
                          <span className={`inline-flex items-center font-medium ${m.quantity > 0 ? "text-success" : "text-danger"}`}>
                            {m.quantity > 0 ? <ArrowUp size={14} className="mr-1" /> : <ArrowDown size={14} className="mr-1" />}
                            {Math.abs(m.quantity)}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right font-medium text-ink">{m.balance}</td>
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