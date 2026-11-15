"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Skeleton from "@/components/ui/Skeleton";
import NumericInput from "@/components/ui/NumericInput";
import { Field, Input, Select } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useCurrency } from "@/hooks/useCurrency";
import { formatQty, itemTypeLabel } from "@/lib/units";

interface Product {
  id: string;
  name: string;
  unit: string;
  itemType: string;
  cost: number;
  price: number;
  quantity: number;
  totalCostValue: number;
}

interface Line { componentId: string; quantity: number; scrapPercent: number }
interface BomData { productId: string; outputQuantity: number; notes: string | null; lines: Line[] }

/** Create or edit a bill of materials, with a live cost estimate. */
export default function BomEditor({ bomId }: { bomId?: string }) {
  const router = useRouter();
  const { format } = useCurrency();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [productId, setProductId] = useState("");
  const [outputQuantity, setOutputQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ componentId: "", quantity: 0, scrapPercent: 0 }]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ success: boolean; data: Product[] }>("/products?locationId=all"),
      bomId ? apiFetch<{ success: boolean; data: BomData }>(`/production/boms/${bomId}`) : Promise.resolve(null),
    ])
      .then(([p, b]) => {
        if (!active) return;
        setProducts(p.data);
        if (b) {
          setProductId(b.data.productId);
          setOutputQuantity(b.data.outputQuantity);
          setNotes(b.data.notes ?? "");
          setLines(b.data.lines.map((l) => ({ componentId: l.componentId, quantity: l.quantity, scrapPercent: l.scrapPercent })));
        }
      })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bomId]);

  const byId = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  const finished = (products ?? []).filter((p) => p.itemType === "finished_good");
  const materials = (products ?? []).filter((p) => p.id !== productId);
  const product = byId.get(productId);

  // Cost per unit of a material: average of the stock on hand, else its latest cost.
  const unitCostOf = (p?: Product) => (p ? (p.quantity > 0 ? p.totalCostValue / p.quantity : p.cost) : 0);
  const estimate = useMemo(() => {
    if (!outputQuantity) return { perUnit: 0, perBatch: 0 };
    const perBatch = lines.reduce((s, l) => {
      const m = byId.get(l.componentId);
      return s + l.quantity * (1 + (l.scrapPercent || 0) / 100) * unitCostOf(m);
    }, 0);
    return { perBatch, perUnit: perBatch / outputQuantity };
  }, [lines, outputQuantity, byId]);

  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const save = async () => {
    setError("");
    if (!productId) return setError("Choose the finished good this makes");
    if (!(outputQuantity > 0)) return setError("Enter how many units these materials make");
    const clean = lines.filter((l) => l.componentId);
    if (clean.length === 0) return setError("Add at least one material");
    if (clean.some((l) => !(l.quantity > 0))) return setError("Every material needs a quantity");
    setSaving(true);
    try {
      await apiFetch(bomId ? `/production/boms/${bomId}` : "/production/boms", {
        method: bomId ? "PUT" : "POST",
        body: JSON.stringify({ productId, outputQuantity, notes: notes || null, lines: clean }),
      });
      router.push("/dashboard/production/boms");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await apiFetch(`/production/boms/${bomId}`, { method: "DELETE" });
      router.push("/dashboard/production/boms");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not delete");
      setConfirmDelete(false);
    }
  };

  if (loading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/production/boms" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={16} /> Bills of materials
      </Link>
      <PageHeader
        title={bomId ? `Bill of materials${product ? ` · ${product.name}` : ""}` : "New bill of materials"}
        description="List the materials needed to make a batch of this product. Changes apply to new production orders, not ones already created."
        actions={bomId && <Button variant="outline" onClick={() => setConfirmDelete(true)} className="hover:text-danger"><Trash2 size={16} /> Delete</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Finished good</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Product" required hint={finished.length === 0 ? "Create a product of type Finished good first" : undefined}>
                <Select value={productId} onChange={(e) => setProductId(e.target.value)} disabled={!!bomId}>
                  <option value="">Choose a finished good</option>
                  {finished.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Field label={`These materials make${product ? ` (${product.unit})` : ""}`} required hint="e.g. 100 if the quantities below are for 100 bags">
                <NumericInput value={outputQuantity} onChange={setOutputQuantity} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Materials</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="hidden grid-cols-[1fr_9rem_6rem_7rem_2rem] gap-3 text-xs font-medium uppercase tracking-wide text-ink-soft sm:grid">
                <span>Material</span><span className="text-right">Quantity</span><span className="text-right">Scrap %</span><span className="text-right">Cost</span><span />
              </div>
              {lines.map((l, i) => {
                const m = byId.get(l.componentId);
                const cost = l.quantity * (1 + (l.scrapPercent || 0) / 100) * unitCostOf(m);
                return (
                  <div key={i} className="grid grid-cols-2 items-center gap-3 rounded-xl border border-border-soft p-3 sm:grid-cols-[1fr_9rem_6rem_7rem_2rem] sm:border-0 sm:p-0">
                    <Select value={l.componentId} onChange={(e) => update(i, { componentId: e.target.value })} className="col-span-2 sm:col-span-1" aria-label="Material">
                      <option value="">Choose material</option>
                      {["raw_material", "packaging", "finished_good"].map((t) => (
                        <optgroup key={t} label={itemTypeLabel(t) + "s"}>
                          {materials.filter((p) => p.itemType === t).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </optgroup>
                      ))}
                    </Select>
                    <div className="relative">
                      <NumericInput value={l.quantity} onChange={(v) => update(i, { quantity: v })} className="pr-12 text-right" aria-label="Quantity" />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-soft">{m?.unit ?? ""}</span>
                    </div>
                    <NumericInput value={l.scrapPercent} onChange={(v) => update(i, { scrapPercent: v })} className="text-right" aria-label="Scrap percent" />
                    <span className="text-right text-sm tabular-nums text-ink-soft">{format(cost)}</span>
                    <Button variant="ghost" size="icon-sm" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} disabled={lines.length <= 1} aria-label="Remove material">
                      <Trash2 size={15} />
                    </Button>
                  </div>
                );
              })}
              <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { componentId: "", quantity: 0, scrapPercent: 0 }])}>
                <Plus size={14} /> Add material
              </Button>
              <Field label="Notes">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional, e.g. milling instructions" />
              </Field>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="lg:sticky lg:top-4">
            <CardHeader><CardTitle>Estimated cost</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-ink-soft">Per batch of {formatQty(outputQuantity, product?.unit)}</span><span className="tabular-nums font-medium">{format(estimate.perBatch)}</span></div>
              <div className="flex justify-between text-base"><span className="font-semibold">Per {product?.unit ?? "unit"}</span><span className="tabular-nums font-bold">{format(estimate.perUnit)}</span></div>
              {product && product.price > 0 && (
                <div className="flex justify-between border-t border-border-soft pt-3">
                  <span className="text-ink-soft">Selling price {format(product.price)}</span>
                  <span className={`tabular-nums font-medium ${product.price - estimate.perUnit >= 0 ? "text-success" : "text-danger"}`}>
                    {(((product.price - estimate.perUnit) / product.price) * 100).toFixed(1)}% margin
                  </span>
                </div>
              )}
              <p className="text-xs text-ink-soft">From the average cost of stock on hand (or each material&apos;s latest cost). Actual production cost is worked out from the batches really used.</p>
              {error && <p className="text-sm text-danger" role="alert">{error}</p>}
              <Button onClick={save} isLoading={saving} className="w-full">{bomId ? "Save changes" : "Create bill of materials"}</Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this bill of materials?"
        description="Existing production orders keep their materials. New orders for this product will need a new bill of materials."
        footer={<><Button variant="outline" onClick={() => setConfirmDelete(false)}>Keep</Button><Button variant="danger" onClick={remove}>Delete</Button></>}
      >
        <p className="text-sm text-ink-soft">This can&apos;t be undone.</p>
      </Dialog>
    </div>
  );
}
