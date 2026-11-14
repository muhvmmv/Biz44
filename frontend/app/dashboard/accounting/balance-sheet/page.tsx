"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useCurrency } from "@/hooks/useCurrency";

interface Item { accountId: string; code: string | null; name: string; amount: number }
interface BalanceSheet {
  asOf: string;
  ledgerStartedAt: string | null;
  assets: Item[];
  totalAssets: number;
  liabilities: Item[];
  totalLiabilities: number;
  equity: Item[];
  earnings: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
}
interface TrialBalance {
  rows: { accountId: string; code: string | null; name: string; type: string; debit: number; credit: number }[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function BalanceSheetPage() {
  const { format } = useCurrency();
  const [asOf, setAsOf] = useState(today);
  const [view, setView] = useState<"balance" | "trial">("balance");
  const [bs, setBs] = useState<BalanceSheet | null>(null);
  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ success: boolean; data: BalanceSheet }>(`/accounting/balance-sheet?asOf=${asOf}`),
      apiFetch<{ success: boolean; data: TrialBalance }>(`/accounting/trial-balance?asOf=${asOf}`),
    ])
      .then(([b, t]) => { if (active) { setBs(b.data); setTb(t.data); setError(""); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load the report"); });
    return () => { active = false; };
  }, [asOf]);

  const ok = view === "balance" ? bs?.balanced : tb?.balanced;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Balance Sheet" description="What the business owns, what it owes, and the owners' share, on a given date." />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="inline-flex rounded-full bg-white border border-border-soft p-1">
          {(["balance", "trial"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium ${view === v ? "bg-charcoal text-white" : "text-ink-soft hover:text-ink"}`}
            >
              {v === "balance" ? "Balance sheet" : "Trial balance"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          As of
          <input
            type="date"
            value={asOf}
            max={today()}
            onChange={(e) => setAsOf(e.target.value || today())}
            className="rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {bs && bs.ledgerStartedAt && new Date(`${asOf}T23:59:59.999`) < new Date(bs.ledgerStartedAt) && (
        <p className="text-sm text-ink-soft rounded-xl border border-border-soft bg-white px-4 py-3">
          The double-entry ledger started on {new Date(bs.ledgerStartedAt).toLocaleDateString()}. Balance sheets for
          earlier dates are not available.
        </p>
      )}

      {ok !== undefined && (
        <div className={`flex items-center gap-2 text-sm ${ok ? "text-success" : "text-danger"}`}>
          {ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {ok ? "Balanced" : "Does not balance — please contact support"}
        </div>
      )}

      {!bs || !tb ? (
        <Skeleton className="h-96" />
      ) : view === "balance" ? (
        <>
          <Section title="Assets" items={bs.assets} total={bs.totalAssets} totalLabel="Total assets" format={format} />
          <Section title="Liabilities" items={bs.liabilities} total={bs.totalLiabilities} totalLabel="Total liabilities" format={format} />
          <Section
            title="Equity"
            items={[...bs.equity, { accountId: "earnings", code: null, name: "Profit to date (retained earnings)", amount: bs.earnings }]}
            total={bs.totalEquity}
            totalLabel="Total equity"
            format={format}
          />
          <Card>
            <CardContent className="p-5 flex justify-between font-semibold">
              <span>Liabilities + equity</span>
              <span className="tabular-nums">{format(bs.totalLiabilitiesAndEquity)}</span>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ivory text-ink-soft text-left">
                <tr>
                  <th className="px-5 py-3 font-medium">Code</th>
                  <th className="px-5 py-3 font-medium">Account</th>
                  <th className="px-5 py-3 font-medium text-right">Debit</th>
                  <th className="px-5 py-3 font-medium text-right">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {tb.rows.map((r) => (
                  <tr key={r.accountId}>
                    <td className="px-5 py-2.5 text-ink-soft tabular-nums">{r.code || "—"}</td>
                    <td className="px-5 py-2.5">{r.name}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{r.debit ? format(r.debit) : ""}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{r.credit ? format(r.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold border-t-2 border-border-soft">
                  <td className="px-5 py-3" colSpan={2}>Total</td>
                  <td className="px-5 py-3 text-right tabular-nums">{format(tb.totalDebit)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{format(tb.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Section({
  title, items, total, totalLabel, format,
}: {
  title: string; items: Item[]; total: number; totalLabel: string; format: (n: number) => string;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && <p className="text-sm text-ink-soft">None</p>}
        {items.map((i) => (
          <div key={i.accountId} className="flex justify-between text-sm gap-4">
            <span>
              {i.code && <span className="text-ink-soft tabular-nums mr-2">{i.code}</span>}
              {i.name}
            </span>
            <span className={`tabular-nums ${i.amount < 0 ? "text-danger" : ""}`}>{format(i.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between font-semibold border-t border-border-soft pt-2">
          <span>{totalLabel}</span>
          <span className="tabular-nums">{format(total)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
