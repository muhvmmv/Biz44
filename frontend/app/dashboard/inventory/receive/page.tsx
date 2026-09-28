"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Plus, Trash2, PackagePlus, CheckCircle2 } from "lucide-react";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  cost: number;
  quantity: number;
}

interface Supplier {
  id: string;
  name: string;
}

interface LineItem {
  productId: string;
  quantity: number;
  unitCost: number;
}

export default function ReceiveInventoryPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch<{ success: boolean; data: Product[] }>("/products"),
      apiFetch<{ success: boolean; data: Supplier[] }>("/suppliers"),
    ])
      .then(([pRes, sRes]) => {
        setProducts(pRes.data);
        setSuppliers(sRes.data);
      })
      .catch(console.error);
  }, []);

  const addLine = () => {
    setItems([...items, { productId: "", quantity: 1, unitCost: 0 }]);
  };

  const updateLine = (index: number, updates: Partial<LineItem>) => {
    setItems(items.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  };

  const removeLine = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // When product is selected, autofill the cost from the product's current cost
  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    updateLine(index, {
      productId,
      unitCost: product?.cost || 0,
    });
  };

  const total = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (items.length === 0) {
      setError("Please add at least one product to receive.");
      return;
    }
    if (items.some((it) => !it.productId || it.quantity <= 0)) {
      setError("Each line must have a product and quantity greater than 0.");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/stock/receive", {
        method: "POST",
        body: JSON.stringify({
          items,
          reference: reference || undefined,
          notes: notes || undefined,
          supplierId: supplierId || undefined,
        }),
      });
      setSuccess(true);
      setTimeout(() => router.push("/dashboard/inventory/movements"), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to receive inventory");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-lg mx-auto text-center py-24">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold">Inventory received!</h2>
        <p className="text-neutral-500 mt-2">Redirecting to stock movements...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receive Inventory"
        description="Record stock received from a supplier. Quantities will be updated automatically."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Receiving Details</CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Supplier</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
              >
                <option value="">— Select supplier (optional) —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Reference number</label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. PO-2043"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Products</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="w-4 h-4 mr-1" />
              Add Product
            </Button>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-center py-12 text-neutral-400">
                <PackagePlus className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
                <p>No products added yet.</p>
                <p className="text-sm mt-1">Click &quot;Add Product&quot; to begin.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item, index) => {
                  const selected = products.find((p) => p.id === item.productId);
                  return (
                    <div
                      key={index}
                      className="grid grid-cols-12 gap-3 items-center py-2 border-b last:border-0"
                    >
                      <div className="col-span-5">
                        <label className="block text-xs font-medium text-neutral-500 mb-1">
                          Product
                        </label>
                        <select
                          value={item.productId}
                          onChange={(e) => handleProductSelect(index, e.target.value)}
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                        >
                          <option value="">Select product</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} {p.sku ? `(${p.sku})` : ""}
                            </option>
                          ))}
                        </select>
                        {selected && (
                          <p className="text-xs text-neutral-500 mt-1">
                            Current stock: {selected.quantity}
                          </p>
                        )}
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-neutral-500 mb-1">
                          Qty
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateLine(index, { quantity: Number(e.target.value) })
                          }
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-neutral-500 mb-1">
                          Unit cost
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unitCost}
                          onChange={(e) =>
                            updateLine(index, { unitCost: Number(e.target.value) })
                          }
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-neutral-500 mb-1">
                          Total
                        </label>
                        <p className="py-2 font-medium text-sm">
                          ${(item.quantity * item.unitCost).toFixed(2)}
                        </p>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeLine(index)}
                          className="p-2 text-neutral-400 hover:text-red-600 transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div className="flex justify-end pt-4 border-t">
                  <div className="text-right">
                    <p className="text-sm text-neutral-500">Total value</p>
                    <p className="text-2xl font-bold">${total.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this receipt..."
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </CardContent>
        </Card>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" isLoading={submitting} disabled={items.length === 0}>
            Receive Inventory
          </Button>
        </div>
      </form>
    </div>
  );
}