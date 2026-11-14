"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import StatCard from "@/components/ui/StatCard";
import { Card, CardContent } from "@/components/ui/Card";
import PeriodPicker, { makePeriod, periodQuery, Period } from "@/components/accounting/PeriodPicker";
import { useCurrency } from "@/hooks/useCurrency";
import { SOURCE_LABELS } from "@/lib/ledgerLabels";

interface Statement {
  account: { id: string; name: string; type: string; bankName: string | null; accountNumber: string | null; balance: number };
  opening: number;
  closing: number;
  rows: {
    entryId: string;
    date: string;
    description: string;
    sourceType: string;
    reference: string | null;
    debit: number;
    credit: number;
    balance: number;
  }[];
}

export default function AccountStatementPage() {
  const { id } = useParams<{ id: string }>();
  const { format } = useCurrency();
  const [period, setPeriod] = useState<Period>(() => makePeriod("this_month"));
  const [data, setData] = useState<Statement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Statement }>(`/accounting/accounts/${id}/statement${periodQuery(period)}`)
      .then((r) => { if (active) { setData(r.data); setError(""); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load the statement"); });
    return () => { active = false; };
  }, [id, period]);

  // For money accounts, a debit is money in and a credit is money out.
  const isAsset = data?.account.type === "asset";
  const totalIn = data?.rows.reduce((s, r) => s + (isAsset ? r.debit : r.credit), 0) ?? 0;
  const totalOut = data?.rows.reduce((s, r) => s + (isAsset ? r.credit : r.debit), 0) ?? 0;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/accounting/accounts" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={16} /> Cash & Banks
      </Link>
      <PageHeader
        title={data?.account.name ?? "Statement"}
        description={[data?.account.bankName, data?.account.accountNumber].filter(Boolean).join(" · ") || "Account statement"}
      />
      <PeriodPicker value={period} onChange={setPeriod} />
      {error && <p className="text-sm text-danger">{error}</p>}

      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Opening balance" value={format(data.opening)} />
            <StatCard label="Money in" value={format(totalIn)} tone="positive" />
            <StatCard label="Money out" value={format(totalOut)} tone="negative" />
            <StatCard label="Closing balance" value={format(data.closing)} />
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {data.rows.length === 0 ? (
                <p className="text-sm text-ink-soft text-center py-12">No movements in this period.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-ivory text-ink-soft text-left">
                    <tr>
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Details</th>
                      <th className="px-5 py-3 font-medium text-right">In</th>
                      <th className="px-5 py-3 font-medium text-right">Out</th>
                      <th className="px-5 py-3 font-medium text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-soft">
                    {data.rows.map((r, i) => {
                      const inAmt = isAsset ? r.debit : r.credit;
                      const outAmt = isAsset ? r.credit : r.debit;
                      return (
                        <tr key={`${r.entryId}-${i}`}>
                          <td className="px-5 py-3 text-ink-soft whitespace-nowrap">{new Date(r.date).toLocaleDateString()}</td>
                          <td className="px-5 py-3">
                            <p className="text-ink">{r.description}</p>
                            <p className="text-xs text-ink-soft">
                              {SOURCE_LABELS[r.sourceType] || r.sourceType}
                              {r.reference ? ` · ${r.reference}` : ""}
                            </p>
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums text-success">{inAmt ? format(inAmt) : ""}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-danger">{outAmt ? format(outAmt) : ""}</td>
                          <td className="px-5 py-3 text-right tabular-nums font-medium">{format(r.balance)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
