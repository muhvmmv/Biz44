"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import { Plus, Pencil, Trash2, Package, Grid, List } from "lucide-react";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  price: number;
  cost: number;
  quantity: number;
  reorderPoint: number;
}

type View = "table" | "grid";

export default function ProductsPage() {
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
      .then((res) => { if (active) setProducts(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", sku: "", description: "", price: 0, cost: 0, quantity: 0, reorderPoint: 0 });
    setShowForm(true);
  };

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
        await apiFetch(`/products/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/products", { method: "POST", body: JSON.stringify(payload) });
      }
      setShowForm(false);
      reload();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    try {
      await apiFetch(`/products/${id}`, { method: "DELETE" });
      reload();
    } catch (err) { console.error(err); }
  };

  const filtered = products.filter((p) =>
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
            <div className="flex rounded-lg border border-neutral-300 bg-white overflow-hidden">
              <button
                onClick={() => setView("table")}
                className={`p-2 ${view === "table" ? "bg-brand-50 text-brand-700" : "text-neutral-500"}`}
              >
                <List size={16} />
              </button>
              <button
                onClick={() => setView("grid")}
                className={`p-2 ${view === "grid" ? "bg-brand-50 text-brand-700" : "text-neutral-500"}`}
              >
                <Grid size={16} />
              </button>
            </div>
            <Button onClick={openNew}>
              <Plus className="w-4 h-4 mr-1" />
              Add Product
            </Button>
          </div>
        }
      />

      <input
        type="text"
        placeholder="Search products by name or SKU..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:w-80 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
            <p className="text-neutral-500">No products yet.</p>
            <Button onClick={openNew} className="mt-4">Add your first product</Button>
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
                    <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600">
                      <Package size={20} />
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <h3 className="font-semibold text-neutral-900 truncate">{p.name}</h3>
                  {p.sku && <p className="text-xs text-neutral-500 mt-0.5">SKU: {p.sku}</p>}
                  <p className="text-2xl font-bold mt-3">{p.quantity} <span className="text-sm font-normal text-neutral-500">units</span></p>
                  <div className="flex justify-between mt-3 text-sm">
                    <div>
                      <p className="text-neutral-500 text-xs">Cost</p>
                      <p className="font-medium">${p.cost.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-neutral-500 text-xs">Selling</p>
                      <p className="font-medium">${p.price.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4 pt-3 border-t">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)} className="flex-1">
                      <Pencil size={14} className="mr-1" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)} className="text-red-600 hover:bg-red-50">
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
                <thead className="bg-neutral-50 text-neutral-500 text-left">
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
                <tbody className="divide-y divide-neutral-100">
                  {filtered.map((p) => {
                    const status = stockStatus(p);
                    return (
                      <tr key={p.id} className="hover:bg-neutral-50">
                        <td className="px-6 py-4 font-medium">{p.name}</td>
                        <td className="px-6 py-4 text-neutral-500">{p.sku || "—"}</td>
                        <td className="px-6 py-4">${p.cost.toFixed(2)}</td>
                        <td className="px-6 py-4">${p.price.toFixed(2)}</td>
                        <td className="px-6 py-4">{p.quantity}</td>
                        <td className="px-6 py-4">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button onClick={() => openEdit(p)} className="p-1 text-neutral-400 hover:text-brand-600">
                              <Pencil size={16} />
                            </button>
                            <button onClick={() => handleDelete(p.id)} className="p-1 text-neutral-400 hover:text-red-600">
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold">{editing ? "Edit Product" : "New Product"}</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input required className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">SKU</label>
                  <input className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Reorder level</label>
                  <input type="number" min="0" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    value={form.reorderPoint} onChange={(e) => setForm({ ...form, reorderPoint: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Cost price</label>
                  <input type="number" step="0.01" min="0" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Selling price</label>
                  <input type="number" step="0.01" min="0" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
                </div>
              </div>
              {!editing && (
                <div>
                  <label className="block text-sm font-medium mb-1">Initial quantity</label>
                  <input type="number" min="0" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea rows={2} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit">{editing ? "Update" : "Create"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}