"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { CheckCircle2, XCircle, DollarSign } from "lucide-react";

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  amountPaid: number;
  notes: string | null;
  dueDate: string | null;
  createdAt: string;
  finalizedAt: string | null;
  customer: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  items: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    product: { name: string; sku: string | null } | null;
  }[];
  payments: {
    id: string;
    amount: number;
    method: string;
    paidAt: string;
    reference: string | null;
  }[];
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState("cash");
  const [payReference, setPayReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ success: boolean; data: Invoice }>(`/invoices/${id}`);
      setInvoice(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Invoice }>(`/invoices/${id}`)
      .then((res) => { if (active) setInvoice(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const finalize = async () => {
    if (!confirm("Finalize this invoice? This will deduct stock and cannot be undone.")) return;
    try {
      await apiFetch(`/invoices/${id}/finalize`, { method: "POST" });
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  };

  const cancel = async () => {
    if (!confirm("Cancel this invoice? Stock will be reversed if it was finalized.")) return;
    try {
      await apiFetch(`/invoices/${id}/cancel`, { method: "POST" });
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await apiFetch(`/invoices/${id}/payment`, {
        method: "POST",
        body: JSON.stringify({
          amount: payAmount,
          method: payMethod,
          reference: payReference || undefined,
        }),
      });
      setShowPayment(false);
      setPayAmount(0);
      setPayReference("");
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8"><Skeleton className="h-96" /></div>;
  if (!invoice) return <div className="p-8 text-neutral-500">Invoice not found.</div>;

  const balance = invoice.total - invoice.amountPaid;
  const statusVariant =
    invoice.status === "paid" ? "success" :
    invoice.status === "partially_paid" ? "info" :
    invoice.status === "overdue" ? "danger" :
    invoice.status === "unpaid" ? "warning" : "default";

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title={invoice.invoiceNumber}
        description={`Created ${new Date(invoice.createdAt).toLocaleDateString()}`}
        actions={
          <div className="flex gap-2">
            {invoice.status === "draft" && (
              <>
                <Button variant="outline" onClick={cancel}>
                  <XCircle className="w-4 h-4 mr-1" /> Cancel
                </Button>
                <Button onClick={finalize}>
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Finalize
                </Button>
              </>
            )}
            {(invoice.status === "unpaid" || invoice.status === "partially_paid" || invoice.status === "overdue") && (
              <>
                <Button variant="outline" onClick={cancel}>
                  <XCircle className="w-4 h-4 mr-1" /> Cancel
                </Button>
                <Button onClick={() => { setPayAmount(balance); setShowPayment(true); }}>
                  <DollarSign className="w-4 h-4 mr-1" /> Record Payment
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="flex items-center gap-3">
        <Badge variant={statusVariant}>{invoice.status.replace("_", " ")}</Badge>
        {invoice.dueDate && (
          <span className="text-sm text-neutral-500">
            Due {new Date(invoice.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Items</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-500 text-left">
                <tr>
                  <th className="px-6 py-3 font-medium">Description</th>
                  <th className="px-6 py-3 font-medium text-right">Qty</th>
                  <th className="px-6 py-3 font-medium text-right">Unit Price</th>
                  <th className="px-6 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {invoice.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-6 py-3">
                      <div className="font-medium">{it.description}</div>
                      {it.product?.sku && (
                        <div className="text-xs text-neutral-500">SKU: {it.product.sku}</div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">{it.quantity}</td>
                    <td className="px-6 py-3 text-right">${it.unitPrice.toFixed(2)}</td>
                    <td className="px-6 py-3 text-right font-medium">${it.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t px-6 py-4 flex justify-end">
              <div className="space-y-1 text-sm min-w-48">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Subtotal</span>
                  <span>${invoice.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Tax</span>
                  <span>${invoice.taxTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-2 border-t">
                  <span>Total</span>
                  <span>${invoice.total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>Paid</span>
                  <span>${invoice.amountPaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-red-600 font-medium">
                  <span>Balance</span>
                  <span>${balance.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
            <CardContent>
              {invoice.customer ? (
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{invoice.customer.firstName} {invoice.customer.lastName}</p>
                  {invoice.customer.email && <p className="text-neutral-500">{invoice.customer.email}</p>}
                  {invoice.customer.phone && <p className="text-neutral-500">{invoice.customer.phone}</p>}
                  {invoice.customer.address && <p className="text-neutral-500">{invoice.customer.address}</p>}
                </div>
              ) : <p className="text-neutral-500">—</p>}
            </CardContent>
          </Card>

          {invoice.payments.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {invoice.payments.map((p) => (
                  <div key={p.id} className="flex justify-between">
                    <div>
                      <p className="font-medium">${p.amount.toFixed(2)}</p>
                      <p className="text-xs text-neutral-500">
                        {p.method} · {new Date(p.paidAt).toLocaleDateString()}
                      </p>
                    </div>
                    {p.reference && <span className="text-xs text-neutral-400">{p.reference}</span>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {invoice.notes && (
            <Card>
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-neutral-600">{invoice.notes}</p></CardContent>
            </Card>
          )}
        </div>
      </div>

      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold">Record Payment</h2>
            </div>
            <form onSubmit={recordPayment} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Amount</label>
                <input
                  type="number" step="0.01" min="0.01" required
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
                <p className="text-xs text-neutral-500 mt-1">Balance: ${balance.toFixed(2)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Method</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white">
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="mobile">Mobile Payment</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Reference (optional)</label>
                <input value={payReference} onChange={(e) => setPayReference(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowPayment(false)}>Cancel</Button>
                <Button type="submit" isLoading={submitting}>Record Payment</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}