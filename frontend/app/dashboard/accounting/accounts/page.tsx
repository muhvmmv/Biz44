"use client";

import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Receipt, DollarSign, TrendingUp, Wallet, ArrowRight } from "lucide-react";

const links = [
  { title: "Transactions", desc: "All financial movements", href: "/dashboard/accounting/transactions", icon: Receipt, color: "text-rose-vale bg-rose-light" },
  { title: "Expenses", desc: "Record and review expenses", href: "/dashboard/accounting/expenses", icon: DollarSign, color: "text-danger bg-[#F4E2E1]" },
  { title: "Accounts Receivable", desc: "Money customers owe you", href: "/dashboard/accounting/receivable", icon: TrendingUp, color: "text-warning bg-[#F7EEDC]" },
  { title: "Cash & Banks", desc: "Balances and movement", href: "/dashboard/accounting/accounts", icon: Wallet, color: "text-navy bg-navy-light" },
  { title: "Profit & Loss", desc: "Income statement", href: "/dashboard/accounting/profit-loss", icon: TrendingUp, color: "text-success bg-[#E6F0EA]" },
];

export default function AccountingOverviewPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Accounting" description="Manage your financial records and reports." />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {links.map(({ title, desc, href, icon: Icon, color }) => (
          <Link key={href} href={href}>
            <Card className="hover:shadow-md hover:border-rose-vale transition-all cursor-pointer h-full">
              <CardContent className="p-6">
                <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center mb-4`}>
                  <Icon size={22} />
                </div>
                <h3 className="font-semibold text-ink">{title}</h3>
                <p className="text-sm text-ink-soft mt-1">{desc}</p>
                <div className="flex items-center gap-1 text-rose-vale text-sm font-medium mt-4">
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