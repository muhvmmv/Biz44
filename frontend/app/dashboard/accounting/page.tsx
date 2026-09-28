"use client";

import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import {
  Receipt,
  DollarSign,
  TrendingUp,
  Wallet,
  ArrowRight,
} from "lucide-react";

const links = [
  { title: "Transactions", desc: "All financial movements", href: "/dashboard/accounting/transactions", icon: Receipt, color: "text-brand-600 bg-brand-50" },
  { title: "Expenses", desc: "Record and review expenses", href: "/dashboard/accounting/expenses", icon: DollarSign, color: "text-red-600 bg-red-50" },
  { title: "Accounts Receivable", desc: "Money customers owe you", href: "/dashboard/accounting/receivable", icon: TrendingUp, color: "text-amber-600 bg-amber-50" },
  { title: "Cash & Banks", desc: "Balances and movement", href: "/dashboard/accounting/accounts", icon: Wallet, color: "text-violet-600 bg-violet-50" },
  { title: "Profit & Loss", desc: "Income statement", href: "/dashboard/accounting/profit-loss", icon: TrendingUp, color: "text-emerald-600 bg-emerald-50" },
];

export default function AccountingOverviewPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounting"
        description="Manage your financial records and reports."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {links.map(({ title, desc, href, icon: Icon, color }) => (
          <Link key={href} href={href}>
            <Card className="hover:shadow-md hover:border-brand-200 transition-all cursor-pointer h-full">
              <CardContent className="p-6">
                <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center mb-4`}>
                  <Icon size={22} />
                </div>
                <h3 className="font-semibold text-neutral-900">{title}</h3>
                <p className="text-sm text-neutral-500 mt-1">{desc}</p>
                <div className="flex items-center gap-1 text-brand-600 text-sm font-medium mt-4">
                  View <ArrowRight size={14} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}