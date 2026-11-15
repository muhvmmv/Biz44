"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Package, Grid, List, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge, { StatusBadge } from "@/components/ui/Badge";
import Dialog from "@/components/ui/Dialog";
import DataTable, { Column } from "@/components/ui/DataTable";
import Tabs from "@/components/ui/Tabs";
import NumericInput from "@/components/ui/NumericInput";
import { Field, Input, Select } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { useCurrency } from "@/hooks/useCurrency";
import { useOpenOnQuery } from "@/hooks/useOpenOnQuery";
import { useLocationVersion } from "@/hooks/useLocationRefetch";
import { ITEM_TYPES, UNITS, ItemType, formatQty, itemTypeLabel } from "@/lib/units";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  itemType: ItemType;
  unit: string;
  price: number;
  cost: number;
  quantity: number;
  totalCostValue: number;
  reorderPoint: number;
  needsStockCheck?: boolean;
}

type Filter = "all" | ItemType;

const EMPTY = {
  name: "", sku: "", description: "", itemType: "finished_good" as ItemType, unit: "pcs",
  price: 0, cost: 0, quantity: 0, reorderPoint: 0,
};

const stockStatus = (p: Product) =>
  p.quantity <= 0 ? "out_of_stock" : p.quantity <= p.reorderPoint ? "low_stock" : "in_stock";

export default function ProductsPage() {
  const { format } = useCurrency();
  const router = useRouter();
  const version = useLocationVersion();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"table" | "grid">("table");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Product[] }>("/products")
      .then((r) => { if (active) { setProducts(r.data); setLoadError(null); } })
      .catch((e: unknown) => { if (active) setLoadError(e instanceof Error ? e.message : "Something went wrong"); });
    return () => { active = false; };
  }, [version, reloadKey]);
  const reload = () => setReloadKey((k) => k + 1);

  const openNew = useCallback(() => {
    setEditing(null);
    setForm(EMPTY);
    setFormError("");
    setFormOpen(true);
  }, []);
  useOpenOnQuery("new", openNew);

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, sku: p.sku ?? "", description: p.description ?? "", itemType: p.itemType, unit: p.unit,
      price: p.price, cost: p.cost, quantity: p.quantity, reorderPoint: p.reorderPoint,
    });
    setFormError("");
    setFormOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const { quantity, ...rest } = form;
      await apiFetch(editing ? `/products/${editing.id}` : "/products", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(editing ? rest : { ...rest, quantity }),
      });
      setFormOpen(false);
      reload();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Could not save the product");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteError("");
    try {
      await apiFetch(`/products/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      reload();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete the product");
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: products?.length ?? 0 };
    for (const t of ITEM_TYPES) c[t.value] = products?.filter((p) => p.itemType === t.value).length ?? 0;
    return c;
  }, [products]);
  const rows = products ? products.filter((p) => filter === "all" || p.itemType === filter) : null;
  const stockValue = (rows ?? []).reduce((s, p) => s + p.totalCostValue, 0);

  const columns: Column<Product>[] = [
    {
      key: "name", header: "Product", sortValue: (p) => p.name,
      cell: (p) => (
        <div className="min-w-0">
          <Link href={`/dashboard/inventory/products/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:text-brand-dark">
            {p.name}
          </Link>
          {p.sku && <p className="text-xs text-ink-soft">{p.sku}</p>}
        </div>
      ),
    },
    { key: "type", header: "Type", hideBelow: "md", sortValue: (p) => p.itemType, cell: (p) => <Badge variant={p.itemType === "finished_good" ? "brand" : "default"}>{itemTypeLabel(p.itemType)}</Badge> },
    { key: "stock", header: "On hand", align: "right", sortValue: (p) => p.quantity, cell: (p) => <span className="whitespace-nowrap">{formatQty(p.quantity, p.unit)}</span> },
    { key: "value", header: "Stock value", align: "right", hideBelow: "sm", sortValue: (p) => p.totalCostValue, cell: (p) => format(p.totalCostValue) },
    { key: "cost", header: "Latest cost", align: "right", hideBelow: "lg", sortValue: (p) => p.cost, cell: (p) => <span className="text-ink-soft">{format(p.cost)}</span> },
    { key: "price", header: "Selling price", align: "right", hideBelow: "lg", sortValue: (p) => p.price, cell: (p) => (p.itemType === "finished_good" ? format(p.price) : <span className="text-ink-faint">—</span>) },
    {
      key: "status", header: "Status", sortValue: (p) => stockStatus(p),
      cell: (p) => (
        <span className="inline-flex items-center gap-1.5">
          <StatusBadge status={stockStatus(p)} />
          {p.needsStockCheck && <span title="Needs a stock check"><AlertTriangle size={14} className="text-warning" /></span>}
        </span>
      ),
    },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, align: "right",
      cell: (p) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" onClick={() => openEdit(p)} aria-label={`Edit ${p.name}`}><Pencil size={15} /></Button>
          <Button variant="ghost" size="icon-sm" onClick={() => { setDeleteError(""); setDeleting(p); }} aria-label={`Delete ${p.name}`} className="hover:text-danger"><Trash2 size={15} /></Button>
        </div>
      ),
    },
  ];

  const viewToggle = (
    <div className="flex rounded-xl border border-border-soft bg-surface p-0.5">
      {(["table", "grid"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          aria-label={v === "table" ? "Table view" : "Grid view"}
          aria-pressed={view === v}
          className={`rounded-lg p-1.5 ${view === v ? "bg-brand-light text-brand-dark" : "text-ink-soft hover:text-ink"}`}
        >
          {v === "table" ? <List size={16} /> : <Grid size={16} />}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Raw materials, packaging and finished goods. Stock and value come from stock batches at the selected location."
        actions={<Button onClick={openNew}><Plus size={16} /> Add product</Button>}
      />

      {products?.some((p) => p.needsStockCheck) && (
        <Link href="/dashboard/inventory/stock-check" className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm hover:border-warning/50">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
          <span>
            <span className="font-semibold">{products.filter((p) => p.needsStockCheck).length} product(s) need a stock check.</span>{" "}
            Their recorded stock disagrees with their stock batches.
          </span>
        </Link>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "finished_good", label: "Finished goods", count: counts.finished_good },
            { value: "raw_material", label: "Raw materials", count: counts.raw_material },
            { value: "packaging", label: "Packaging", count: counts.packaging },
          ]}
        />
        <p className="text-sm text-ink-soft">Stock value shown: <span className="font-semibold text-ink tabular-nums">{format(stockValue)}</span></p>
      </div>

      {view === "table" ? (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(p) => p.id}
          searchText={(p) => `${p.name} ${p.sku ?? ""}`}
          searchPlaceholder="Search name or SKU"
          toolbar={viewToggle}
          initialSort={{ key: "name", dir: "asc" }}
          error={loadError}
          onRetry={reload}
          onRowClick={(p) => router.push(`/dashboard/inventory/products/${p.id}`)}
          rowLabel={(p) => `Open ${p.name}`}
          empty={{
            icon: <Package size={22} />,
            title: filter === "all" ? "No products yet" : `No ${itemTypeLabel(filter).toLowerCase()}s yet`,
            description: "Add the raw materials and packaging you buy, and the finished goods you make and sell.",
            action: <Button onClick={openNew}><Plus size={16} /> Add product</Button>,
          }}
        />
      ) : (
        <>
          <div className="flex justify-end">{viewToggle}</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(rows ?? []).map((p) => (
              <Link key={p.id} href={`/dashboard/inventory/products/${p.id}`}>
                <Card className="h-full transition-shadow hover:shadow-raised">
                  <CardContent className="space-y-3 pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{p.name}</p>
                        <p className="text-xs text-ink-soft">{itemTypeLabel(p.itemType)}{p.sku ? ` · ${p.sku}` : ""}</p>
                      </div>
                      <StatusBadge status={stockStatus(p)} />
                    </div>
                    <p className="text-2xl font-bold tabular-nums">{formatQty(p.quantity, p.unit)}</p>
                    <p className="text-sm text-ink-soft">Value {format(p.totalCostValue)}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}

      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.name}` : "New product"}
        className="sm:max-w-xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" form="product-form" isLoading={saving}>{editing ? "Save changes" : "Add product"}</Button>
          </>
        }
      >
        <form id="product-form" onSubmit={save} className="space-y-4">
          <Field label="Name" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" hint={editing && editing.itemType !== form.itemType ? "Its stock value moves to the matching inventory account." : undefined}>
              <Select value={form.itemType} onChange={(e) => setForm({ ...form, itemType: e.target.value as ItemType })}>
                {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Unit">
              <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </Select>
            </Field>
            <Field label="SKU / code">
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </Field>
            <Field label={`Reorder point (${form.unit})`} hint="Alert when stock falls to this level">
              <NumericInput value={form.reorderPoint} onChange={(v) => setForm({ ...form, reorderPoint: v })} />
            </Field>
            <Field label={`Cost per ${form.unit}`} hint={form.itemType === "finished_good" ? "Set automatically by production" : "Updated by each delivery"}>
              <NumericInput value={form.cost} onChange={(v) => setForm({ ...form, cost: v })} />
            </Field>
            {form.itemType === "finished_good" && (
              <Field label={`Selling price per ${form.unit}`}>
                <NumericInput value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
              </Field>
            )}
          </div>
          {!editing && (
            <Field label={`Opening stock (${form.unit})`} hint="Stock you already have, valued at the cost above. After this, stock changes through receiving, production and sales.">
              <NumericInput value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} />
            </Field>
          )}
          <Field label="Description">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          {formError && <p className="text-sm text-danger" role="alert">{formError}</p>}
        </form>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? ""}?`}
        description="Products that have stock history, invoices, purchases or bills of materials can't be deleted."
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>Keep product</Button>
            <Button variant="danger" onClick={confirmDelete}>Delete</Button>
          </>
        }
      >
        {deleteError ? <p className="text-sm text-danger" role="alert">{deleteError}</p> : <p className="text-sm text-ink-soft">This can&apos;t be undone.</p>}
      </Dialog>
    </div>
  );
}
