"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import NumericInput from "@/components/ui/NumericInput";
import { Plus, Pencil, Trash2, Package, Grid, List, AlertTriangle } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import { useOpenOnQuery } from "@/hooks/useOpenOnQuery";
import { useLocationVersion } from "@/hooks/useLocationRefetch";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  price: number;
  cost: number;
  quantity: number;
  reorderPoint: number;
  needsStockCheck?: boolean;
}

type View = "table" | "grid";

export default function ProductsPage() {
  const { format } = useCurrency();
  const version = useLocationVersion();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [view, setView] = useState<View>("table");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    sku: "",
    description: "",
    price: 0,
    cost: 0,
    quantity: 0,
    reorderPoint: 0,
  });

  const reload = () => {
    apiFetch<{ success: boolean; data: Product[] }>("/products")
      .then((res) => setProducts(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Product[] }>("/products")
      .then((res) => {
        if (active) setProducts(res.data);
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [version]);

  const openNew = () => {
    setEditing(null);
    setForm({
      name: "",
      sku: "",
      description: "",
      price: 0,
      cost: 0,
      quantity: 0,
      reorderPoint: 0,
    });
    setShowForm(true);
  };
  useOpenOnQuery("new", openNew);

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      sku: p.sku || "",
      description: p.description || "",
      price: p.price,
      cost: p.cost,
      quantity: p.quantity,
      reorderPoint: p.reorderPoint,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      price: Number(form.price),
      cost: Number(form.cost),
      quantity: Number(form.quantity),
      reorderPoint: Number(form.reorderPoint),
    };
    try {
      if (editing) {
        await apiFetch(`/products/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setShowForm(false);
      reload();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    try {
      await apiFetch(`/products/${id}`, { method: "DELETE" });
      reload();
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku || "").toLowerCase().includes(search.toLowerCase())
  );

  const stockStatus = (p: Product) => {
    if (p.quantity === 0) return { label: "Out of Stock", variant: "danger" as const };
    if (p.quantity <= p.reorderPoint) return { label: "Low Stock", variant: "warning" as const };
    return { label: "In Stock", variant: "success" as const };
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Manage your product catalog and inventory."
        actions={
          <div className="flex gap-2">
            <div className="flex rounded-lg border border-border-soft bg-white overflow-hidden">
              <button
                onClick={() => setView("table")}
                className={`p-2 ${view === "table" ? "bg-brand-light text-brand-dark" : "text-ink-soft"}`}
              >
                <List size={16} />
              </button>
              <button
                onClick={() => setView("grid")}
                className={`p-2 ${view === "grid" ? "bg-brand-light text-brand-dark" : "text-ink-soft"}`}
              >
                <Grid size={16} />
              </button>
            </div>
            <Button onClick={openNew}>
              <Plus className="w-4 h-4 mr-1" /> Add Product
            </Button>
          </div>
        }
      />

      {products.some((p) => p.needsStockCheck) && (
        <Link
          href="/dashboard/inventory/stock-check"
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-ink hover:border-amber-300"
        >
          <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">
              {products.filter((p) => p.needsStockCheck).length} product(s) need a stock check.
            </span>{" "}
            Their recorded stock disagrees with their stock batches. Open Stock Check to fix them.
          </span>
        </Link>
      )}

      <input
        type="text"
        placeholder="Search products by name or SKU..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:w-80 rounded-lg border border-border-soft bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-brand"
      />

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-ink-soft">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p>No products yet.</p>
            <Button onClick={openNew} className="mt-4">
              Add your first product
            </Button>
          </CardContent>
        </Card>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p) => {
            const status = stockStatus(p);
            return (
              <Card key={p.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div className="w-10 h-10 rounded-lg bg-brand-light flex items-center justify-center text-brand-dark">
                      <Package size={20} />
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <h3 className="font-semibold text-ink truncate">
                    <Link
                      href={`/dashboard/inventory/products/${p.id}`}
                      className="hover:text-brand-dark"
                    >
                      {p.name}
                    </Link>
                  </h3>
                  {p.sku && <p className="text-xs text-ink-soft mt-0.5">SKU: {p.sku}</p>}
                  <p className="text-2xl font-bold mt-3 text-ink">
                    {p.quantity}{" "}
                    <span className="text-sm font-normal text-ink-soft">units</span>
                  </p>
                  <div className="flex justify-between mt-3 text-sm">
                    <div>
                      <p className="text-ink-soft text-xs">Cost</p>
                      <p className="font-medium text-ink">{format(p.cost)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-ink-soft text-xs">Selling</p>
                      <p className="font-medium text-ink">{format(p.price)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4 pt-3 border-t border-border-soft">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(p)}
                      className="flex-1"
                    >
                      <Pencil size={14} className="mr-1" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(p.id)}
                      className="text-danger hover:bg-[#F4E2E1]"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ivory text-ink-soft text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Product</th>
                    <th className="px-6 py-3 font-medium">SKU</th>
                    <th className="px-6 py-3 font-medium">Cost</th>
                    <th className="px-6 py-3 font-medium">Price</th>
                    <th className="px-6 py-3 font-medium">Stock</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {filtered.map((p) => {
                    const status = stockStatus(p);
                    return (
                      <tr key={p.id} className="hover:bg-ivory">
                        <td className="px-6 py-4 font-medium text-ink">
                          <Link
                            href={`/dashboard/inventory/products/${p.id}`}
                            className="hover:text-brand-dark"
                          >
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-ink-soft">{p.sku || "—"}</td>
                        <td className="px-6 py-4 text-ink">{format(p.cost)}</td>
                        <td className="px-6 py-4 text-ink">{format(p.price)}</td>
                        <td className="px-6 py-4 text-ink">{p.quantity}</td>
                        <td className="px-6 py-4">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEdit(p)}
                              className="p-1 text-ink-soft hover:text-brand-dark"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(p.id)}
                              className="p-1 text-ink-soft hover:text-danger"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-border-soft">
            <div className="p-6 border-b border-border-soft">
              <h2 className="text-lg font-bold text-charcoal">
                {editing ? "Edit Product" : "New Product"}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-charcoal">Name *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-charcoal">SKU</label>
                  <input
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-charcoal">Reorder level</label>
                  <NumericInput
                    allowDecimals={false}
                    min={0}
                    value={form.reorderPoint}
                    onChange={(v) => setForm({ ...form, reorderPoint: v })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-charcoal">Cost price</label>
                  <NumericInput
                    min={0}
                    value={form.cost}
                    onChange={(v) => setForm({ ...form, cost: v })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-charcoal">Selling price</label>
                  <NumericInput
                    min={0}
                    value={form.price}
                    onChange={(v) => setForm({ ...form, price: v })}
                  />
                </div>
              </div>
              {!editing && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-charcoal">
                    Initial quantity
                  </label>
                  <NumericInput
                    allowDecimals={false}
                    min={0}
                    value={form.quantity}
                    onChange={(v) => setForm({ ...form, quantity: v })}
                  />
                  <p className="text-xs text-ink-soft mt-1">
                    Booked as opening stock at the cost price. After this, change stock through Receive Inventory.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1 text-charcoal">Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">{editing ? "Update" : "Create"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}