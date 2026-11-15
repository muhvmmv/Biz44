"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import NumericInput from "@/components/ui/NumericInput";
import PaymentAccountSelect from "@/components/ui/PaymentAccountSelect";
import { Field, Input } from "@/components/ui/Input";
import { useCurrency } from "@/hooks/useCurrency";
import { formatQty } from "@/lib/units";

interface Creditable {
  invoiceItemId: string;
  productId: string | null;
  description: string;
  unit: string | null;
  sold: number;
  credited: number;
  available: number;
  unitPrice: number;
  taxRate: number;
}

/**
 * Return goods or credit part of an invoice. Shows what each line can still
 * be credited, the value (after the invoice's discount, plus VAT) and how
 * much reduces the balance vs. is refunded.
 */
export default function CreditNoteDialog({
  open, onClose, onDone, invoiceId, invoiceNumber, balance,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  invoiceId: string;
  invoiceNumber: string;
  /** What the customer still owes on the invoice. */
  balance: number;
}) {
  const { format } = useCurrency();
  const [lines, setLines] = useState<Creditable[] | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [refundAccountId, setRefundAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    apiFetch<{ success: boolean; data: Creditable[] }>(`/invoices/${invoiceId}/creditable`)
      .then((r) => {
        if (!active) return;
        setLines(r.data);
        setQty({});
        setRestock(Object.fromEntries(r.data.map((l) => [l.invoiceItemId, !!l.productId])));
        setReason("");
        setError("");
      })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load the invoice lines"); });
    return () => { active = false; };
  }, [open, invoiceId]);

  const taxRate = lines?.[0]?.taxRate ?? 0;
  const subtotal = (lines ?? []).reduce((s, l) => s + Math.round((qty[l.invoiceItemId] ?? 0) * l.unitPrice * 100) / 100, 0);
  const vat = Math.round(subtotal * taxRate) / 100;
  const total = Math.round((subtotal + vat) * 100) / 100;
  const applied = Math.min(total, Math.max(0, balance));
  const refund = Math.round((total - applied) * 100) / 100;

  const save = async () => {
    setError("");
    const items = (lines ?? [])
      .filter((l) => (qty[l.invoiceItemId] ?? 0) > 0)
      .map((l) => ({ invoiceItemId: l.invoiceItemId, quantity: qty[l.invoiceItemId], restock: restock[l.invoiceItemId] }));
    if (items.length === 0) return setError("Enter how many of at least one item are being returned or credited");
    const over = (lines ?? []).find((l) => (qty[l.invoiceItemId] ?? 0) > l.available);
    if (over) return setError(`Only ${formatQty(over.available, over.unit ?? undefined)} of ${over.description} can still be credited`);
    if (refund > 0 && !refundAccountId) return setError("Choose the account the refund is paid from");
    setSaving(true);
    try {
      await apiFetch(`/invoices/${invoiceId}/credit-notes`, {
        method: "POST",
        body: JSON.stringify({ items, reason: reason || undefined, refundAccountId: refund > 0 ? refundAccountId : undefined }),
      });
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save the credit note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Return or credit · ${invoiceNumber}`}
      description="Enter what the customer is returning, or what you are crediting. Restocked goods go back into the batches they came from, at their original cost."
      className="sm:max-w-2xl"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} isLoading={saving} disabled={!(total > 0)}>Save credit note</Button></>}
    >
      {!lines ? (
        <p className="text-sm text-ink-soft">{error || "Loading…"}</p>
      ) : (
        <>
          <div className="space-y-3">
            {lines.map((l) => (
              <div key={l.invoiceItemId} className="grid grid-cols-[1fr_8rem] items-center gap-3 sm:grid-cols-[1fr_8rem_7rem]">
                <div>
                  <p className="text-sm font-medium">{l.description}</p>
                  <p className="text-xs text-ink-soft">
                    {formatQty(l.sold, l.unit ?? undefined)} sold
                    {l.credited > 0 && ` · ${formatQty(l.credited, l.unit ?? undefined)} already credited`} · {format(l.unitPrice)} each
                  </p>
                </div>
                <div className="relative">
                  <NumericInput
                    value={qty[l.invoiceItemId] ?? 0}
                    onChange={(v) => setQty((q) => ({ ...q, [l.invoiceItemId]: v }))}
                    max={l.available}
                    disabled={l.available <= 0}
                    className={`pr-10 text-right ${(qty[l.invoiceItemId] ?? 0) > l.available ? "border-danger" : ""}`}
                    aria-label={`${l.description} quantity`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-soft">{l.unit ?? ""}</span>
                </div>
                {l.productId ? (
                  <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-1">
                    <input
                      type="checkbox"
                      checked={restock[l.invoiceItemId] ?? true}
                      onChange={(e) => setRestock((r) => ({ ...r, [l.invoiceItemId]: e.target.checked }))}
                    />
                    Back to stock
                  </label>
                ) : <span className="hidden sm:block" />}
              </div>
            ))}
          </div>
          <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. torn bags, wrong item, price adjustment" /></Field>
          <div className="space-y-1 rounded-xl bg-surface-muted p-4 text-sm">
            <div className="flex justify-between"><span className="text-ink-soft">Value</span><span className="tabular-nums">{format(subtotal)}</span></div>
            {vat > 0 && <div className="flex justify-between"><span className="text-ink-soft">VAT ({taxRate}%)</span><span className="tabular-nums">{format(vat)}</span></div>}
            <div className="flex justify-between font-semibold"><span>Credit note total</span><span className="tabular-nums">{format(total)}</span></div>
            {total > 0 && (
              <>
                <div className="flex justify-between pt-1"><span className="text-ink-soft">Reduces what they owe</span><span className="tabular-nums">{format(applied)}</span></div>
                <div className="flex justify-between"><span className="text-ink-soft">Refunded to customer</span><span className="tabular-nums">{format(refund)}</span></div>
              </>
            )}
          </div>
          {refund > 0 && (
            <Field label="Refund paid from"><PaymentAccountSelect value={refundAccountId} onChange={setRefundAccountId} /></Field>
          )}
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        </>
      )}
    </Dialog>
  );
}
