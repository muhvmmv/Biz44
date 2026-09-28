"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

interface Data {
  supplier: { id: string; name: string; email: string | null; phone: string | null; address: string | null; createdAt: string };
  summary: { totalPurchased: number; receiptCount: number };
  receipts: {
    id: string;
    quantity: number;
    balance: number;
    reference: string | null;
    createdAt: string;
    product: { name: string; sku: string | null };
  }[];
}

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
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
  if (!data) return <div className="p-8 text-neutral-500">Supplier not found.</div>;

  const { supplier, summary, receipts } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={supplier.name}
        description={`Supplier since ${new Date(supplier.createdAt).toLocaleDateString()}`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card><CardContent className="p-5">
          <p className="text-sm text-neutral-500">Total units purchased</p>
          <p className="text-2xl font-bold mt-1">{summary.totalPurchased}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-neutral-500">Receipts</p>
          <p className="text-2xl font-bold mt-1">{summary.receiptCount}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4 text-sm">
          <div><p className="text-neutral-500">Email</p><p className="font-medium">{supplier.email || "—"}</p></div>
          <div><p className="text-neutral-500">Phone</p><p className="font-medium">{supplier.phone || "—"}</p></div>
          <div><p className="text-neutral-500">Address</p><p className="font-medium">{supplier.address || "—"}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Purchase History</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-left">
              <tr>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Product</th>
                <th className="px-6 py-3 font-medium">Reference</th>
                <th className="px-6 py-3 font-medium text-right">Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {receipts.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="px-6 py-3 text-neutral-600">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-3">
                    <p className="font-medium">{r.product.name}</p>
                    {r.product.sku && <p className="text-xs text-neutral-500">{r.product.sku}</p>}
                  </td>
                  <td className="px-6 py-3 text-neutral-500">{r.reference || "—"}</td>
                  <td className="px-6 py-3 text-right font-medium text-emerald-600">+{Math.abs(r.quantity)}</td>
                </tr>
              ))}
              {receipts.length === 0 && (
                <tr><td colSpan={4} className="text-center text-neutral-400 py-8">No purchases yet</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}