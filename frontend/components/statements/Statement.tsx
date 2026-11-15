"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useCurrency } from "@/hooks/useCurrency";

interface Line {
  date: string;
  type: string;
  reference: string | null;
  description: string;
  documentId: string | null;
  amount: number;
  balance: number;
}
interface OpenDoc { id: string; reference: string | null; date: string; dueDate: string | null; total: number; paid: number; balance: number; daysOverdue: number }
interface StatementData {
  party: { id: string; name: string; email: string | null; phone: string | null; address: string | null };
  openingBalance: number;
  closingBalance: number;
  totals: { increases: number; decreases: number };
  lines: Line[];
  aging: { current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number; total: number };
  openDocuments: OpenDoc[];
}

const firstOfYear = () => `${new Date().getFullYear()}-01-01`;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Account statement for a customer (what they owe us) or a supplier (what we owe them). */
export default function Statement({ kind, id }: { kind: "customer" | "supplier"; id: string }) {
  const { format } = useCurrency();
  const [from, setFrom] = useState(firstOfYear);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<StatementData | null>(null);
  const [company, setCompany] = useState<{ name: string; address: string | null; phone: string | null; email: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = kind === "customer" ? "/customers" : "/suppliers";
  const docHref = (docId: string) => (kind === "customer" ? `/dashboard/invoices/${docId}` : `/dashboard/purchases/${docId}`);
  const backHref = kind === "customer" ? `/dashboard/customers/${id}` : `/dashboard/suppliers/${id}`;
  const increaseLabel = kind === "customer" ? "Invoiced" : "Purchased";
  const decreaseLabel = kind === "customer" ? "Paid / credited" : "Paid / returned";
  const owedLabel = kind === "customer" ? "Amount due from customer" : "Amount owed to supplier";

  useEffect(() => {
    apiFetch<{ success: boolean; data: { name: string; address: string | null; phone: string | null; email: string | null } }>("/settings/company")
      .then((r) => setCompany(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    apiFetch<{ success: boolean; data: StatementData }>(`${base}/${id}/statement?${q}`)
      .then((r) => { if (active) { setData(r.data); setError(null); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load the statement"); });
    return () => { active = false; };
  }, [base, id, from, to]);

  if (error) return <Card><EmptyState tone="error" title="Couldn't load the statement" description={error} /></Card>;
  if (!data) return <Skeleton className="h-96" />;

  const buckets = [
    { label: "Not yet due", value: data.aging.current },
    { label: "1–30 days", value: data.aging.d1_30 },
    { label: "31–60 days", value: data.aging.d31_60 },
    { label: "61–90 days", value: data.aging.d61_90 },
    { label: "Over 90 days", value: data.aging.d90plus },
  ];
  const period = `${from ? new Date(from).toLocaleDateString() : "the beginning"} to ${to ? new Date(to).toLocaleDateString() : "today"}`;

  return (
    <div className="space-y-6">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink print:hidden">
        <ArrowLeft size={16} /> {data.party.name}
      </Link>

      <div className="print:hidden">
        <PageHeader
          title={`Statement · ${data.party.name}`}
          description={kind === "customer" ? "Invoices, payments and credits, with the balance after each." : "Deliveries, payments and returns, with the balance after each."}
          actions={<Button variant="outline" onClick={() => window.print()}><Printer size={16} /> Print</Button>}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardContent className="space-y-6 p-5 sm:p-8">
          <div className="flex flex-col justify-between gap-6 sm:flex-row">
            <div className="text-sm">
              <p className="text-lg font-bold text-charcoal">{company?.name}</p>
              {company?.address && <p className="text-ink-soft">{company.address}</p>}
              {company?.phone && <p className="text-ink-soft">{company.phone}</p>}
              {company?.email && <p className="text-ink-soft">{company.email}</p>}
            </div>
            <div className="text-sm sm:text-right">
              <p className="text-xl font-bold text-charcoal">STATEMENT</p>
              <p className="text-ink-soft">{period}</p>
              <p className="mt-3 font-semibold">{data.party.name}</p>
              {data.party.address && <p className="text-ink-soft">{data.party.address}</p>}
              {data.party.phone && <p className="text-ink-soft">{data.party.phone}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-muted p-4 text-sm sm:grid-cols-4">
            <div><p className="text-ink-soft">Opening balance</p><p className="font-semibold tabular-nums">{format(data.openingBalance)}</p></div>
            <div><p className="text-ink-soft">{increaseLabel}</p><p className="font-semibold tabular-nums">{format(data.totals.increases)}</p></div>
            <div><p className="text-ink-soft">{decreaseLabel}</p><p className="font-semibold tabular-nums">{format(data.totals.decreases)}</p></div>
            <div><p className="text-ink-soft">Closing balance</p><p className="text-base font-bold tabular-nums">{format(data.closingBalance)}</p></div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border-soft text-left text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="py-2.5 pr-3 font-medium">Date</th>
                  <th className="py-2.5 pr-3 font-medium">Details</th>
                  <th className="py-2.5 pr-3 text-right font-medium">{increaseLabel}</th>
                  <th className="py-2.5 pr-3 text-right font-medium">{decreaseLabel}</th>
                  <th className="py-2.5 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                <tr>
                  <td className="py-2.5 pr-3 text-ink-soft">{from ? new Date(from).toLocaleDateString() : ""}</td>
                  <td className="py-2.5 pr-3 font-medium">Opening balance</td>
                  <td /><td />
                  <td className="whitespace-nowrap py-2.5 text-right tabular-nums">{format(data.openingBalance)}</td>
                </tr>
                {data.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-ink-soft">{new Date(l.date).toLocaleDateString()}</td>
                    <td className="py-2.5 pr-3">
                      {l.documentId ? (
                        <Link href={docHref(l.documentId)} className="hover:text-brand-dark hover:underline print:no-underline">{l.description}</Link>
                      ) : l.description}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">{l.amount > 0 ? format(l.amount) : ""}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">{l.amount < 0 ? format(-l.amount) : ""}</td>
                    <td className="whitespace-nowrap py-2.5 text-right tabular-nums">{format(l.balance)}</td>
                  </tr>
                ))}
                {data.lines.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-ink-soft">No activity in this period.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border-soft font-semibold">
                  <td colSpan={4} className="py-3">{owedLabel}</td>
                  <td className="py-3 text-right tabular-nums">{format(data.closingBalance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Outstanding today, by age</p>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-6">
              {buckets.map((b) => (
                <div key={b.label} className={`rounded-lg border px-3 py-2 ${b.value > 0 && b.label !== "Not yet due" ? "border-warning/30 bg-warning-soft" : "border-border-soft"}`}>
                  <p className="text-xs text-ink-soft">{b.label}</p>
                  <p className="font-semibold tabular-nums">{format(b.value)}</p>
                </div>
              ))}
              <div className="rounded-lg border border-charcoal/20 px-3 py-2">
                <p className="text-xs text-ink-soft">Total</p>
                <p className="font-bold tabular-nums">{format(data.aging.total)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {data.openDocuments.length > 0 && (
        <Card className="print:hidden">
          <CardHeader><CardTitle>{kind === "customer" ? "Unpaid invoices" : "Unpaid deliveries"}</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border-soft text-sm">
            {data.openDocuments.map((d) => (
              <Link key={d.id} href={docHref(d.id)} className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:text-brand-dark">
                <span>
                  <span className="font-medium">{d.reference ?? new Date(d.date).toLocaleDateString()}</span>
                  <span className="text-ink-soft"> · {d.dueDate ? `due ${new Date(d.dueDate).toLocaleDateString()}` : `from ${new Date(d.date).toLocaleDateString()}`}</span>
                  {d.daysOverdue > 0 && <span className="text-danger"> · {d.daysOverdue} days overdue</span>}
                </span>
                <span className="tabular-nums">{format(d.balance)} <span className="text-ink-soft">of {format(d.total)}</span></span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
