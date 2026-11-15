"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button, { ButtonLink } from "@/components/ui/Button";
import NumericInput from "@/components/ui/NumericInput";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { Field, Input, Select } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocation } from "@/hooks/useLocation";
import { formatQty } from "@/lib/units";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@/lib/permissions";
import PaymentAccountSelect from "@/components/ui/PaymentAccountSelect";

interface Bom { id: string; product: { id: string; name: string; unit: string; price: number }; outputQuantity: number }
interface Plan {
  materials: { productId: string; name: string; unit: string; required: number; available: number; shortage: number; estimatedCost: number }[];
  canStart: boolean;
  estimatedCost: number;
  estimatedUnitCost: number;
}

export default function NewProductionOrderPage() {
  const router = useRouter();
  const { format } = useCurrency();
  const { locations, activeLocationId, activeLocation } = useLocation();
  const [boms, setBoms] = useState<Bom[] | null>(null);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [plannedDate, setPlannedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState("");
  const [saving, setSaving] = useState(false);
  // Made to order for a customer (optional), with a deposit or full payment up front.
  const { user } = useAuth();
  const canCustomers = can(user?.permissions, "sales");
  const canTakeMoney = can(user?.permissions, "sales", "write") || can(user?.permissions, "money", "write");
  const [customers, setCustomers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [unitPrice, setUnitPrice] = useState(0);
  const [payment, setPayment] = useState<"none" | "deposit" | "full">("none");
  const [depositAmount, setDepositAmount] = useState(0);
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState("");

  const needsLocation = activeLocationId === "all" && locations.length > 1;
  const locationName = activeLocation?.name ?? locations[0]?.name ?? "";

  useEffect(() => {
    if (!canCustomers) return;
    apiFetch<{ success: boolean; data: { id: string; firstName: string; lastName: string }[] }>("/customers")
      .then((r) => setCustomers(r.data))
      .catch(() => setCustomers([]));
  }, [canCustomers]);

  useEffect(() => {
    apiFetch<{ success: boolean; data: Bom[] }>("/production/boms")
      .then((r) => setBoms(r.data))
      .catch(() => setBoms([]));
  }, []);

  // Requirements preview, refreshed shortly after the inputs change.
  useEffect(() => {
    if (!productId || !(quantity > 0)) return;
    let active = true;
    const t = setTimeout(() => {
      apiFetch<{ success: boolean; data: Plan }>(`/production/plan?productId=${productId}&quantity=${quantity}`)
        .then((r) => { if (active) { setPlan(r.data); setPlanError(""); } })
        .catch((e: unknown) => { if (active) { setPlan(null); setPlanError(e instanceof Error ? e.message : "Could not work out requirements"); } });
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [productId, quantity]);

  const bom = boms?.find((b) => b.product.id === productId);
  const orderValue = Math.round(unitPrice * quantity * 100) / 100;
  const received = payment === "full" ? orderValue : payment === "deposit" ? depositAmount : 0;
  const showPlan = !!productId && quantity > 0;

  const create = async () => {
    setError("");
    if (!productId) return setError("Choose what to produce");
    if (!(quantity > 0)) return setError("Enter how many to produce");
    if (received > 0 && !customerId) return setError("Choose the customer the payment is from");
    if (received > 0 && !accountId) return setError("Choose the account the payment went into");
    if (payment === "deposit" && depositAmount > orderValue && orderValue > 0) return setError("The deposit is more than the order value");
    setSaving(true);
    try {
      const r = await apiFetch<{ success: boolean; data: { id: string } }>("/production/orders", {
        method: "POST",
        body: JSON.stringify({
          productId, plannedQuantity: quantity, plannedDate: plannedDate || undefined, notes: notes || undefined,
          customerId: customerId || undefined,
          unitPrice: customerId ? unitPrice : undefined,
          deposit: received > 0 ? { amount: received, accountId } : undefined,
        }),
      });
      router.push(`/dashboard/production/${r.data.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not create the order");
      setSaving(false);
    }
  };

  if (!boms) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/production" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={16} /> Production
      </Link>
      <PageHeader
        title="New production order"
        description={`Plan a production run${locationName && !needsLocation ? ` at ${locationName}` : ""}. Nothing moves until you start it.`}
      />

      {boms.length === 0 ? (
        <Card>
          <EmptyState
            title="Create a bill of materials first"
            description="A production order takes its materials from the finished good's bill of materials."
            action={<ButtonLink href="/dashboard/production/boms/new">New bill of materials</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1 h-fit">
            <CardHeader><CardTitle>What to make</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Finished good" required>
                <Select value={productId} onChange={(e) => { setProductId(e.target.value); setPlan(null); setUnitPrice(boms.find((b) => b.product.id === e.target.value)?.product.price ?? 0); }}>
                  <option value="">Choose a product</option>
                  {boms.map((b) => <option key={b.id} value={b.product.id}>{b.product.name}</option>)}
                </Select>
              </Field>
              <Field label={`Quantity to produce${bom ? ` (${bom.product.unit})` : ""}`} required>
                <NumericInput value={quantity} onChange={setQuantity} />
              </Field>
              <Field label="Planned date">
                <Input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
              </Field>
              <Field label="Notes">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </Field>
              {canCustomers && (
                <div className="space-y-4 rounded-2xl border border-border-soft bg-surface-muted p-4">
                  <Field label="For a customer" hint="Optional: leave empty when producing for stock">
                    <Select value={customerId} onChange={(e) => { setCustomerId(e.target.value); if (!e.target.value) setPayment("none"); }}>
                      <option value="">Producing for stock</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                    </Select>
                  </Field>
                  {customerId && (
                    <>
                      <Field label={`Agreed price per ${bom?.product.unit ?? "unit"}`} hint={orderValue > 0 ? `Order value ${format(orderValue)}` : undefined}>
                        <NumericInput min={0} value={unitPrice} onChange={setUnitPrice} />
                      </Field>
                      {canTakeMoney ? (
                        <>
                          <div>
                            <p className="mb-1.5 text-sm font-medium">Payment received</p>
                            <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
                              {([["none", "None"], ["deposit", "Deposit"], ["full", "Paid in full"]] as const).map(([v, label]) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => setPayment(v)}
                                  className={`rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors ${payment === v ? "bg-charcoal text-white" : "text-ink-soft hover:text-ink"}`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                          {payment === "deposit" && (
                            <Field label="Deposit amount" hint={orderValue > 0 && depositAmount > 0 ? `${Math.round((depositAmount / orderValue) * 100)}% of the order · ${format(Math.max(0, orderValue - depositAmount))} to collect` : undefined}>
                              <NumericInput min={0} value={depositAmount} onChange={setDepositAmount} />
                            </Field>
                          )}
                          {payment !== "none" && (
                            <Field label="Received into"><PaymentAccountSelect value={accountId} onChange={setAccountId} /></Field>
                          )}
                          {payment !== "none" && received > 0 && (
                            <p className="text-xs text-ink-soft">{format(received)} is held as a customer deposit and applied to the invoice when you bill this order.</p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-ink-soft">Ask a sales or accounts colleague to record any deposit on the order page.</p>
                      )}
                    </>
                  )}
                </div>
              )}
              {needsLocation && (
                <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">Choose a location in the top bar: production happens at one location.</p>
              )}
              {error && <p className="text-sm text-danger" role="alert">{error}</p>}
              <Button onClick={create} isLoading={saving} disabled={needsLocation} className="w-full">Create production order</Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Materials needed</CardTitle>
              {plan && showPlan && (
                plan.canStart
                  ? <span className="inline-flex items-center gap-1.5 text-sm text-success"><CheckCircle2 size={16} /> Enough stock</span>
                  : <span className="inline-flex items-center gap-1.5 text-sm text-danger"><AlertTriangle size={16} /> Not enough stock</span>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {!showPlan ? (
                <p className="px-5 pb-8 pt-2 text-sm text-ink-soft">Choose a product and quantity to see the materials it needs.</p>
              ) : planError ? (
                <p className="px-5 pb-8 pt-2 text-sm text-danger">{planError}</p>
              ) : !plan ? (
                <div className="space-y-2 p-5"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-y border-border-soft bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-soft">
                        <tr>
                          <th className="px-5 py-3 font-medium">Material</th>
                          <th className="px-5 py-3 text-right font-medium">Needed</th>
                          <th className="px-5 py-3 text-right font-medium">In stock</th>
                          <th className="px-5 py-3 text-right font-medium">Est. cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-soft">
                        {plan.materials.map((m) => (
                          <tr key={m.productId}>
                            <td className="px-5 py-3 font-medium">{m.name}</td>
                            <td className="px-5 py-3 text-right tabular-nums">{formatQty(m.required, m.unit)}</td>
                            <td className={`px-5 py-3 text-right tabular-nums ${m.shortage > 0 ? "text-danger" : ""}`}>
                              {formatQty(m.available, m.unit)}
                              {m.shortage > 0 && <span className="block text-xs">short {formatQty(m.shortage, m.unit)}</span>}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums">{format(m.estimatedCost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col gap-1 border-t border-border-soft px-5 py-4 text-sm sm:flex-row sm:justify-between">
                    <span className="text-ink-soft">Estimated cost {format(plan.estimatedCost)} · {format(plan.estimatedUnitCost)} per {bom?.product.unit}</span>
                    {!plan.canStart && <span className="text-danger">You can still plan it; receive the missing stock before starting.</span>}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
