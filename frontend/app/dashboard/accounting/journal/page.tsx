"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import Dialog from "@/components/ui/Dialog";
import NumericInput from "@/components/ui/NumericInput";
import { Card, CardContent } from "@/components/ui/Card";
import PeriodPicker, { makePeriod, periodQuery, Period } from "@/components/accounting/PeriodPicker";
import { useCurrency } from "@/hooks/useCurrency";
import { SOURCE_LABELS } from "@/lib/ledgerLabels";

interface Line {
  id: string;
  debit: number;
  credit: number;
  memo: string | null;
  account: { id: string; name: string; code: string | null };
}
interface Entry {
  id: string;
  date: string;
  description: string;
  sourceType: string;
  reference: string | null;
  location: { name: string } | null;
  lines: Line[];
}
interface Account { id: string; name: string; code: string | null; type: string; systemKey: string | null; isActive: boolean }

const PAGE_SIZE = 25;
const LOCKED = new Set(["ar", "ap", "inventory"]);
const inputClass =
  "w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand";

interface DraftLine { accountId: string; debit: number; credit: number }

export default function JournalPage() {
  const { format } = useCurrency();
  const [period, setPeriod] = useState<Period>(() => makePeriod("this_month"));
  const [sourceType, setSourceType] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; entries: Entry[] } | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let active = true;
    const extra: Record<string, string> = { page: String(page), pageSize: String(PAGE_SIZE) };
    if (sourceType) extra.sourceType = sourceType;
    if (query) extra.search = query;
    apiFetch<{ success: boolean; data: { total: number; entries: Entry[] } }>(`/accounting/journal${periodQuery(period, extra)}`)
      .then((r) => { if (active) { setData(r.data); setError(""); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load the journal"); });
    return () => { active = false; };
  }, [period, sourceType, query, page, reload]);

  const usable = useMemo(
    () => accounts.filter((a) => a.isActive && !(a.systemKey && LOCKED.has(a.systemKey))),
    [accounts]
  );
  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const balancedDraft = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;

  const openNew = async () => {
    setFormError("");
    setDescription("");
    setReference("");
    setDate("");
    setLines([{ accountId: "", debit: 0, credit: 0 }, { accountId: "", debit: 0, credit: 0 }]);
    if (accounts.length === 0) {
      const r = await apiFetch<{ success: boolean; data: Account[] }>("/accounting/accounts");
      setAccounts(r.data);
    }
    setOpen(true);
  };

  const updateLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const saveEntry = async () => {
    setFormError("");
    if (!description.trim()) return setFormError("Add a description");
    if (lines.some((l) => (l.debit || l.credit) && !l.accountId)) return setFormError("Choose an account on every line");
    if (!balancedDraft) return setFormError("Debits must equal credits");
    setSaving(true);
    try {
      await apiFetch("/accounting/journal", {
        method: "POST",
        body: JSON.stringify({
          description,
          reference: reference || undefined,
          date: date || undefined,
          lines: lines.filter((l) => l.accountId && (l.debit || l.credit)),
        }),
      });
      setOpen(false);
      setPage(1);
      setReload((n) => n + 1);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Could not save the entry");
    } finally {
      setSaving(false);
    }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal"
        description="Every financial event as a balanced double entry. Sales, payments, purchases and stock post here automatically."
        actions={
          <Button onClick={openNew}>
            <Plus size={16} className="mr-1.5" /> Manual entry
          </Button>
        }
      />

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <PeriodPicker value={period} onChange={(p) => { setPeriod(p); setPage(1); }} />
        <select
          value={sourceType}
          onChange={(e) => { setSourceType(e.target.value); setPage(1); }}
          className={`${inputClass} lg:w-56`}
          aria-label="Type"
        >
          <option value="">All types</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <form
          onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); setPage(1); }}
          className="relative lg:ml-auto lg:w-72"
        >
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description or reference"
            className={`${inputClass} pl-9`}
          />
        </form>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!data ? (
        <Skeleton className="h-96" />
      ) : data.entries.length === 0 ? (
        <Card><CardContent className="py-14 text-center text-sm text-ink-soft">No journal entries match.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {data.entries.map((e) => (
            <Card key={e.id}>
              <CardContent className="p-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 pt-4 pb-3">
                  <div>
                    <p className="font-medium text-ink">{e.description}</p>
                    <p className="text-xs text-ink-soft">
                      {new Date(e.date).toLocaleDateString()}
                      {e.reference ? ` · ${e.reference}` : ""}
                      {e.location ? ` · ${e.location.name}` : ""}
                    </p>
                  </div>
                  <Badge variant={e.sourceType === "manual" ? "warning" : e.sourceType === "opening_balance" ? "info" : "default"}>
                    {SOURCE_LABELS[e.sourceType] || e.sourceType}
                  </Badge>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-ink-soft text-left border-t border-border-soft">
                      <tr>
                        <th className="px-5 py-2 font-medium">Account</th>
                        <th className="px-5 py-2 font-medium text-right w-36">Debit</th>
                        <th className="px-5 py-2 font-medium text-right w-36">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.lines.map((l) => (
                        <tr key={l.id} className="border-t border-border-soft">
                          <td className={`px-5 py-2 ${l.credit ? "pl-10" : ""}`}>
                            {l.account.code && <span className="text-ink-soft tabular-nums mr-2">{l.account.code}</span>}
                            <Link href={`/dashboard/accounting/accounts/${l.account.id}`} className="hover:text-brand-dark">
                              {l.account.name}
                            </Link>
                          </td>
                          <td className="px-5 py-2 text-right tabular-nums">{l.debit ? format(l.debit) : ""}</td>
                          <td className="px-5 py-2 text-right tabular-nums">{l.credit ? format(l.credit) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex items-center justify-between text-sm text-ink-soft">
            <span>
              {data.total} entr{data.total === 1 ? "y" : "ies"} · page {page} of {pages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft size={16} />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-ink-soft">
        Looking for records from before the ledger?{" "}
        <Link href="/dashboard/accounting/transactions" className="text-brand-dark hover:underline">View older records</Link>.
      </p>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Manual journal entry"
        description="For owner capital, loans, corrections and similar. Receivables, payables and inventory change only through invoices, purchases and stock."
        className="sm:max-w-2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={saveEntry} isLoading={saving} disabled={!balancedDraft}>Post entry</Button>
          </>
        }
      >
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Reference (optional)</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} />
        </div>
        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-[1fr_8rem_8rem_2rem] gap-2 text-xs text-ink-soft">
            <span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span><span />
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_8rem_8rem_2rem] gap-2 items-center">
              <select
                value={l.accountId}
                onChange={(e) => updateLine(i, { accountId: e.target.value })}
                className={`${inputClass} col-span-2 sm:col-span-1`}
                aria-label="Account"
              >
                <option value="">Choose account</option>
                {usable.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name}</option>)}
              </select>
              <NumericInput value={l.debit} onChange={(v) => updateLine(i, { debit: v, credit: v ? 0 : l.credit })} placeholder="Debit" className="text-right" />
              <NumericInput value={l.credit} onChange={(v) => updateLine(i, { credit: v, debit: v ? 0 : l.debit })} placeholder="Credit" className="text-right" />
              <button
                type="button"
                onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                disabled={lines.length <= 2}
                className="p-1.5 text-ink-soft hover:text-danger disabled:opacity-30"
                aria-label="Remove line"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setLines((ls) => [...ls, { accountId: "", debit: 0, credit: 0 }])}
            className="text-sm font-medium text-brand-dark hover:underline"
          >
            + Add line
          </button>
        </div>
        <div className={`flex justify-between rounded-xl px-4 py-3 text-sm ${balancedDraft ? "bg-green-50 text-success" : "bg-ivory text-ink"}`}>
          <span>Debits {format(totalDebit)} · Credits {format(totalCredit)}</span>
          <span className="font-medium">{balancedDraft ? "Balanced" : `Difference ${format(Math.abs(totalDebit - totalCredit))}`}</span>
        </div>
        {formError && <p className="text-sm text-danger">{formError}</p>}
      </Dialog>
    </div>
  );
}
