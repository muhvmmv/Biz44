"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { reportError } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Package, ClipboardCheck, Trash2, MapPin } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocation } from "@/hooks/useLocation";
import { useLocationVersion } from "@/hooks/useLocationRefetch";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import NumericInput from "@/components/ui/NumericInput";
import { formatQty, itemTypeLabel } from "@/lib/units";

interface Product {
  id: string; name: string; sku: string | null; description: string | null;
  price: number; cost: number; totalCostValue: number;
  quantity: number; reorderPoint: number;
  unit: string; itemType: string;
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
  location: { name: string } | null;
  productionOrder: { id: string; number: string } | null;
}

interface Level {
  locationId: string;
  name: string;
  quantity: number;
  value: number;
}

const inputClass =
  "w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { format } = useCurrency();
  const { locations, activeLocationId, activeLocation } = useLocation();
  const version = useLocationVersion();
  const [product, setProduct] = useState<Product | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);

  // Stock changes need one specific location.
  const canChangeStock = activeLocationId !== "all" || locations.length === 1;
  const changeLocationName = activeLocation?.name || locations[0]?.name || "";

  const [dialog, setDialog] = useState<null | "count" | "writeoff">(null);
  const [counted, setCounted] = useState(0);
  const [writeOffQty, setWriteOffQty] = useState(0);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  const fetchAll = useCallback(
    () =>
      Promise.all([
        apiFetch<{ success: boolean; data: Product }>(`/products/${id}`),
        apiFetch<{ success: boolean; data: Batch[] }>(`/stock/batches/${id}`),
        apiFetch<{ success: boolean; data: Level[] }>(`/stock/levels/${id}`),
      ]),
    [id]
  );

  const apply = useCallback(([p, b, l]: Awaited<ReturnType<typeof fetchAll>>) => {
    setProduct(p.data);
    setBatches(b.data);
    setLevels(l.data);
  }, []);

  useEffect(() => {
    let active = true;
    fetchAll()
      .then((r) => { if (active) apply(r); })
      .catch((e: unknown) => reportError(e, "Could not load this page"))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchAll, apply, version]);

  const openDialog = (kind: "count" | "writeoff") => {
    setActionError("");
    setNotes("");
    setReason("");
    setCounted(product?.quantity ?? 0);
    setWriteOffQty(0);
    setDialog(kind);
  };

  const submitAction = async () => {
    setActionError("");
    setSaving(true);
    try {
      if (dialog === "count") {
        await apiFetch("/stock/count", {
          method: "POST",
          body: JSON.stringify({ productId: id, countedQuantity: counted, notes: notes || undefined }),
        });
      } else {
        if (writeOffQty <= 0) throw new Error("Enter how many units to write off");
        await apiFetch("/stock/damage", {
          method: "POST",
          body: JSON.stringify({ productId: id, quantity: writeOffQty, reason: reason || undefined, notes: notes || undefined }),
        });
      }
      setDialog(null);
      apply(await fetchAll());
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8"><Skeleton className="h-96" /></div>;
  if (!product) return <div className="p-8 text-ink-soft">Product not found.</div>;

  const potentialSalesValue = batches.reduce(
    (s, b) => s + b.quantityRemaining * b.sellingPriceSnapshot,
    0
  );
  const potentialGrossProfit = potentialSalesValue - product.totalCostValue;

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        description={product.sku ? `SKU: ${product.sku}` : undefined}
        actions={
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => openDialog("count")} disabled={!canChangeStock}>
                <ClipboardCheck size={16} className="mr-1.5" /> Count stock
              </Button>
              <Button variant="outline" onClick={() => openDialog("writeoff")} disabled={!canChangeStock}>
                <Trash2 size={16} className="mr-1.5" /> Write off
              </Button>
            </div>
            {!canChangeStock && (
              <p className="text-xs text-ink-soft">Choose a location in the top bar to count or write off stock.</p>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-5">
          <p className="text-sm text-ink-soft">
            Stock{activeLocation ? ` · ${activeLocation.name}` : locations.length > 1 ? " · all locations" : ""}
          </p>
          <p className="text-2xl font-bold mt-1 text-ink">{formatQty(product.quantity, product.unit)}</p>
          <p className="text-xs text-ink-soft mt-0.5">{itemTypeLabel(product.itemType)}</p>
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

      {levels.length > 1 && (
        <Card>
          <CardHeader><CardTitle>Stock by location</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {levels.map((l) => (
              <div key={l.locationId} className="rounded-xl border border-border-soft p-4">
                <p className="text-sm text-ink-soft flex items-center gap-1.5">
                  <MapPin size={14} className="text-brand" /> {l.name}
                </p>
                <p className="text-xl font-bold text-ink mt-1 tabular-nums">{formatQty(l.quantity, product.unit)}</p>
                <p className="text-xs text-ink-soft">{format(l.value)} at cost</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
                    {locations.length > 1 && <th className="px-6 py-3 font-medium">Location</th>}
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
                      <td className="px-6 py-3 text-ink">
                        {b.productionOrder ? (
                          <Link href={`/dashboard/production/${b.productionOrder.id}`} className="font-medium text-brand-dark hover:underline">
                            {b.productionOrder.number}
                          </Link>
                        ) : (b.reference || "—")}
                      </td>
                      <td className="px-6 py-3 text-ink-soft">{b.supplier?.name || "—"}</td>
                      {locations.length > 1 && (
                        <td className="px-6 py-3 text-ink-soft">{b.location?.name || "—"}</td>
                      )}
                      <td className="px-6 py-3 text-right text-ink-soft">{formatQty(b.quantityReceived, product.unit)}</td>
                      <td className="px-6 py-3 text-right font-medium text-ink">{formatQty(b.quantityRemaining, product.unit)}</td>
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

      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === "count" ? "Count stock" : "Write off stock"}
        description={
          dialog === "count"
            ? `Enter the quantity you physically counted at ${changeLocationName}. The difference is recorded as a stock gain or loss.`
            : `Remove damaged, expired or lost units at ${changeLocationName}. Their cost is booked as an inventory loss.`
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={submitAction} isLoading={saving}>
              {dialog === "count" ? "Save count" : "Write off"}
            </Button>
          </>
        }
      >
        {dialog === "count" ? (
          <div>
            <label className="block text-sm font-medium mb-1">Counted quantity</label>
            <NumericInput min={0} value={counted} onChange={setCounted} />
            <p className="text-xs text-ink-soft mt-1">
              System shows {formatQty(product.quantity, product.unit)}.{" "}
              {counted !== product.quantity &&
                `Difference: ${counted - product.quantity > 0 ? "+" : ""}${formatQty(counted - product.quantity, product.unit)}`}
            </p>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Units to write off</label>
              <NumericInput min={0} max={product.quantity} value={writeOffQty} onChange={setWriteOffQty} />
              <p className="text-xs text-ink-soft mt-1">{formatQty(product.quantity, product.unit)} in stock here.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Reason</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass}>
                <option value="">Select a reason</option>
                <option value="Damaged">Damaged</option>
                <option value="Expired">Expired</option>
                <option value="Lost / missing">Lost / missing</option>
                <option value="Spoiled in storage">Spoiled in storage</option>
              </select>
            </div>
          </>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">Notes (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>
        {actionError && <p className="text-sm text-danger">{actionError}</p>}
      </Dialog>
    </div>
  );
}
