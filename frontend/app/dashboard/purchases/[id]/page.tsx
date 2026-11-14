"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Wallet } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import NumericInput from "@/components/ui/NumericInput";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useCurrency } from "@/hooks/useCurrency";
import PaymentAccountSelect from "@/components/ui/PaymentAccountSelect";

interface PurchaseDetail {
  id: string;
  reference: string | null;
  date: string;
  dueDate: string | null;
  subtotal: number;
  total: number;
  amountPaid: number;
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
}

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

  const balance = purchase ? purchase.total - purchase.amountPaid : 0;

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-ink-soft">Total</p>
            <p className="text-2xl font-bold mt-1 text-ink">{format(purchase.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-ink-soft">Paid</p>
            <p className="text-2xl font-bold mt-1 text-success">{format(purchase.amountPaid)}</p>
          </CardContent>
        </Card>
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
                    <th className="px-5 py-3 font-medium text-right">Qty</th>
                    <th className="px-5 py-3 font-medium text-right">Unit cost</th>
                    <th className="px-5 py-3 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {purchase.items.map((it) => (
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
                      <td className="px-5 py-3 capitalize">{p.method.replace("_", " ")}</td>
                      <td className="px-5 py-3 text-ink-soft">{p.reference || "—"}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium">{format(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
