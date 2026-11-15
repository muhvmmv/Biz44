"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Landmark, Settings } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button, { ButtonLink } from "@/components/ui/Button";
import StatCard from "@/components/ui/StatCard";
import Dialog from "@/components/ui/Dialog";
import NumericInput from "@/components/ui/NumericInput";
import PaymentAccountSelect from "@/components/ui/PaymentAccountSelect";
import DataTable, { Column } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/Badge";
import { Field, Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Tabs from "@/components/ui/Tabs";
import { useCurrency } from "@/hooks/useCurrency";

interface VatInvoice {
  id: string; invoiceNumber: string; date: string; status: string; taxRate: number;
  customer: string | null; net: number; vat: number; total: number;
}
interface VatReport {
  vatRate: number;
  vatNumber: string | null;
  owed: number;
  recoverable: number;
  netDue: number;
  period: {
    charged: number; reversed: number; net: number; paid: number; adjusted: number; offset: number;
    inputPaid: number; inputReversed: number; inputNet: number; netForPeriod: number;
  };
  months: { month: string; charged: number; reversed: number; paid: number; input: number }[];
  payments: { id: string; date: string; amount: number; reference: string | null; description: string }[];
  invoices: VatInvoice[];
}

type Range = "month" | "last_month" | "quarter" | "year" | "all";

function rangeDates(r: Range): { from?: string; to?: string } {
  const now = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (r === "month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)) };
  if (r === "last_month") return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
  if (r === "quarter") return { from: iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)) };
  if (r === "year") return { from: iso(new Date(now.getFullYear(), 0, 1)) };
  return {};
}

const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
};

export default function TaxPage() {
  const { format } = useCurrency();
  const router = useRouter();
  const [range, setRange] = useState<Range>("month");
  const [report, setReport] = useState<VatReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  const [showPay, setShowPay] = useState(false);
  const [amount, setAmount] = useState(0);
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");

  const query = useMemo(() => {
    const { from, to } = rangeDates(range);
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return q.toString();
  }, [range]);

  const load = useCallback(
    () => apiFetch<{ success: boolean; data: VatReport }>(`/accounting/vat${query ? `?${query}` : ""}`).then((r) => r.data),
    [query]
  );

  useEffect(() => {
    let active = true;
    load()
      .then((d) => { if (active) { setReport(d); setError(null); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load VAT"); });
    return () => { active = false; };
  }, [load, key]);

  const [offsetting, setOffsetting] = useState(false);
  const [offsetError, setOffsetError] = useState("");
  const offset = async () => {
    setOffsetting(true);
    setOffsetError("");
    try {
      await apiFetch("/accounting/vat/offset", { method: "POST", body: JSON.stringify({}) });
      setKey((k) => k + 1);
    } catch (e: unknown) {
      setOffsetError(e instanceof Error ? e.message : "Could not set off input VAT");
    } finally {
      setOffsetting(false);
    }
  };

  const openPay = () => {
    setAmount(report?.owed ?? 0);
    setReference("");
    setDate("");
    setPayError("");
    setShowPay(true);
  };

  const pay = async () => {
    setPayError("");
    if (!(amount > 0)) return setPayError("Enter the amount paid");
    if (!accountId) return setPayError("Choose the account it was paid from");
    setPaying(true);
    try {
      await apiFetch("/accounting/vat/payments", {
        method: "POST",
        body: JSON.stringify({ amount, accountId, date: date || undefined, reference: reference || undefined }),
      });
      setShowPay(false);
      setKey((k) => k + 1);
    } catch (e: unknown) {
      setPayError(e instanceof Error ? e.message : "Could not record the payment");
    } finally {
      setPaying(false);
    }
  };

  const columns: Column<VatInvoice>[] = [
    { key: "number", header: "Invoice", sortValue: (i) => i.invoiceNumber, cell: (i) => <span className="font-medium">{i.invoiceNumber}</span> },
    { key: "customer", header: "Customer", hideBelow: "sm", sortValue: (i) => i.customer ?? "", cell: (i) => i.customer ?? "—" },
    { key: "date", header: "Date", hideBelow: "md", sortValue: (i) => new Date(i.date), cell: (i) => <span className="text-ink-soft">{new Date(i.date).toLocaleDateString()}</span> },
    { key: "net", header: "Before VAT", align: "right", hideBelow: "sm", sortValue: (i) => i.net, cell: (i) => format(i.net) },
    { key: "vat", header: "VAT", align: "right", sortValue: (i) => i.vat, cell: (i) => <span>{format(i.vat)}<span className="block text-xs text-ink-soft">{i.taxRate}%</span></span> },
    { key: "status", header: "Status", hideBelow: "md", sortValue: (i) => i.status, cell: (i) => <StatusBadge status={i.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="VAT"
        description="VAT you charge customers is owed to the tax authority; VAT you pay suppliers is recovered from it. Neither is part of your sales or costs."
        actions={
          <>
            <ButtonLink href="/dashboard/settings?tab=localization" variant="outline"><Settings size={16} /> VAT rate</ButtonLink>
            <Button onClick={openPay} disabled={!report || report.owed <= 0}><Landmark size={16} /> Record VAT payment</Button>
          </>
        }
      />

      {report && report.vatRate === 0 && report.owed === 0 && report.invoices.length === 0 && (
        <Card>
          <CardContent className="py-5 text-sm">
            You aren&apos;t charging VAT yet. Set your VAT rate in{" "}
            <Link href="/dashboard/settings?tab=localization" className="font-medium text-brand-dark hover:underline">Settings</Link>{" "}
            and it will be added to new invoices.
          </CardContent>
        </Card>
      )}

      <Tabs
        value={range}
        onChange={setRange}
        options={[
          { value: "month", label: "This month" },
          { value: "last_month", label: "Last month" },
          { value: "quarter", label: "This quarter" },
          { value: "year", label: "This year" },
          { value: "all", label: "All time" },
        ]}
      />

      {report && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Net VAT due now" value={format(report.netDue)} tone={report.netDue > 0 ? "negative" : report.netDue < 0 ? "positive" : "default"} hint={report.netDue < 0 ? "More input VAT than output: reclaimable" : report.vatNumber ? `VAT ID ${report.vatNumber}` : `Rate ${report.vatRate}%`} />
          <StatCard label="Output VAT (on sales)" value={format(report.period.net)} hint={report.period.reversed > 0 ? `${format(report.period.charged)} charged, ${format(report.period.reversed)} reversed` : "Charged in period"} />
          <StatCard label="Input VAT (on purchases)" value={format(report.period.inputNet)} hint={report.period.inputReversed > 0 ? `${format(report.period.inputReversed)} returned to suppliers` : "Paid in period, recoverable"} />
          <StatCard label="Paid to tax authority" value={format(report.period.paid)} hint="In period" />
        </div>
      )}

      {report && report.owed > 0 && report.recoverable > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-5 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p>
              You owe <span className="font-semibold">{format(report.owed)}</span> output VAT and can recover{" "}
              <span className="font-semibold">{format(report.recoverable)}</span> input VAT. When you file your return, set the input VAT
              against what you owe, then pay the difference.
            </p>
            <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
              <Button variant="outline" onClick={offset} isLoading={offsetting}>Set off {format(Math.min(report.owed, report.recoverable))}</Button>
              {offsetError && <span className="text-danger" role="alert">{offsetError}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {report && report.months.length > 0 && (
        <Card>
          <CardHeader><CardTitle>By month</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-border-soft bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-soft">
                  <tr>
                    <th className="px-5 py-3 font-medium">Month</th>
                    <th className="px-5 py-3 text-right font-medium">Charged</th>
                    <th className="px-5 py-3 text-right font-medium">Reversed</th>
                    <th className="px-5 py-3 text-right font-medium">Net output</th>
                    <th className="px-5 py-3 text-right font-medium">Input</th>
                    <th className="px-5 py-3 text-right font-medium">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {report.months.map((m) => (
                    <tr key={m.month}>
                      <td className="px-5 py-3">{monthLabel(m.month)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{format(m.charged)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-ink-soft">{m.reversed ? format(m.reversed) : "—"}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium">{format(m.charged - m.reversed)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{m.input ? format(m.input) : "—"}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{m.paid ? format(m.paid) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-base font-semibold">Invoices with VAT</h2>
        <DataTable
          rows={report ? report.invoices : error ? [] : null}
          columns={columns}
          rowKey={(i) => i.id}
          searchText={(i) => `${i.invoiceNumber} ${i.customer ?? ""}`}
          searchPlaceholder="Search invoice or customer"
          error={error}
          onRetry={() => setKey((k) => k + 1)}
          onRowClick={(i) => router.push(`/dashboard/invoices/${i.id}`)}
          rowLabel={(i) => `Open ${i.invoiceNumber}`}
          empty={{ title: "No VAT charged in this period", description: "Invoices with VAT appear here once they are finalized." }}
        />
      </div>

      {report && report.payments.length > 0 && (
        <Card>
          <CardHeader><CardTitle>VAT payments</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border-soft text-sm">
            {report.payments.map((p) => (
              <div key={p.id} className="flex justify-between gap-3 py-2.5">
                <span>
                  {new Date(p.date).toLocaleDateString()}
                  {p.reference && <span className="text-ink-soft"> · {p.reference}</span>}
                </span>
                <span className="tabular-nums font-medium">{format(p.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={showPay}
        onClose={() => setShowPay(false)}
        title="Record VAT payment"
        description="Money paid to the tax authority. It reduces VAT owed and the account it was paid from."
        footer={<><Button variant="outline" onClick={() => setShowPay(false)}>Cancel</Button><Button onClick={pay} isLoading={paying}>Record payment</Button></>}
      >
        <Field label="Amount" hint={report ? `${format(report.owed)} owed` : undefined}>
          <NumericInput min={0} value={amount} onChange={setAmount} />
        </Field>
        <Field label="Paid from"><PaymentAccountSelect value={accountId} onChange={setAccountId} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. receipt no." /></Field>
        </div>
        {payError && <p className="text-sm text-danger" role="alert">{payError}</p>}
      </Dialog>
    </div>
  );
}
