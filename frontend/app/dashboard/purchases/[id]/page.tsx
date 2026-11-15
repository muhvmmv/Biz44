"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Wallet, Undo2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import NumericInput from "@/components/ui/NumericInput";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useCurrency } from "@/hooks/useCurrency";
import PaymentAccountSelect from "@/components/ui/PaymentAccountSelect";
import Dialog from "@/components/ui/Dialog";

interface PurchaseDetail {
  id: string;
  reference: string | null;
  date: string;
  dueDate: string | null;
  subtotal: number;
  taxTotal?: number;
  total: number;
  amountPaid: number;
  returnedAmount: number;
  status: string;
  notes: string | null;
  supplier: { id: string; name: string; email: string | null; phone: string | null } | null;
  items: {
    id: string;
    quantity: number;
    unitCost: number;
    total: number;
    product: { name: string; sku: string | null };
  }[];
  payments: {
    id: string;
    amount: number;
    method: string;
    account: string;
    reference: string | null;
    paidAt: string;
  }[];
  batches: {
    id: string;
    productId: string;
    quantityReceived: number;
    quantityRemaining: number;
    unitCost: number;
    product: { name: string };
  }[];
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  pos: "POS / Card",
  on_receipt: "Paid on receipt",
  refund: "Refund from supplier",
};

const statusVariant = (s: string): "success" | "warning" | "danger" | "info" | "default" => {
  if (s === "paid") return "success";
  if (s === "partially_paid") return "info";
  if (s === "overdue") return "danger";
  if (s === "unpaid") return "warning";
  return "default";
};

const inputClass =
  "w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand";

export default function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { format } = useCurrency();

  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [amount, setAmount] = useState(0);
  const [accountId, setAccountId] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");

  const [returnBatch, setReturnBatch] = useState<PurchaseDetail["batches"][number] | null>(null);
  const [returnQty, setReturnQty] = useState(0);
  const [refundAccountId, setRefundAccountId] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState("");

  const fetchPurchase = useCallback(
    () => apiFetch<{ success: boolean; data: PurchaseDetail }>(`/purchases/${id}`).then((r) => r.data),
    [id]
  );

  useEffect(() => {
    let active = true;
    fetchPurchase()
      .then((data) => {
        if (active) setPurchase(data);
      })
      .catch((err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err.message : "Failed to load purchase");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchPurchase]);

  const balance = purchase
    ? Math.round((purchase.total - purchase.amountPaid - (purchase.returnedAmount || 0)) * 100) / 100
    : 0;
  const returnValue = returnBatch ? Math.round(returnQty * returnBatch.unitCost * 100) / 100 : 0;
  const refundDue = Math.max(0, Math.round((returnValue - Math.max(0, balance)) * 100) / 100);

  const openReturn = (b: PurchaseDetail["batches"][number]) => {
    setReturnBatch(b);
    setReturnQty(0);
    setReturnNotes("");
    setReturnError("");
  };

  const submitReturn = async () => {
    if (!returnBatch) return;
    setReturnError("");
    if (returnQty <= 0) return setReturnError("Enter how many units to return.");
    if (returnQty > returnBatch.quantityRemaining) {
      return setReturnError(`Only ${returnBatch.quantityRemaining} from this delivery are still in stock.`);
    }
    setReturning(true);
    try {
      await apiFetch(`/purchases/${id}/return`, {
        method: "POST",
        body: JSON.stringify({
          batchId: returnBatch.id,
          quantity: returnQty,
          refundAccountId: refundDue > 0 ? refundAccountId : undefined,
          notes: returnNotes || undefined,
        }),
      });
      setReturnBatch(null);
      setPurchase(await fetchPurchase());
    } catch (err: unknown) {
      setReturnError(err instanceof Error ? err.message : "Return failed");
    } finally {
      setReturning(false);
    }
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayError("");
    if (amount <= 0) return setPayError("Enter an amount greater than 0.");
    if (amount > balance + 0.01) return setPayError(`Amount exceeds the balance of ${format(balance)}.`);
    if (!accountId) return setPayError("Choose the account the payment is made from.");

    setPaying(true);
    try {
      await apiFetch(`/purchases/${id}/pay`, {
        method: "POST",
        body: JSON.stringify({ amount, accountId, method, reference: reference || undefined }),
      });
      setAmount(0);
      setReference("");
      setPurchase(await fetchPurchase());
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (loadError || !purchase) {
    return (
      <div className="py-24 text-center text-ink-soft">
        <p>{loadError || "Purchase not found."}</p>
        <Link href="/dashboard/purchases" className="text-brand-dark hover:underline text-sm mt-2 inline-block">
          Back to purchases
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/purchases"
        className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"
      >
        <ArrowLeft size={16} /> Purchases
      </Link>

      <PageHeader
        title={purchase.reference || "Purchase"}
        description={`${purchase.supplier?.name || "No supplier"} · ${new Date(purchase.date).toLocaleDateString()}`}
        actions={<Badge variant={statusVariant(purchase.status)}>{purchase.status.replace("_", " ")}</Badge>}
      />

      <div className={`grid grid-cols-1 gap-4 ${purchase.returnedAmount > 0 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-ink-soft">Total</p>
            <p className="text-2xl font-bold mt-1 text-ink">{format(purchase.total)}</p>
            {(purchase.taxTotal ?? 0) > 0 && (
              <p className="text-xs text-ink-soft mt-1">Goods {format(purchase.subtotal)} + VAT {format(purchase.taxTotal ?? 0)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-ink-soft">Paid</p>
            <p className="text-2xl font-bold mt-1 text-success">{format(purchase.amountPaid)}</p>
          </CardContent>
        </Card>
        {purchase.returnedAmount > 0 && (
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-ink-soft">Returned to supplier</p>
              <p className="text-2xl font-bold mt-1 text-ink">{format(purchase.returnedAmount)}</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-ink-soft">Balance owed</p>
            <p className={`text-2xl font-bold mt-1 ${balance > 0.01 ? "text-warning" : "text-ink"}`}>
              {format(balance)}
            </p>
            {purchase.dueDate && (
              <p className="text-xs text-ink-soft mt-1">
                Due {new Date(purchase.dueDate).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Items received</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ivory text-ink-soft text-left">
                  <tr>
                    <th className="px-5 py-3 font-medium">Product</th>
                    <th className="px-5 py-3 font-medium text-right">Received</th>
                    {purchase.batches.length > 0 && (
                      <th className="px-5 py-3 font-medium text-right">In stock</th>
                    )}
                    <th className="px-5 py-3 font-medium text-right">Unit cost</th>
                    <th className="px-5 py-3 font-medium text-right">Total</th>
                    {purchase.batches.length > 0 && <th className="px-5 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {purchase.batches.length > 0
                    ? purchase.batches.map((b) => (
                        <tr key={b.id}>
                          <td className="px-5 py-3 font-medium text-ink">{b.product.name}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{b.quantityReceived}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{b.quantityRemaining}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{format(b.unitCost)}</td>
                          <td className="px-5 py-3 text-right tabular-nums font-medium">
                            {format(b.quantityReceived * b.unitCost)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => openReturn(b)}
                              disabled={b.quantityRemaining <= 0}
                              className="inline-flex items-center gap-1 text-sm font-medium text-brand-dark hover:underline disabled:text-ink-soft disabled:no-underline disabled:cursor-not-allowed"
                            >
                              <Undo2 size={14} /> Return
                            </button>
                          </td>
                        </tr>
                      ))
                    : purchase.items.map((it) => (
                        <tr key={it.id}>
                          <td className="px-5 py-3">
                            <p className="font-medium text-ink">{it.product.name}</p>
                            {it.product.sku && <p className="text-xs text-ink-soft">{it.product.sku}</p>}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums">{it.quantity}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{format(it.unitCost)}</td>
                          <td className="px-5 py-3 text-right tabular-nums font-medium">{format(it.total)}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            {purchase.notes && (
              <p className="px-5 py-4 text-sm text-ink-soft border-t border-border-soft">{purchase.notes}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pay supplier</CardTitle>
          </CardHeader>
          <CardContent>
            {balance <= 0.01 ? (
              <p className="text-sm text-ink-soft py-4">This purchase is fully paid.</p>
            ) : (
              <form onSubmit={handlePay} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Amount</label>
                  <NumericInput value={amount} onChange={setAmount} placeholder={balance.toFixed(2)} />
                  <button
                    type="button"
                    onClick={() => setAmount(Number(balance.toFixed(2)))}
                    className="text-xs text-brand-dark hover:underline mt-1"
                  >
                    Pay full balance
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Pay from</label>
                  <PaymentAccountSelect value={accountId} onChange={setAccountId} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Method</label>
                  <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="pos">POS / Card</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Reference (optional)</label>
                  <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} />
                </div>
                {payError && <p className="text-sm text-danger">{payError}</p>}
                <Button type="submit" isLoading={paying} className="w-full">
                  <Wallet size={16} className="mr-1" /> Record payment
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {purchase.payments.length === 0 ? (
            <p className="text-sm text-ink-soft text-center py-8">No payments recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ivory text-ink-soft text-left">
                  <tr>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Account</th>
                    <th className="px-5 py-3 font-medium">Method</th>
                    <th className="px-5 py-3 font-medium">Reference</th>
                    <th className="px-5 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {purchase.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-3 text-ink-soft">{new Date(p.paidAt).toLocaleDateString()}</td>
                      <td className="px-5 py-3">{p.account}</td>
                      <td className="px-5 py-3">{METHOD_LABELS[p.method] || p.method.replace("_", " ")}</td>
                      <td className="px-5 py-3 text-ink-soft">{p.reference || "—"}</td>
                      <td className={`px-5 py-3 text-right tabular-nums font-medium ${p.amount < 0 ? "text-success" : ""}`}>
                        {format(p.amount)}
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
        open={returnBatch !== null}
        onClose={() => setReturnBatch(null)}
        title="Return to supplier"
        description={
          returnBatch
            ? `${returnBatch.product.name} · ${returnBatch.quantityRemaining} from this delivery still in stock at ${format(returnBatch.unitCost)} each`
            : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setReturnBatch(null)}>Cancel</Button>
            <Button onClick={submitReturn} isLoading={returning}>Record return</Button>
          </>
        }
      >
        <div>
          <label className="block text-sm font-medium mb-1">Units to return</label>
          <NumericInput
           
            min={0}
            max={returnBatch?.quantityRemaining}
            value={returnQty}
            onChange={setReturnQty}
          />
        </div>
        {returnValue > 0 && (
          <div className="rounded-xl bg-ivory p-4 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-ink-soft">Value returned</span>
              <span className="font-medium tabular-nums">{format(returnValue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-soft">Taken off what you owe</span>
              <span className="font-medium tabular-nums">{format(returnValue - refundDue)}</span>
            </div>
            {refundDue > 0 && (
              <div className="flex justify-between">
                <span className="text-ink-soft">Refund due from supplier</span>
                <span className="font-medium tabular-nums text-success">{format(refundDue)}</span>
              </div>
            )}
          </div>
        )}
        {refundDue > 0 && (
          <div>
            <label className="block text-sm font-medium mb-1">Refund received into</label>
            <PaymentAccountSelect value={refundAccountId} onChange={setRefundAccountId} />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">Reason / notes (optional)</label>
          <input value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} className={inputClass} />
        </div>
        {returnError && <p className="text-sm text-danger">{returnError}</p>}
      </Dialog>
    </div>
  );
}
