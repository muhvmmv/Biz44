"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import NumericInput from "@/components/ui/NumericInput";
import {
  CheckCircle2,
  XCircle,
  DollarSign,
  Printer,
  ArrowLeft,
} from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

interface Business {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
}

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
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
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
  const { format } = useCurrency();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);

  const [showPayment, setShowPayment] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState("cash");
  const [payReference, setPayReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [invRes, bizRes] = await Promise.all([
      apiFetch<{ success: boolean; data: Invoice }>(`/invoices/${id}`),
      apiFetch<{ success: boolean; data: Business }>("/settings/company"),
    ]);
    setInvoice(invRes.data);
    setBusiness(bizRes.data);
  }, [id]);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ success: boolean; data: Invoice }>(`/invoices/${id}`),
      apiFetch<{ success: boolean; data: Business }>("/settings/company"),
    ])
      .then(([invRes, bizRes]) => {
        if (!active) return;
        setInvoice(invRes.data);
        setBusiness(bizRes.data);
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const finalize = async () => {
    if (
      !confirm(
        "Finalize this invoice? This will deduct stock and cannot be undone."
      )
    )
      return;
    try {
      await apiFetch(`/invoices/${id}/finalize`, { method: "POST" });
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  };

  const cancel = async () => {
    if (
      !confirm(
        "Cancel this invoice? Stock will be reversed if it was finalized."
      )
    )
      return;
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

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-8 text-ink-soft">
        <p>Invoice not found.</p>
        <Link href="/dashboard/invoices">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Invoices
          </Button>
        </Link>
      </div>
    );
  }

  const balance = invoice.total - invoice.amountPaid;
  const statusVariant =
    invoice.status === "paid"
      ? "success"
      : invoice.status === "partially_paid"
      ? "info"
      : invoice.status === "overdue"
      ? "danger"
      : invoice.status === "unpaid"
      ? "warning"
      : "default";

  const customerDisplay = invoice.customer
    ? {
        name: `${invoice.customer.firstName} ${invoice.customer.lastName}`.trim(),
        email: invoice.customer.email,
        phone: invoice.customer.phone,
        address: invoice.customer.address,
      }
    : {
        name: invoice.customerName || "Walk-in customer",
        email: invoice.customerEmail,
        phone: invoice.customerPhone,
        address: invoice.customerAddress,
      };

  const businessName = business?.name || "Your Business";
  const businessAddress = business?.address;
  const businessPhone = business?.phone;
  const businessEmail = business?.email;
  const businessCountry = business?.country;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="no-print">
        <PageHeader
          title={invoice.invoiceNumber}
          description={`Created ${new Date(invoice.createdAt).toLocaleDateString()}`}
          actions={
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-1" /> Print
              </Button>
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
              {["unpaid", "partially_paid", "overdue"].includes(invoice.status) && (
                <>
                  <Button variant="outline" onClick={cancel}>
                    <XCircle className="w-4 h-4 mr-1" /> Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      setPayAmount(balance);
                      setShowPayment(true);
                    }}
                  >
                    <DollarSign className="w-4 h-4 mr-1" /> Record Payment
                  </Button>
                </>
              )}
            </div>
          }
        />
      </div>

      <div className="print-area bg-white rounded-xl border border-border-soft shadow-sm p-8 sm:p-12">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 pb-8 border-b border-border-soft">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-rose-vale flex items-center justify-center text-white font-extrabold">
                {businessName.charAt(0).toUpperCase()}
              </div>
              <h2 className="text-2xl font-bold text-navy">{businessName}</h2>
            </div>
            <div className="text-sm text-ink-soft space-y-0.5">
              {businessAddress && <p>{businessAddress}</p>}
              {businessCountry && <p>{businessCountry}</p>}
              {businessPhone && <p>{businessPhone}</p>}
              {businessEmail && <p>{businessEmail}</p>}
            </div>
          </div>

          <div className="sm:text-right">
            <h1 className="text-3xl font-extrabold tracking-tight text-navy">
              INVOICE
            </h1>
            <p className="text-lg font-bold text-ink mt-1">
              {invoice.invoiceNumber}
            </p>
            <div className="mt-3 text-sm text-ink-soft space-y-0.5">
              <p>
                <span className="text-ink-soft">Date:</span>{" "}
                <span className="text-ink">
                  {new Date(invoice.createdAt).toLocaleDateString()}
                </span>
              </p>
              {invoice.dueDate && (
                <p>
                  <span className="text-ink-soft">Due:</span>{" "}
                  <span className="text-ink">
                    {new Date(invoice.dueDate).toLocaleDateString()}
                  </span>
                </p>
              )}
              <p className="pt-2">
                <Badge variant={statusVariant}>
                  {invoice.status.replace("_", " ")}
                </Badge>
              </p>
            </div>
          </div>
        </div>

        <div className="py-8">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">
            Bill To
          </p>
          <div className="text-sm space-y-0.5">
            <p className="font-semibold text-ink text-base">
              {customerDisplay.name}
            </p>
            {customerDisplay.phone && (
              <p className="text-ink-soft">{customerDisplay.phone}</p>
            )}
            {customerDisplay.email && (
              <p className="text-ink-soft">{customerDisplay.email}</p>
            )}
            {customerDisplay.address && (
              <p className="text-ink-soft">{customerDisplay.address}</p>
            )}
          </div>
        </div>

        <div className="border border-border-soft rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ivory text-ink-soft text-left">
              <tr>
                <th className="px-5 py-3 font-semibold">Description</th>
                <th className="px-5 py-3 font-semibold text-right">Qty</th>
                <th className="px-5 py-3 font-semibold text-right">Unit Price</th>
                <th className="px-5 py-3 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {invoice.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-5 py-4">
                    <div className="font-medium text-ink">{it.description}</div>
                    {it.product?.sku && (
                      <div className="text-xs text-ink-soft mt-0.5">
                        SKU: {it.product.sku}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right text-ink">{it.quantity}</td>
                  <td className="px-5 py-4 text-right text-ink">
                    {format(it.unitPrice)}
                  </td>
                  <td className="px-5 py-4 text-right font-medium text-ink">
                    {format(it.total)}
                  </td>
                </tr>
              ))}
              {invoice.items.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-8 text-center text-ink-soft"
                  >
                    No items
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mt-6">
          <div className="w-full sm:w-72 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-soft">Subtotal</span>
              <span className="text-ink">{format(invoice.subtotal)}</span>
            </div>
            {invoice.discountTotal > 0 && (
              <div className="flex justify-between">
                <span className="text-ink-soft">Discount</span>
                <span className="text-danger">
                  − {format(invoice.discountTotal)}
                </span>
              </div>
            )}
            {invoice.taxTotal > 0 && (
              <div className="flex justify-between">
                <span className="text-ink-soft">Tax</span>
                <span className="text-ink">{format(invoice.taxTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-3 border-t border-border-soft text-navy">
              <span>Total</span>
              <span>{format(invoice.total)}</span>
            </div>
            {invoice.amountPaid > 0 && (
              <div className="flex justify-between text-success">
                <span>Paid</span>
                <span>− {format(invoice.amountPaid)}</span>
              </div>
            )}
            {balance > 0 && (
              <div className="flex justify-between text-danger font-medium">
                <span>Balance Due</span>
                <span>{format(balance)}</span>
              </div>
            )}
          </div>
        </div>

        {invoice.payments.length > 0 && (
          <div className="mt-10 pt-6 border-t border-border-soft">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-3">
              Payment History
            </p>
            <table className="w-full text-sm">
              <thead className="text-ink-soft text-left">
                <tr>
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Method</th>
                  <th className="py-2 font-medium">Reference</th>
                  <th className="py-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {invoice.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 text-ink-soft">
                      {new Date(p.paidAt).toLocaleDateString()}
                    </td>
                    <td className="py-2 text-ink capitalize">
                      {p.method.replace("_", " ")}
                    </td>
                    <td className="py-2 text-ink-soft">{p.reference || "—"}</td>
                    <td className="py-2 text-right font-medium text-ink">
                      {format(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {invoice.notes && (
          <div className="mt-10 pt-6 border-t border-border-soft">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">
              Notes
            </p>
            <p className="text-sm text-ink-soft whitespace-pre-wrap">
              {invoice.notes}
            </p>
          </div>
        )}

        <div className="mt-12 pt-6 border-t border-border-soft text-center text-sm text-ink-soft">
          <p>Thank you for your business.</p>
        </div>
      </div>

      {showPayment && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-border-soft">
            <div className="p-6 border-b border-border-soft">
              <h2 className="text-lg font-bold text-navy">Record Payment</h2>
            </div>
            <form onSubmit={recordPayment} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-navy">
                  Amount
                </label>
                <NumericInput
                  min={0.01}
                  max={balance}
                  value={payAmount}
                  onChange={setPayAmount}
                  required
                />
                <p className="text-xs text-ink-soft mt-1">
                  Balance: {format(balance)}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-navy">
                  Method
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rose-vale"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="mobile">Mobile Payment</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-navy">
                  Reference (optional)
                </label>
                <input
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rose-vale"
                />
              </div>
              {error && <p className="text-danger text-sm">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPayment(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={submitting}>
                  Record Payment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}