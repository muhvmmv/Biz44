"use client";

import { useEffect, useState } from "react";
import PaymentAccountSelect from "@/components/ui/PaymentAccountSelect";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import NumericInput from "@/components/ui/NumericInput";
import { Plus, Trash2, PackagePlus, CheckCircle2 } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

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
  const { format } = useCurrency();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<
    "paid" | "unpaid" | "partially_paid"
  >("paid");
  const [partialAmount, setPartialAmount] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
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

  const addLine = () =>
    setItems([...items, { productId: "", quantity: 1, unitCost: 0 }]);

  const updateLine = (index: number, updates: Partial<LineItem>) =>
    setItems(items.map((item, i) => (i === index ? { ...item, ...updates } : item)));

  const removeLine = (index: number) =>
    setItems(items.filter((_, i) => i !== index));

  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    updateLine(index, { productId, unitCost: product?.cost || 0 });
  };

  const total = items.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0
  );
  const amountPaid =
    paymentStatus === "paid"
      ? total
      : paymentStatus === "unpaid"
      ? 0
      : Math.min(partialAmount, total);
  const outstanding = total - amountPaid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (items.length === 0) {
      setError("Please add at least one product.");
      return;
    }
    if (items.some((it) => !it.productId || it.quantity <= 0 || it.unitCost <= 0)) {
      setError("Each line needs a product, quantity and cost greater than 0.");
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
          paymentStatus,
          dueDate: paymentStatus !== "paid" && dueDate ? dueDate : undefined,
          amountPaid: paymentStatus === "partially_paid" ? partialAmount : undefined,
          paymentAccountId: paymentStatus === "unpaid" ? undefined : paymentAccountId,
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
        <div className="w-16 h-16 rounded-full bg-[#E6F0EA] flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-success" />
        </div>
        <h2 className="text-2xl font-bold text-ink">Inventory received!</h2>
        <p className="text-ink-soft mt-2">Redirecting to stock movements...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receive Inventory"
        description="Record stock received. Unit cost is your cost to acquire or produce one unit."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Receiving Details</CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-charcoal">Supplier</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
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
              <label className="block text-sm font-medium mb-1 text-charcoal">
                Reference / Receipt number
              </label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. PO-2043"
                className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Products</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="w-4 h-4 mr-1" /> Add Product
            </Button>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-center py-12 text-ink-soft">
                <PackagePlus className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>No products added yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item, index) => {
                  const selected = products.find((p) => p.id === item.productId);
                  return (
                    <div
                      key={index}
                      className="grid grid-cols-12 gap-3 items-start py-2 border-b border-border-soft last:border-0"
                    >
                      <div className="col-span-4">
                        <label className="block text-xs font-medium text-ink-soft mb-1">
                          Product
                        </label>
                        <select
                          value={item.productId}
                          onChange={(e) => handleProductSelect(index, e.target.value)}
                          className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                        >
                          <option value="">Select product</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                              {p.sku ? ` (${p.sku})` : ""}
                            </option>
                          ))}
                        </select>
                        {selected && (
                          <p className="text-xs text-ink-soft mt-1">
                            Current stock: {selected.quantity}
                          </p>
                        )}
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-ink-soft mb-1">
                          Quantity
                        </label>
                        <NumericInput
                         
                          min={1}
                          value={item.quantity}
                          onChange={(v) => updateLine(index, { quantity: v })}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-ink-soft mb-1">
                          Unit cost
                        </label>
                        <NumericInput
                          min={0}
                          value={item.unitCost}
                          onChange={(v) => updateLine(index, { unitCost: v })}
                        />
                      </div>
                      <div className="col-span-3">
                        <label className="block text-xs font-medium text-ink-soft mb-1">
                          Total
                        </label>
                        <p className="py-2 font-medium text-sm text-ink">
                          {format(item.quantity * item.unitCost)}
                        </p>
                      </div>
                      <div className="col-span-1 flex justify-end pt-5">
                        <button
                          type="button"
                          onClick={() => removeLine(index)}
                          className="p-2 text-ink-soft hover:text-danger"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-charcoal">
                  Payment status
                </label>
                <select
                  value={paymentStatus}
                  onChange={(e) =>
                    setPaymentStatus(
                      e.target.value as "paid" | "unpaid" | "partially_paid"
                    )
                  }
                  className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="paid">Paid in full</option>
                  <option value="unpaid">Unpaid (on credit)</option>
                  <option value="partially_paid">Partially paid</option>
                </select>
              </div>
              {paymentStatus === "partially_paid" && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-charcoal">
                    Amount paid
                  </label>
                  <NumericInput
                    min={0}
                    max={total}
                    value={partialAmount}
                    onChange={setPartialAmount}
                  />
                </div>
              )}
              {paymentStatus !== "paid" && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-charcoal">
                    Pay supplier by
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                  <p className="text-xs text-ink-soft mt-1">Shown as overdue in Payables and alerts after this date.</p>
                </div>
              )}
              {paymentStatus !== "unpaid" && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-charcoal">
                    Paid from
                  </label>
                  <PaymentAccountSelect value={paymentAccountId} onChange={setPaymentAccountId} />
                </div>
              )}
            </div>

            <div className="border-t border-border-soft pt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-soft">Inventory value received</span>
                <span className="font-medium text-ink">{format(total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Amount paid</span>
                <span className="font-medium text-ink">{format(amountPaid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Outstanding (owed to supplier)</span>
                <span
                  className={`font-medium ${
                    outstanding > 0 ? "text-warning" : "text-ink"
                  }`}
                >
                  {format(outstanding)}
                </span>
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
              placeholder="Optional notes..."
              className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </CardContent>
        </Card>

        {error && (
          <div className="bg-[#F4E2E1] border border-danger text-danger px-4 py-3 rounded-lg text-sm">
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