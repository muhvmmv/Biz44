"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Play, CheckCircle2, XCircle, PackagePlus, Undo2, Pencil, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { reportError } from "@/components/ui/Feedback";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@/lib/permissions";
import PaymentAccountSelect from "@/components/ui/PaymentAccountSelect";
import { ButtonLink } from "@/components/ui/Button";
import { StatusBadge as Status } from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import Dialog from "@/components/ui/Dialog";
import Skeleton from "@/components/ui/Skeleton";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import NumericInput from "@/components/ui/NumericInput";
import { Field, Input, Select } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useCurrency } from "@/hooks/useCurrency";
import { formatQty, itemTypeLabel } from "@/lib/units";

interface BatchRef {
  batch: {
    id: string; receivedAt: string; reference: string | null; unitCost: number;
    supplier: { name: string } | null;
    purchase: { id: string; reference: string | null } | null;
    productionOrder: { id: string; number: string } | null;
  };
  quantity: number;
  unitCost: number;
}
interface Material {
  id: string;
  product: { id: string; name: string; unit: string; itemType: string };
  plannedQuantity: number;
  issuedQuantity: number;
  issuedCost: number;
  available: number;
  shortage: number;
  standardForOutput: number | null;
  overUsage: number | null;
  batches: BatchRef[];
}
interface Order {
  id: string;
  number: string;
  status: "draft" | "in_progress" | "completed" | "cancelled";
  plannedQuantity: number;
  producedQuantity: number;
  materialCost: number;
  totalMaterialCost: number;
  unitCost: number;
  plannedDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  notes: string | null;
  yieldPercent: number | null;
  outputShortfall: number | null;
  canStart: boolean;
  product: { id: string; name: string; unit: string; price: number };
  location: { id: string; name: string } | null;
  materials: Material[];
  customer: { id: string; firstName: string; lastName: string; phone: string | null } | null;
  unitPrice: number | null;
  orderValue: number | null;
  depositsReceived: number;
  depositsUnused: number;
  deposits: {
    id: string; number: string; amount: number; appliedAmount: number; refundedAmount: number; available: number;
    method: string; accountName: string | null; reference: string | null; receivedAt: string;
  }[];
  invoices: { id: string; invoiceNumber: string; status: string; total: number; amountPaid: number; creditedAmount: number }[];
  outputBatches: { id: string; quantityReceived: number; quantityRemaining: number; unitCost: number; receivedAt: string }[];
}
interface Product { id: string; name: string; unit: string; itemType: string; quantity: number }

type DialogKind = null | "start" | "edit" | "issue" | "return" | "complete" | "cancel";

export default function ProductionOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { format } = useCurrency();
  const [order, setOrder] = useState<Order | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [startQty, setStartQty] = useState<Record<string, number>>({});
  const [plannedQty, setPlannedQty] = useState(0);
  const [issueProductId, setIssueProductId] = useState("");
  const [issueQty, setIssueQty] = useState(0);
  const [returnMaterial, setReturnMaterial] = useState<Material | null>(null);
  const [returnQty, setReturnQty] = useState(0);
  const [producedQty, setProducedQty] = useState(0);
  const [completeNotes, setCompleteNotes] = useState("");
  const [products, setProducts] = useState<Product[]>([]);

  const fetchOrder = useCallback(
    () => apiFetch<{ success: boolean; data: Order }>(`/production/orders/${id}`).then((r) => r.data),
    [id]
  );

  useEffect(() => {
    let active = true;
    fetchOrder()
      .then((o) => { if (active) setOrder(o); })
      .catch((e: unknown) => { if (active) setLoadError(e instanceof Error ? e.message : "Could not load the order"); });
    return () => { active = false; };
  }, [fetchOrder]);

  const open = async (kind: DialogKind, material?: Material) => {
    if (!order) return;
    setActionError("");
    if (kind === "start") setStartQty(Object.fromEntries(order.materials.map((m) => [m.id, m.plannedQuantity])));
    if (kind === "edit") setPlannedQty(order.plannedQuantity);
    if (kind === "issue") {
      setIssueProductId("");
      setIssueQty(0);
      if (products.length === 0) {
        const r = await apiFetch<{ success: boolean; data: Product[] }>("/products");
        setProducts(r.data.filter((p) => p.id !== order.product.id));
      }
    }
    if (kind === "return" && material) { setReturnMaterial(material); setReturnQty(0); }
    if (kind === "complete") { setProducedQty(order.plannedQuantity); setCompleteNotes(""); }
    setDialog(kind);
  };

  /** Run an action against the order; the response is the updated order. */
  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    setActionError("");
    try {
      const r = await apiFetch<{ success: boolean; data: Order }>(`/production/orders/${id}${path}`, {
        method: path ? "POST" : "PUT",
        body: JSON.stringify(body ?? {}),
      });
      setOrder(r.data);
      setDialog(null);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <Card><EmptyState tone="error" title="Couldn't load this production order" description={loadError} /></Card>;
  if (!order) return <Skeleton className="h-96" />;

  const unit = order.product.unit;
  const running = order.status === "in_progress";
  const cost = order.status === "completed" ? order.totalMaterialCost : order.materialCost;
  const previewUnitCost = producedQty > 0 ? order.materialCost / producedQty : 0;
  const issueProduct = products.find((p) => p.id === issueProductId);

  return (
    <div className="space-y-6">
      <Link href="/dashboard/production" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={16} /> Production
      </Link>

      <PageHeader
        title={`${order.number} · ${order.product.name}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={order.status} />
            <span>
              {formatQty(order.plannedQuantity, unit)} planned
              {order.location ? ` at ${order.location.name}` : ""}
              {order.plannedDate ? ` for ${new Date(order.plannedDate).toLocaleDateString()}` : ""}
            </span>
          </span>
        }
        actions={
          <>
            {order.status === "draft" && (
              <>
                <Button variant="outline" onClick={() => open("cancel")}><XCircle size={16} /> Cancel</Button>
                <Button variant="outline" onClick={() => open("edit")}><Pencil size={16} /> Change quantity</Button>
                <Button onClick={() => open("start")}><Play size={16} /> Start production</Button>
              </>
            )}
            {running && (
              <>
                <Button variant="outline" onClick={() => open("cancel")}><XCircle size={16} /> Cancel</Button>
                <Button variant="outline" onClick={() => open("issue")}><PackagePlus size={16} /> Issue material</Button>
                <Button onClick={() => open("complete")}><CheckCircle2 size={16} /> Complete</Button>
              </>
            )}
          </>
        }
      />

      {order.status === "draft" && !order.canStart && (
        <div className="flex items-start gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          Not enough stock for some materials at this location. Receive the missing materials, or start with smaller quantities.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {order.status === "completed" ? (
          <>
            <StatCard label="Produced" value={formatQty(order.producedQuantity, unit)} hint={`${order.yieldPercent ?? 0}% of plan${order.outputShortfall ? ` · ${formatQty(order.outputShortfall, unit)} short` : ""}`} />
            <StatCard label={`Cost per ${unit}`} value={order.producedQuantity > 0 ? format(order.unitCost) : "—"} hint="Actual, from the batches used" />
            <StatCard label="Total production cost" value={format(cost)} />
            <StatCard
              label="Margin at selling price"
              value={order.product.price > 0 && order.producedQuantity > 0 ? `${(((order.product.price - order.unitCost) / order.product.price) * 100).toFixed(1)}%` : "—"}
              tone={order.product.price > order.unitCost ? "positive" : "negative"}
              hint={order.product.price > 0 ? `Selling price ${format(order.product.price)}` : undefined}
            />
          </>
        ) : (
          <>
            <StatCard label="Planned" value={formatQty(order.plannedQuantity, unit)} />
            <StatCard label="Work in progress" value={format(order.materialCost)} hint={running ? "Materials issued so far" : "Nothing issued yet"} />
            <StatCard label="Started" value={order.startedAt ? new Date(order.startedAt).toLocaleDateString() : "—"} />
            <StatCard label={order.status === "cancelled" ? "Cancelled" : "Created"} value={new Date(order.cancelledAt ?? order.createdAt).toLocaleDateString()} />
          </>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Materials</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border-soft bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-5 py-3 font-medium">Material</th>
                  <th className="px-5 py-3 text-right font-medium">Planned</th>
                  <th className="px-5 py-3 text-right font-medium">Used</th>
                  {order.status === "completed" ? (
                    <th className="px-5 py-3 text-right font-medium">Over standard</th>
                  ) : (
                    <th className="px-5 py-3 text-right font-medium">In stock</th>
                  )}
                  <th className="px-5 py-3 text-right font-medium">Cost</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {order.materials.map((m) => {
                  const isOpen = expanded.has(m.id);
                  return (
                    <Fragment key={m.id}>
                      <tr>
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 text-left font-medium hover:text-brand-dark disabled:hover:text-ink"
                            onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })}
                            disabled={m.batches.length === 0}
                            aria-expanded={isOpen}
                          >
                            {m.batches.length > 0 ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="w-3.5" />}
                            {m.product.name}
                          </button>
                          <span className="ml-5 block text-xs text-ink-soft">{itemTypeLabel(m.product.itemType)}</span>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">{formatQty(m.plannedQuantity, m.product.unit)}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{formatQty(m.issuedQuantity, m.product.unit)}</td>
                        {order.status === "completed" ? (
                          <td className={`px-5 py-3 text-right tabular-nums ${m.overUsage ? "text-warning" : "text-ink-soft"}`}>
                            {m.overUsage ? formatQty(m.overUsage, m.product.unit) : "—"}
                          </td>
                        ) : (
                          <td className={`px-5 py-3 text-right tabular-nums ${m.shortage > 0 ? "text-danger" : ""}`}>
                            {formatQty(m.available, m.product.unit)}
                            {m.shortage > 0 && <span className="block text-xs">short {formatQty(m.shortage, m.product.unit)}</span>}
                          </td>
                        )}
                        <td className="px-5 py-3 text-right tabular-nums">{format(m.issuedCost)}</td>
                        <td className="px-5 py-3 text-right">
                          {running && m.issuedQuantity > 0 && (
                            <Button variant="ghost" size="sm" onClick={() => open("return", m)}><Undo2 size={14} /> Return</Button>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-surface-muted">
                          <td colSpan={6} className="px-5 py-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Taken from</p>
                            <ul className="space-y-1.5">
                              {m.batches.map((b) => (
                                <li key={b.batch.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                  <span>
                                    {formatQty(b.quantity, m.product.unit)} from{" "}
                                    {b.batch.purchase ? (
                                      <Link href={`/dashboard/purchases/${b.batch.purchase.id}`} className="font-medium text-brand-dark hover:underline">
                                        delivery {b.batch.purchase.reference ?? new Date(b.batch.receivedAt).toLocaleDateString()}
                                      </Link>
                                    ) : b.batch.productionOrder ? (
                                      <Link href={`/dashboard/production/${b.batch.productionOrder.id}`} className="font-medium text-brand-dark hover:underline">
                                        production {b.batch.productionOrder.number}
                                      </Link>
                                    ) : (
                                      <span className="font-medium">{b.batch.reference ?? "stock"}</span>
                                    )}
                                    {b.batch.supplier && <span className="text-ink-soft"> · {b.batch.supplier.name}</span>}
                                    <span className="text-ink-soft"> · received {new Date(b.batch.receivedAt).toLocaleDateString()}</span>
                                  </span>
                                  <span className="tabular-nums text-ink-soft">{format(b.unitCost)} / {m.product.unit}</span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border-soft font-semibold">
                  <td className="px-5 py-3" colSpan={4}>Total materials</td>
                  <td className="px-5 py-3 text-right tabular-nums">{format(order.materials.reduce((s, m) => s + m.issuedCost, 0))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {order.outputBatches.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Finished goods produced</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {order.outputBatches.map((b) => (
              <div key={b.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {formatQty(b.quantityReceived, unit)} of{" "}
                  <Link href={`/dashboard/inventory/products/${order.product.id}`} className="font-medium text-brand-dark hover:underline">{order.product.name}</Link>{" "}
                  into stock on {new Date(b.receivedAt).toLocaleDateString()} · {formatQty(b.quantityRemaining, unit)} still in stock
                </span>
                <span className="tabular-nums">{format(b.unitCost)} / {unit}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {order.customer && (
        <CustomerOrderCard order={order} onChanged={() => fetchOrder().then(setOrder).catch((e: unknown) => reportError(e))} />
      )}

      {order.notes && (
        <Card><CardContent className="pt-5 text-sm"><span className="text-ink-soft">Notes: </span>{order.notes}</CardContent></Card>
      )}

      {/* ---------- dialogs ---------- */}
      <Dialog
        open={dialog === "start"}
        onClose={() => setDialog(null)}
        title="Start production"
        description="These quantities leave stock now (oldest batches first) and their cost moves into work in progress. Change a quantity if you will use more or less than planned."
        className="sm:max-w-lg"
        footer={<><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={() => act("/start", { quantities: startQty })} isLoading={busy}><Play size={16} /> Start</Button></>}
      >
        <div className="space-y-3">
          {order.materials.map((m) => (
            <div key={m.id} className="grid grid-cols-[1fr_9rem] items-center gap-3">
              <div>
                <p className="text-sm font-medium">{m.product.name}</p>
                <p className={`text-xs ${m.available < (startQty[m.id] ?? 0) ? "text-danger" : "text-ink-soft"}`}>
                  {formatQty(m.available, m.product.unit)} in stock · plan {formatQty(m.plannedQuantity, m.product.unit)}
                </p>
              </div>
              <div className="relative">
                <NumericInput value={startQty[m.id] ?? 0} onChange={(v) => setStartQty((q) => ({ ...q, [m.id]: v }))} className="pr-12 text-right" aria-label={`${m.product.name} quantity`} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-soft">{m.product.unit}</span>
              </div>
            </div>
          ))}
        </div>
        {actionError && <p className="text-sm text-danger" role="alert">{actionError}</p>}
      </Dialog>

      <Dialog
        open={dialog === "edit"}
        onClose={() => setDialog(null)}
        title="Change planned quantity"
        description="Material requirements are recalculated from the bill of materials."
        footer={<><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={() => act("", { plannedQuantity: plannedQty })} isLoading={busy}>Save</Button></>}
      >
        <Field label={`Quantity to produce (${unit})`}><NumericInput value={plannedQty} onChange={setPlannedQty} /></Field>
        {actionError && <p className="text-sm text-danger" role="alert">{actionError}</p>}
      </Dialog>

      <Dialog
        open={dialog === "issue"}
        onClose={() => setDialog(null)}
        title="Issue more material"
        description="For extra material needed during the run, or a material not on the plan."
        footer={<><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={() => act("/issue", { productId: issueProductId, quantity: issueQty })} isLoading={busy} disabled={!issueProductId || !(issueQty > 0)}>Issue</Button></>}
      >
        <Field label="Material">
          <Select value={issueProductId} onChange={(e) => setIssueProductId(e.target.value)}>
            <option value="">Choose material</option>
            {products.filter((p) => p.itemType !== "finished_good").map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({formatQty(p.quantity, p.unit)} in stock)</option>
            ))}
          </Select>
        </Field>
        <Field label={`Quantity${issueProduct ? ` (${issueProduct.unit})` : ""}`}><NumericInput value={issueQty} onChange={setIssueQty} /></Field>
        {actionError && <p className="text-sm text-danger" role="alert">{actionError}</p>}
      </Dialog>

      <Dialog
        open={dialog === "return"}
        onClose={() => setDialog(null)}
        title={`Return unused ${returnMaterial?.product.name ?? "material"}`}
        description="Unused material goes back into stock, into the same batches it came from, at its original cost."
        footer={<><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={() => act("/return", { materialId: returnMaterial?.id, quantity: returnQty })} isLoading={busy} disabled={!(returnQty > 0)}>Return to stock</Button></>}
      >
        <Field label={`Quantity (${returnMaterial?.product.unit ?? ""})`} hint={returnMaterial ? `${formatQty(returnMaterial.issuedQuantity, returnMaterial.product.unit)} issued to this order` : undefined}>
          <NumericInput value={returnQty} onChange={setReturnQty} max={returnMaterial?.issuedQuantity} />
        </Field>
        {actionError && <p className="text-sm text-danger" role="alert">{actionError}</p>}
      </Dialog>

      <Dialog
        open={dialog === "complete"}
        onClose={() => setDialog(null)}
        title="Complete production"
        description="Enter the good quantity produced. Finished goods enter stock at the actual cost of the materials used; normal waste is included in that cost."
        footer={<><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={() => act("/complete", { producedQuantity: producedQty, notes: completeNotes || undefined })} isLoading={busy}><CheckCircle2 size={16} /> Complete</Button></>}
      >
        <Field label={`Good quantity produced (${unit})`}><NumericInput value={producedQty} onChange={setProducedQty} /></Field>
        <div className="space-y-1 rounded-xl bg-surface-muted p-4 text-sm">
          <div className="flex justify-between"><span className="text-ink-soft">Materials used</span><span className="tabular-nums">{format(order.materialCost)}</span></div>
          <div className="flex justify-between"><span className="text-ink-soft">Yield</span><span className="tabular-nums">{order.plannedQuantity > 0 ? ((producedQty / order.plannedQuantity) * 100).toFixed(1) : "0"}%</span></div>
          <div className="flex justify-between font-semibold"><span>Cost per {unit}</span><span className="tabular-nums">{producedQty > 0 ? format(previewUnitCost) : "—"}</span></div>
          {producedQty <= 0 && order.materialCost > 0 && (
            <p className="pt-1 text-danger">Nothing produced: the {format(order.materialCost)} of materials will be written off as a loss.</p>
          )}
        </div>
        <Field label="Notes"><Input value={completeNotes} onChange={(e) => setCompleteNotes(e.target.value)} placeholder="Optional, e.g. reason for low yield" /></Field>
        {actionError && <p className="text-sm text-danger" role="alert">{actionError}</p>}
      </Dialog>

      <Dialog
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
        title={`Cancel ${order.number}?`}
        description={running ? "All issued material goes back into stock, into the batches it came from." : "The planned order is closed. No stock has moved."}
        footer={<><Button variant="outline" onClick={() => setDialog(null)}>Keep order</Button><Button variant="danger" onClick={() => act("/cancel")} isLoading={busy}>Cancel order</Button></>}
      >
        {actionError ? <p className="text-sm text-danger" role="alert">{actionError}</p> : <p className="text-sm text-ink-soft">This can&apos;t be undone.</p>}
      </Dialog>
    </div>
  );
}


/** Made-to-order details: agreed value, deposits taken, refunds and the invoice. */
function CustomerOrderCard({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const { format } = useCurrency();
  const { user } = useAuth();
  const canMoney = can(user?.permissions, "sales", "write") || can(user?.permissions, "money", "write");
  const [mode, setMode] = useState<null | "deposit" | { refund: Order["deposits"][number] }>(null);
  const [amount, setAmount] = useState(0);
  const [accountId, setAccountId] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const value = order.orderValue ?? 0;
  const toCollect = Math.max(0, Math.round((value - order.depositsReceived) * 100) / 100);
  const pct = value > 0 ? Math.min(100, (order.depositsReceived / value) * 100) : 0;
  const openInvoice = order.invoices.find((i) => i.status !== "cancelled");

  const openDeposit = () => { setAmount(toCollect); setReference(""); setError(""); setMode("deposit"); };
  const openRefund = (d: Order["deposits"][number]) => { setAmount(d.available); setReference(""); setError(""); setMode({ refund: d }); };

  const save = async () => {
    setError("");
    if (!(amount > 0)) return setError("Enter an amount");
    if (!accountId) return setError("Choose the account");
    setBusy(true);
    try {
      if (mode === "deposit") {
        await apiFetch("/deposits", { method: "POST", body: JSON.stringify({ productionOrderId: order.id, amount, accountId, method, reference: reference || undefined }) });
      } else if (mode && typeof mode === "object") {
        await apiFetch(`/deposits/${mode.refund.id}/refund`, { method: "POST", body: JSON.stringify({ amount, accountId, reference: reference || undefined }) });
      }
      setMode(null);
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer order</CardTitle>
        <div className="flex flex-wrap gap-2">
          {canMoney && order.status !== "cancelled" && !openInvoice && (
            <Button variant="outline" size="sm" onClick={openDeposit}>Record deposit</Button>
          )}
          {order.status === "completed" && !openInvoice && can(user?.permissions, "sales", "write") && (
            <ButtonLink href={`/dashboard/invoices/new?productionOrderId=${order.id}`} size="sm">Create invoice</ButtonLink>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-ink-soft">Customer</p>
            <Link href={`/dashboard/customers/${order.customer!.id}`} className="font-semibold text-brand-dark hover:underline">{order.customer!.firstName} {order.customer!.lastName}</Link>
            {order.customer!.phone && <p className="text-xs text-ink-soft">{order.customer!.phone}</p>}
          </div>
          <div>
            <p className="text-ink-soft">Order value</p>
            <p className="font-semibold tabular-nums">{order.orderValue !== null ? format(order.orderValue) : "No price agreed"}</p>
            {order.unitPrice !== null && <p className="text-xs text-ink-soft">{format(order.unitPrice)} per {order.product.unit}</p>}
          </div>
          <div>
            <p className="text-ink-soft">Paid up front</p>
            <p className="font-semibold tabular-nums">{format(order.depositsReceived)}</p>
            {value > 0 && <p className="text-xs text-ink-soft">{toCollect > 0 ? `${format(toCollect)} to collect` : "Paid in full"}</p>}
          </div>
        </div>
        {value > 0 && (
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-green-600 transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
        )}
        {order.deposits.length > 0 && (
          <ul className="divide-y divide-border-soft rounded-xl border border-border-soft">
            {order.deposits.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                <span>
                  <span className="font-semibold">{d.number}</span>
                  <span className="text-ink-soft"> · {new Date(d.receivedAt).toLocaleDateString()} · {d.accountName ?? d.method}{d.reference ? ` · ${d.reference}` : ""}</span>
                  <span className="block text-xs text-ink-soft">
                    {d.appliedAmount > 0 && `${format(d.appliedAmount)} used on the invoice. `}
                    {d.refundedAmount > 0 && `${format(d.refundedAmount)} refunded. `}
                    {d.available > 0 && `${format(d.available)} unused.`}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">{format(d.amount)}</span>
                  {canMoney && d.available > 0 && (order.status === "cancelled" || !openInvoice) && (
                    <Button variant="ghost" size="sm" onClick={() => openRefund(d)}>Refund</Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {order.invoices.length > 0 && (
          <div className="space-y-1">
            {order.invoices.map((i) => (
              <Link key={i.id} href={`/dashboard/invoices/${i.id}`} className="flex items-center justify-between rounded-xl bg-surface-muted px-3 py-2 hover:bg-border-soft/40">
                <span className="font-semibold">{i.invoiceNumber}</span>
                <span className="flex items-center gap-2"><Status status={i.status} /><span className="tabular-nums">{format(i.total)}</span></span>
              </Link>
            ))}
          </div>
        )}
        {order.status === "cancelled" && order.depositsUnused > 0 && (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-warning">This order was cancelled with {format(order.depositsUnused)} of deposits unused. Refund it, or keep it as the customer&apos;s credit.</p>
        )}
      </CardContent>

      <Dialog
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode === "deposit" ? "Record deposit" : `Refund ${mode && typeof mode === "object" ? mode.refund.number : ""}`}
        description={mode === "deposit" ? "Money received from the customer before the goods are invoiced. It is applied to the invoice when you bill this order." : "Pay the unused deposit back to the customer."}
        footer={<><Button variant="outline" onClick={() => setMode(null)}>Cancel</Button><Button onClick={save} isLoading={busy}>{mode === "deposit" ? "Record deposit" : "Refund"}</Button></>}
      >
        <Field label="Amount" hint={mode === "deposit" && value > 0 ? `${format(toCollect)} left to collect` : undefined}>
          <NumericInput min={0} value={amount} onChange={setAmount} />
        </Field>
        {mode === "deposit" && value > 0 && toCollect > 0 && (
          <div className="flex gap-2 text-xs">
            <button type="button" className="font-semibold text-brand-dark hover:underline" onClick={() => setAmount(toCollect)}>Full balance</button>
            <button type="button" className="font-semibold text-brand-dark hover:underline" onClick={() => setAmount(Math.round(toCollect * 50) / 100)}>Half</button>
          </div>
        )}
        <Field label={mode === "deposit" ? "Received into" : "Paid from"}><PaymentAccountSelect value={accountId} onChange={setAccountId} /></Field>
        {mode === "deposit" && (
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="mobile">Mobile payment</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </Select>
          </Field>
        )}
        <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional, e.g. transfer reference" /></Field>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      </Dialog>
    </Card>
  );
}
