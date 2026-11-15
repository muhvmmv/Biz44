"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { FileText } from "lucide-react";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useCurrency } from "@/hooks/useCurrency";

interface Data {
  supplier: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    createdAt: string;
  };
  summary: {
    totalPurchased: number;
    totalPaid: number;
    outstanding: number;
    purchaseCount: number;
    totalUnits: number;
  };
  purchases: {
    id: string;
    reference: string | null;
    date: string;
    total: number;
    amountPaid: number;
    status: string;
    items: {
      id: string;
      quantity: number;
      unitCost: number;
      total: number;
      product: { name: string; sku: string | null };
    }[];
  }[];
  receipts: {
    id: string;
    quantity: number;
    unitCost: number;
    total: number;
    reference: string | null;
    createdAt: string;
    product: { name: string; sku: string | null };
  }[];
}

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { format } = useCurrency();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Data }>(`/suppliers/${id}/summary`)
      .then((res) => { if (active) setData(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  if (loading) return <div className="p-8"><Skeleton className="h-96" /></div>;
  if (!data) return <div className="p-8 text-ink-soft">Supplier not found.</div>;

  const { supplier, summary, receipts, purchases } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={supplier.name}
        description={`Supplier since ${new Date(supplier.createdAt).toLocaleDateString()}`}
        actions={<ButtonLink href={`/dashboard/suppliers/${supplier.id}/statement`} variant="outline"><FileText size={16} /> Statement</ButtonLink>}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-ink-soft">Total purchased</p>
            <p className="text-2xl font-bold mt-1 text-ink">{format(summary.totalPurchased)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-ink-soft">Total paid</p>
            <p className="text-2xl font-bold mt-1 text-success">{format(summary.totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-ink-soft">Outstanding</p>
            <p className={`text-2xl font-bold mt-1 ${summary.outstanding > 0 ? "text-warning" : "text-ink"}`}>
              {format(summary.outstanding)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-ink-soft">Receipts</p>
            <p className="text-2xl font-bold mt-1 text-ink">{summary.purchaseCount}</p>
            <p className="text-xs text-ink-soft mt-1">{summary.totalUnits} units</p>
          </CardContent>
        </Card>
      </div>

      {/* Contact */}
      <Card>
        <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-ink-soft">Email</p>
            <p className="font-medium text-ink">{supplier.email || "—"}</p>
          </div>
          <div>
            <p className="text-ink-soft">Phone</p>
            <p className="font-medium text-ink">{supplier.phone || "—"}</p>
          </div>
          <div>
            <p className="text-ink-soft">Address</p>
            <p className="font-medium text-ink">{supplier.address || "—"}</p>
          </div>
        </CardContent>
      </Card>

      {/* Purchase history (with payment status) */}
      <Card>
        <CardHeader><CardTitle>Purchase History</CardTitle></CardHeader>
        <CardContent className="p-0">
          {purchases.length === 0 ? (
            <div className="text-center text-ink-soft py-12 text-sm">No purchases yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ivory text-ink-soft text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Items</th>
                    <th className="px-6 py-3 font-medium text-right">Total</th>
                    <th className="px-6 py-3 font-medium text-right">Paid</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-ivory">
                      <td className="px-6 py-3 text-ink-soft">
                        {new Date(p.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3 text-ink">{p.reference || "—"}</td>
                      <td className="px-6 py-3 text-ink-soft">
                        {p.items.length} item{p.items.length !== 1 ? "s" : ""}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-ink">
                        {format(p.total)}
                      </td>
                      <td className="px-6 py-3 text-right text-ink-soft">
                        {format(p.amountPaid)}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            p.status === "paid"
                              ? "bg-[#E6F0EA] text-success"
                              : p.status === "partially_paid"
                              ? "bg-[#E3EBF1] text-info"
                              : "bg-[#F7EEDC] text-warning"
                          }`}
                        >
                          {p.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product detail table */}
      <Card>
        <CardHeader><CardTitle>Products Purchased</CardTitle></CardHeader>
        <CardContent className="p-0">
          {receipts.length === 0 ? (
            <div className="text-center text-ink-soft py-12 text-sm">No products purchased yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ivory text-ink-soft text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Product</th>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium text-right">Quantity</th>
                    <th className="px-6 py-3 font-medium text-right">Unit Cost</th>
                    <th className="px-6 py-3 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {receipts.map((r) => (
                    <tr key={r.id} className="hover:bg-ivory">
                      <td className="px-6 py-3 text-ink-soft">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3">
                        <p className="font-medium text-ink">{r.product.name}</p>
                        {r.product.sku && (
                          <p className="text-xs text-ink-soft">{r.product.sku}</p>
                        )}
                      </td>
                      <td className="px-6 py-3 text-ink-soft">{r.reference || "—"}</td>
                      <td className="px-6 py-3 text-right font-medium text-ink">
                        {r.quantity}
                      </td>
                      <td className="px-6 py-3 text-right text-ink-soft">
                        {format(r.unitCost)}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-ink">
                        {format(r.total)}
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