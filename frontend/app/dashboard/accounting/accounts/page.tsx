"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Wallet, Landmark, Plus, ArrowLeftRight, Pencil, HandCoins, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import Dialog from "@/components/ui/Dialog";
import NumericInput from "@/components/ui/NumericInput";
import StatCard from "@/components/ui/StatCard";
import { Card, CardContent } from "@/components/ui/Card";
import PeriodPicker, { makePeriod, periodQuery, Period } from "@/components/accounting/PeriodPicker";
import { useCurrency } from "@/hooks/useCurrency";

interface MoneyAccount {
  id: string;
  name: string;
  subtype: "cash" | "bank";
  bankName: string | null;
  accountNumber: string | null;
  balance: number;
}
interface Account { id: string; name: string; systemKey: string | null }
interface CashFlow {
  categories: { label: string; inflow: number; outflow: number }[];
  totalIn: number;
  totalOut: number;
  net: number;
}

const inputClass =
  "w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand";

type DialogKind = null | "add" | "edit" | "transfer" | "owner";

export default function CashAndBanksPage() {
  const { format } = useCurrency();
  const [accounts, setAccounts] = useState<MoneyAccount[] | null>(null);
  const [chart, setChart] = useState<Account[]>([]);
  const [period, setPeriod] = useState<Period>(() => makePeriod("this_month"));
  const [flow, setFlow] = useState<CashFlow | null>(null);

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [editing, setEditing] = useState<MoneyAccount | null>(null);
  const [form, setForm] = useState({ name: "", bankName: "", accountNumber: "" });
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState(0);
  const [ownerDirection, setOwnerDirection] = useState<"in" | "out">("in");
  const [ownerAccountId, setOwnerAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchAccounts = useCallback(
    () =>
      Promise.all([
        apiFetch<{ success: boolean; data: MoneyAccount[] }>("/accounting/payment-accounts"),
        apiFetch<{ success: boolean; data: Account[] }>("/accounting/accounts"),
      ]),
    []
  );
  const loadAccounts = useCallback(async () => {
    const [a, c] = await fetchAccounts();
    setAccounts(a.data);
    setChart(c.data);
  }, [fetchAccounts]);

  useEffect(() => {
    let active = true;
    fetchAccounts()
      .then(([a, c]) => {
        if (!active) return;
        setAccounts(a.data);
        setChart(c.data);
      })
      .catch(console.error);
    return () => { active = false; };
  }, [fetchAccounts]);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: CashFlow }>(`/accounting/cash-flow${periodQuery(period)}`)
      .then((r) => { if (active) setFlow(r.data); })
      .catch(console.error);
    return () => { active = false; };
  }, [period, accounts]);

  const total = accounts?.reduce((s, a) => s + a.balance, 0) ?? 0;

  const open = (kind: DialogKind, account?: MoneyAccount) => {
    setError("");
    setAmount(0);
    setNotes("");
    setEditing(account ?? null);
    if (kind === "edit" && account) {
      setForm({ name: account.name, bankName: account.bankName ?? "", accountNumber: account.accountNumber ?? "" });
    } else {
      setForm({ name: "", bankName: "", accountNumber: "" });
    }
    if (kind === "transfer") {
      setFromId(accounts?.[0]?.id ?? "");
      setToId(accounts?.[1]?.id ?? "");
    }
    if (kind === "owner") setOwnerAccountId(accounts?.find((a) => a.subtype === "bank")?.id ?? accounts?.[0]?.id ?? "");
    setDialog(kind);
  };

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      if (dialog === "add") {
        await apiFetch("/accounting/accounts", {
          method: "POST",
          body: JSON.stringify({ ...form, subtype: "bank" }),
        });
      } else if (dialog === "edit" && editing) {
        await apiFetch(`/accounting/accounts/${editing.id}`, { method: "PUT", body: JSON.stringify(form) });
      } else if (dialog === "transfer") {
        if (amount <= 0) throw new Error("Enter an amount");
        await apiFetch("/accounting/transfers", {
          method: "POST",
          body: JSON.stringify({ fromAccountId: fromId, toAccountId: toId, amount, notes: notes || undefined }),
        });
      } else if (dialog === "owner") {
        if (amount <= 0) throw new Error("Enter an amount");
        const key = ownerDirection === "in" ? "owner_capital" : "owner_drawings";
        const equity = chart.find((a) => a.systemKey === key);
        if (!equity) throw new Error("Owner account not found");
        await apiFetch("/accounting/journal", {
          method: "POST",
          body: JSON.stringify({
            description: notes || (ownerDirection === "in" ? "Owner put money into the business" : "Owner took money out of the business"),
            lines:
              ownerDirection === "in"
                ? [{ accountId: ownerAccountId, debit: amount }, { accountId: equity.id, credit: amount }]
                : [{ accountId: equity.id, debit: amount }, { accountId: ownerAccountId, credit: amount }],
          }),
        });
      }
      setDialog(null);
      await loadAccounts();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash & Banks"
        description="The company's cash and bank accounts. Every payment in or out is recorded against one of them."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => open("owner")} disabled={!accounts?.length}>
              <HandCoins size={16} className="mr-1.5" /> Owner money
            </Button>
            <Button variant="outline" onClick={() => open("transfer")} disabled={(accounts?.length ?? 0) < 2}>
              <ArrowLeftRight size={16} className="mr-1.5" /> Transfer
            </Button>
            <Button onClick={() => open("add")}>
              <Plus size={16} className="mr-1.5" /> Add bank account
            </Button>
          </div>
        }
      />

      {!accounts ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white p-6 shadow-sm">
            <p className="text-sm text-white/80">Total cash and bank</p>
            <p className="text-3xl sm:text-4xl font-bold mt-1 tabular-nums">{format(total)}</p>
            <p className="text-sm text-white/80 mt-1">Across {accounts.length} account{accounts.length === 1 ? "" : "s"}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {accounts.map((a) => {
              const Icon = a.subtype === "bank" ? Landmark : Wallet;
              return (
                <Card key={a.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-10 h-10 rounded-xl bg-brand-light text-brand-dark flex items-center justify-center shrink-0">
                          <Icon size={18} />
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-ink truncate">{a.name}</p>
                          <p className="text-xs text-ink-soft truncate">
                            {a.subtype === "bank"
                              ? [a.bankName, a.accountNumber].filter(Boolean).join(" · ") || "Bank account"
                              : "Cash"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => open("edit", a)}
                        className="p-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-ivory"
                        aria-label={`Edit ${a.name}`}
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                    <p className={`text-2xl font-bold mt-4 tabular-nums ${a.balance < 0 ? "text-danger" : "text-ink"}`}>
                      {format(a.balance)}
                    </p>
                    <Link
                      href={`/dashboard/accounting/accounts/${a.id}`}
                      className="mt-3 inline-flex items-center text-sm font-medium text-brand-dark hover:underline"
                    >
                      View statement <ChevronRight size={14} />
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Money in and out</h2>
            <PeriodPicker value={period} onChange={setPeriod} />
          </div>
          {flow && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Money in" value={format(flow.totalIn)} tone="positive" />
                <StatCard label="Money out" value={format(flow.totalOut)} tone="negative" />
                <StatCard label="Net change" value={format(flow.net)} tone={flow.net >= 0 ? "positive" : "negative"} />
              </div>
              <Card>
                <CardContent className="p-0">
                  {flow.categories.length === 0 ? (
                    <p className="text-sm text-ink-soft text-center py-10">No money moved in this period.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-ivory text-ink-soft text-left">
                        <tr>
                          <th className="px-5 py-3 font-medium">Type</th>
                          <th className="px-5 py-3 font-medium text-right">In</th>
                          <th className="px-5 py-3 font-medium text-right">Out</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-soft">
                        {flow.categories.map((c) => (
                          <tr key={c.label}>
                            <td className="px-5 py-3">{c.label}</td>
                            <td className="px-5 py-3 text-right tabular-nums text-success">{c.inflow ? format(c.inflow) : "—"}</td>
                            <td className="px-5 py-3 text-right tabular-nums text-danger">{c.outflow ? format(c.outflow) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
              <p className="text-xs text-ink-soft">Transfers between your own accounts are not counted as money in or out.</p>
            </>
          )}
        </>
      )}

      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={
          dialog === "add" ? "Add bank account"
          : dialog === "edit" ? `Edit ${editing?.name ?? "account"}`
          : dialog === "transfer" ? "Transfer between accounts"
          : "Owner money"
        }
        description={
          dialog === "transfer" ? "Moves money between your own accounts. It is not income or an expense."
          : dialog === "owner" ? "Money the owner puts into the business (capital) or takes out (drawings). Neither is income or an expense."
          : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={save} isLoading={saving}>Save</Button>
          </>
        }
      >
        {(dialog === "add" || dialog === "edit") && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Account name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="e.g. GTBank Current" />
            </div>
            {(dialog === "add" || editing?.subtype === "bank") && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Bank</label>
                  <input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} className={inputClass} placeholder="e.g. Guaranty Trust Bank" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Account number</label>
                  <input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} className={inputClass} inputMode="numeric" />
                </div>
              </>
            )}
          </>
        )}

        {dialog === "transfer" && accounts && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">From</label>
              <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={inputClass}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({format(a.balance)})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">To</label>
              <select value={toId} onChange={(e) => setToId(e.target.value)} className={inputClass}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({format(a.balance)})</option>)}
              </select>
            </div>
          </>
        )}

        {dialog === "owner" && accounts && (
          <>
            <div className="inline-flex rounded-full bg-ivory p-1">
              {(["in", "out"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setOwnerDirection(d)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium ${ownerDirection === d ? "bg-charcoal text-white" : "text-ink-soft"}`}
                >
                  {d === "in" ? "Owner puts money in" : "Owner takes money out"}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{ownerDirection === "in" ? "Paid into" : "Paid from"}</label>
              <select value={ownerAccountId} onChange={(e) => setOwnerAccountId(e.target.value)} className={inputClass}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({format(a.balance)})</option>)}
              </select>
            </div>
          </>
        )}

        {(dialog === "transfer" || dialog === "owner") && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Amount</label>
              <NumericInput value={amount} onChange={setAmount} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Note (optional)</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
            </div>
          </>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </Dialog>
    </div>
  );
}
