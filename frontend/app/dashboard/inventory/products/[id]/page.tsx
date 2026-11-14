"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Package } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

interface Product {
  id: string; name: string; sku: string | null; description: string | null;
  price: number; cost: number; totalCostValue: number;
  quantity: number; reorderPoint: number;
}

interface Batch {
  id: string;
  quantityReceived: number;
  quantityRemaining: number;
  unitCost: number;
  sellingPriceSnapshot: number;
  reference: string | null;
  receivedAt: string;
  isLegacy: boolean;
  supplier: { name: string } | null;
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { format } = useCurrency();
  const [product, setProduct] = useState<Product | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ success: boolean; data: Product }>(`/products/${id}`),
      apiFetch<{ success: boolean; data: Batch[] }>(`/stock/batches/${id}`),
    ])
      .then(([p, b]) => {
        if (active) { setProduct(p.data); setBatches(b.data); }
      })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  if (loading) return <div className="p-8"><Skeleton className="h-96" /></div>;
  if (!product) return <div className="p-8 text-ink-soft">Product not found.</div>;

  const potentialSalesValue = batches.reduce(
    (s, b) => s + b.quantityRemaining * b.sellingPriceSnapshot,
    0
  );
  const potentialGrossProfit = potentialSalesValue - product.totalCostValue;

  return (
    <div className="space-y-6">
      <PageHeader title={product.name} description={product.sku ? `SKU: ${product.sku}` : undefined} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-5">
          <p className="text-sm text-ink-soft">Stock</p>
          <p className="text-2xl font-bold mt-1 text-ink">{product.quantity}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-ink-soft">Inventory value (cost)</p>
          <p className="text-2xl font-bold mt-1 text-ink">{format(product.totalCostValue)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-ink-soft">Potential sales value</p>
          <p className="text-2xl font-bold mt-1 text-ink">{format(potentialSalesValue)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-ink-soft">Potential gross profit</p>
          <p className={`text-2xl font-bold mt-1 ${potentialGrossProfit >= 0 ? "text-success" : "text-danger"}`}>
            {format(potentialGrossProfit)}
          </p>
          <p className="text-xs text-ink-soft mt-1">Not realized — estimate only</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Pricing</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-ink-soft">Default cost price</p>
            <p className="font-medium text-ink">{format(product.cost)}</p>
          </div>
          <div>
            <p className="text-ink-soft">Default selling price</p>
            <p className="font-medium text-ink">{format(product.price)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Inventory Batches (FIFO)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {batches.length === 0 ? (
            <div className="py-12 text-center text-ink-soft text-sm">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No batches yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ivory text-ink-soft text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Received</th>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Supplier</th>
                    <th className="px-6 py-3 font-medium text-right">Received</th>
                    <th className="px-6 py-3 font-medium text-right">Remaining</th>
                    <th className="px-6 py-3 font-medium text-right">Unit Cost</th>
                    <th className="px-6 py-3 font-medium text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {batches.map((b) => (
                    <tr key={b.id} className="hover:bg-ivory">
                      <td className="px-6 py-3 text-ink-soft">
                        {new Date(b.receivedAt).toLocaleDateString()}
                        {b.isLegacy && (
                          <Badge variant="default" className="ml-2">opening</Badge>
                        )}
                      </td>
                      <td className="px-6 py-3 text-ink">{b.reference || "—"}</td>
                      <td className="px-6 py-3 text-ink-soft">{b.supplier?.name || "—"}</td>
                      <td className="px-6 py-3 text-right text-ink-soft">{b.quantityReceived}</td>
                      <td className="px-6 py-3 text-right font-medium text-ink">{b.quantityRemaining}</td>
                      <td className="px-6 py-3 text-right text-ink">{format(b.unitCost)}</td>
                      <td className="px-6 py-3 text-right font-medium text-ink">
                        {format(b.quantityRemaining * b.unitCost)}
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