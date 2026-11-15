"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wallet, Landmark, ArrowDownLeft, ArrowUpRight, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { reportError } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import StatCard from "@/components/ui/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocationVersion } from "@/hooks/useLocationRefetch";

interface PL {
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  totalOpex: number;
  netProfit: number;
  netMargin: number;
}
interface Overview {
  ledgerStartedAt: string | null;
  cashAccounts: { id: string; name: string; subtype: string; bankName: string | null; balance: number }[];
  totalCash: number;
  receivables: number;
  payables: number;
  thisMonth: PL;
  yearToDate: PL;
}

const LINKS = [
  { href: "/dashboard/accounting/accounts", label: "Cash & Banks", text: "Balances, transfers, statements" },
  { href: "/dashboard/accounting/profit-loss", label: "Profit & Loss", text: "Revenue, costs and profit" },
  { href: "/dashboard/accounting/balance-sheet", label: "Balance Sheet", text: "Assets, liabilities, equity" },
  { href: "/dashboard/accounting/journal", label: "Journal", text: "Every double entry" },
];

export default function AccountingOverviewPage() {
  const { format } = useCurrency();
  const version = useLocationVersion();
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Overview }>("/accounting/overview")
      .then((r) => { if (active) setData(r.data); })
      .catch((e: unknown) => reportError(e, "Could not load this page"));
    return () => { active = false; };
  }, [version]);

  return (
    <div className="space-y-6">
      <PageHeader title="Accounting" description="Where the money is, what's owed, and how the business is performing." />

      {!data ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Cash and bank" value={format(data.totalCash)} icon={<Landmark size={18} />} />
            <Link href="/dashboard/accounting/receivable">
              <StatCard label="Customers owe you" value={format(data.receivables)} icon={<ArrowDownLeft size={18} />} hint="Receivables" className="hover:shadow-md transition-shadow h-full" />
            </Link>
            <Link href="/dashboard/accounting/payable">
              <StatCard label="You owe suppliers" value={format(data.payables)} icon={<ArrowUpRight size={18} />} hint="Payables" className="hover:shadow-md transition-shadow h-full" />
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PnlCard title="This month" pl={data.thisMonth} format={format} />
            <PnlCard title="This year" pl={data.yearToDate} format={format} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cash and bank accounts</CardTitle>
              <Link href="/dashboard/accounting/accounts" className="text-sm font-medium text-brand-dark hover:underline">Manage</Link>
            </CardHeader>
            <CardContent className="divide-y divide-border-soft">
              {data.cashAccounts.map((a) => {
                const Icon = a.subtype === "bank" ? Landmark : Wallet;
                return (
                  <Link key={a.id} href={`/dashboard/accounting/accounts/${a.id}`} className="flex items-center justify-between py-3 hover:text-brand-dark">
                    <span className="flex items-center gap-3">
                      <Icon size={16} className="text-brand" />
                      <span>{a.name}{a.bankName ? <span className="text-ink-soft text-sm"> · {a.bankName}</span> : null}</span>
                    </span>
                    <span className={`tabular-nums font-medium ${a.balance < 0 ? "text-danger" : ""}`}>{format(a.balance)}</span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-2xl border border-border-soft bg-white p-5 hover:shadow-md transition-shadow">
                <p className="font-semibold text-ink flex items-center justify-between">{l.label} <ChevronRight size={16} className="text-ink-soft" /></p>
                <p className="text-sm text-ink-soft mt-1">{l.text}</p>
              </Link>
            ))}
          </div>

          {data.ledgerStartedAt && (
            <p className="text-xs text-ink-soft">
              Double-entry ledger in use since {new Date(data.ledgerStartedAt).toLocaleDateString()}. Earlier profit and loss
              comes from the records kept before then.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function PnlCard({ title, pl, format }: { title: string; pl: PL; format: (n: number) => string }) {
  const rows: [string, number, string?][] = [
    ["Revenue", pl.revenue],
    ["Cost of goods sold", -pl.cogs],
    ["Gross profit", pl.grossProfit, `${pl.grossMargin.toFixed(1)}%`],
    ["Operating expenses", -pl.totalOpex],
  ];
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rows.map(([label, value, note]) => (
          <div key={label} className="flex justify-between">
            <span className="text-ink-soft">{label}{note ? <span className="ml-2 text-xs">{note}</span> : null}</span>
            <span className="tabular-nums">{format(value)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-border-soft pt-2 font-semibold">
          <span>Net profit <span className="ml-1 text-xs font-normal text-ink-soft">{pl.netMargin.toFixed(1)}%</span></span>
          <span className={`tabular-nums ${pl.netProfit >= 0 ? "text-success" : "text-danger"}`}>{format(pl.netProfit)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
