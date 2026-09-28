"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Plus, Trash2 } from "lucide-react";

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  quantity: number;
}

interface LineItem {
  productId: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export default function NewInvoicePage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Customer mode: existing or new
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [customerId, setCustomerId] = useState("");
  const [adhoc, setAdhoc] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });

  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { productId: "", description: "", quantity: 1, unitPrice: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch<{ success: boolean; data: Customer[] }>("/customers"),
      apiFetch<{ success: boolean; data: Product[] }>("/products"),
    ]).then(([c, p]) => {
      setCustomers(c.data);
      setProducts(p.data);
    });
  }, []);

  const updateItem = (idx: number, updates: Partial<LineItem>) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...updates } : it)));
  };

  const handleProductChange = (idx: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (product) {
      updateItem(idx, {
        productId,
        description: product.name,
        unitPrice: product.price,
      });
    } else {
      updateItem(idx, { productId });
    }
  };

  const addLine = () => {
    setItems([
      ...items,
      { productId: "", description: "", quantity: 1, unitPrice: 0 },
    ]);
  };

  const removeLine = (idx: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const subtotal = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const total = subtotal;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (customerMode === "existing" && !customerId) {
      setError("Please select a customer");
      return;
    }
    if (customerMode === "new" && !adhoc.name.trim()) {
      setError("Please enter a customer name");
      return;
    }
    if (items.some((it) => it.quantity <= 0 || it.unitPrice < 0)) {
      setError("Check quantities and prices");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ success: boolean; data: { id: string } }>(
        "/invoices",
        {
          method: "POST",
          body: JSON.stringify({
            customerId: customerMode === "existing" ? customerId : null,
            customerName: customerMode === "new" ? adhoc.name : null,
            customerEmail: customerMode === "new" ? adhoc.email : null,
            customerPhone: customerMode === "new" ? adhoc.phone : null,
            customerAddress: customerMode === "new" ? adhoc.address : null,
            dueDate: dueDate || undefined,
            notes: notes || undefined,
            items: items.map((it) => ({
              productId: it.productId || null,
              description: it.description,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
            })),
          }),
        }
      );
      router.push(`/dashboard/invoices/${res.data.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Invoice"
        description="Create a draft invoice. You can finalize it later to deduct stock."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Customer & Dates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Customer mode toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCustomerMode("existing")}
                className={`px-4 py-2 text-sm rounded-lg border transition ${
                  customerMode === "existing"
                    ? "border-brand-500 bg-brand-50 text-brand-700 font-medium"
                    : "border-neutral-200 text-neutral-600 hover:border-brand-300"
                }`}
              >
                Existing customer
              </button>
              <button
                type="button"
                onClick={() => setCustomerMode("new")}
                className={`px-4 py-2 text-sm rounded-lg border transition ${
                  customerMode === "new"
                    ? "border-brand-500 bg-brand-50 text-brand-700 font-medium"
                    : "border-neutral-200 text-neutral-600 hover:border-brand-300"
                }`}
              >
                New (one-time)
              </button>
            </div>

            {customerMode === "existing" ? (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Customer *
                </label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                  required
                >
                  <option value="">Select customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </select>
                {customers.length === 0 && (
                  <p className="text-xs text-neutral-500 mt-1">
                    No customers yet — switch to &quot;New (one-time)&quot; to enter details manually.
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Name *
                  </label>
                  <input
                    value={adhoc.name}
                    onChange={(e) => setAdhoc({ ...adhoc, name: e.target.value })}
                    placeholder="Customer name"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={adhoc.email}
                    onChange={(e) => setAdhoc({ ...adhoc, email: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Phone</label>
                  <input
                    value={adhoc.phone}
                    onChange={(e) => setAdhoc({ ...adhoc, phone: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Address
                  </label>
                  <input
                    value={adhoc.address}
                    onChange={(e) => setAdhoc({ ...adhoc, address: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <p className="sm:col-span-2 text-xs text-neutral-500">
                  This customer won&apos;t be saved. To save them, add them from{" "}
                  <a href="/dashboard/customers" className="text-brand-600 hover:underline">
                    Customers
                  </a>
                  .
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">
                Due date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLine}
            >
              <Plus className="w-4 h-4 mr-1" /> Add Line
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {items.map((item, idx) => {
                const product = products.find((p) => p.id === item.productId);
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-3 items-start py-2 border-b last:border-0"
                  >
                    <div className="col-span-4">
                      <label className="block text-xs font-medium text-neutral-500 mb-1">
                        Product
                      </label>
                      <select
                        value={item.productId}
                        onChange={(e) => handleProductChange(idx, e.target.value)}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                      >
                        <option value="">Custom item</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — stock: {p.quantity}
                          </option>
                        ))}
                      </select>
                      {product && (
                        <p
                          className={`text-xs mt-1 ${
                            product.quantity < item.quantity
                              ? "text-red-600"
                              : "text-neutral-500"
                          }`}
                        >
                          Available: {product.quantity}
                        </p>
                      )}
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-medium text-neutral-500 mb-1">
                        Description
                      </label>
                      <input
                        value={item.description}
                        onChange={(e) =>
                          updateItem(idx, { description: e.target.value })
                        }
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs font-medium text-neutral-500 mb-1">
                        Qty
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(idx, { quantity: Number(e.target.value) })
                        }
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-neutral-500 mb-1">
                        Unit Price
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unitPrice}
                        onChange={(e) =>
                          updateItem(idx, { unitPrice: Number(e.target.value) })
                        }
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="col-span-1 pt-6">
                      <p className="text-sm font-medium">
                        ${(item.quantity * item.unitPrice).toFixed(2)}
                      </p>
                    </div>
                    <div className="col-span-1 pt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="p-2 text-neutral-400 hover:text-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-6 border-t mt-4">
              <div className="text-right space-y-1">
                <p className="text-sm text-neutral-500">
                  Subtotal:{" "}
                  <span className="font-medium text-neutral-900">
                    ${subtotal.toFixed(2)}
                  </span>
                </p>
                <p className="text-xl font-bold">Total: ${total.toFixed(2)}</p>
              </div>
            </div>
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
              placeholder="Optional notes for the customer..."
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
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" isLoading={submitting}>
            Save Draft
          </Button>
        </div>
      </form>
    </div>
  );
}