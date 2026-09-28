"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import {
  ArrowUpRight, ArrowDownRight, AlertTriangle, Package, Users,
  DollarSign, TrendingUp, Plus, Receipt,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getBusinessConfig } from "@/lib/business-config";

interface DashboardSummary {
  revenue: number;
  revenueChange: number;
  profit: number;
  profitMargin: number;
  expenses: number;
  netCash: number;
  outstanding: number;
  overdueCount: number;
  unpaidCount: number;
  totalUnits: number;
  inventoryValue: number;
  lowStock: number;
  outOfStock: number;
  dueToday: number;
  expectedToday: number;
  topProducts: { name: string; total: number }[];
}

interface RecentInvoice {
  id: string;
  invoiceNumber: string;
  total: number;
  status: string;
  customer?: { firstName: string; lastName: string } | null;
}

// Fixed semantic colors — never randomize
const COLORS = {
  revenue: "#3b82f6",   // blue
  profit: "#10b981",    // green
  expenses: "#f97316",  // orange
};

const PIE_COLORS = ["#3b82f6", "#10b981", "#f97316", "#8b5cf6", "#ec4899"];

export default function DashboardPage() {
  const { user } = useAuth();
  const config = getBusinessConfig(user?.businessType);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [chartData, setChartData] = useState<{ month: string; revenue: number; profit: number; expenses: number }[]>([]);
  const [range, setRange] = useState(6);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ success: boolean; data: DashboardSummary }>("/dashboard/summary"),
      apiFetch<{ success: boolean; data: typeof chartData }>(`/dashboard/monthly-chart?months=${range}`),
    ])
      .then(([s, c]) => {
        if (!active) return;
        setSummary(s.data);
        setChartData(c.data);
      })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good ${getGreeting()}, ${user?.firstName || ""}`}
        description={`Here's what's happening with your ${config.label.toLowerCase()} business.`}
        actions={
          <div className="flex gap-2">
            <select
              value={range}
              onChange={(e) => setRange(Number(e.target.value))}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value={1}>This month</option>
              <option value={3}>Last 3 months</option>
              <option value={6}>Last 6 months</option>
              <option value={12}>Last 12 months</option>
            </select>
            <Link href="/dashboard/invoices/new">
              <Button>
                <Plus className="w-4 h-4 mr-1" /> Create Invoice
              </Button>
            </Link>
          </div>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Revenue"
              value={`$${summary.revenue.toLocaleString()}`}
              change={`${summary.revenueChange >= 0 ? "+" : ""}${summary.revenueChange.toFixed(1)}% vs last month`}
              trend={summary.revenueChange >= 0 ? "up" : "down"}
              icon={<DollarSign className="w-5 h-5" />}
              href="/dashboard/reports"
            />
            <KpiCard
              title="Profit"
              value={`$${summary.profit.toLocaleString()}`}
              change={`${summary.profitMargin.toFixed(1)}% margin`}
              trend={summary.profit >= 0 ? "up" : "down"}
              icon={<TrendingUp className="w-5 h-5" />}
              href="/dashboard/accounting/profit-loss"
            />
            <KpiCard
              title="Cash Flow"
              value={`${summary.netCash >= 0 ? "+" : ""}$${summary.netCash.toLocaleString()}`}
              change="Net cash"
              trend={summary.netCash >= 0 ? "up" : "down"}
              icon={<DollarSign className="w-5 h-5" />}
              href="/dashboard/accounting/accounts"
            />
            <KpiCard
              title="Outstanding"
              value={`$${summary.outstanding.toLocaleString()}`}
              change={`${summary.unpaidCount} unpaid`}
              trend="down"
              icon={<Receipt className="w-5 h-5" />}
              href="/dashboard/accounting/receivable"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Sales, Profit & Expenses</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
                     formatter={(value) => `$${Number(value).toLocaleString()}`}
                    />
                    <Legend />
                    <Bar dataKey="revenue" fill={COLORS.revenue} radius={[6, 6, 0, 0]} name="Revenue" />
                    <Bar dataKey="profit" fill={COLORS.profit} radius={[6, 6, 0, 0]} name="Profit" />
                    <Bar dataKey="expenses" fill={COLORS.expenses} radius={[6, 6, 0, 0]} name="Expenses" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Top Products</CardTitle></CardHeader>
              <CardContent>
                {summary.topProducts.length === 0 ? (
                  <p className="text-center text-neutral-400 py-12 text-sm">No sales yet</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={summary.topProducts}
                        dataKey="total"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={(entry) => entry.name}
                      >
                        {summary.topProducts.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                     <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Needs Attention
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <AttentionItem
                label="Overdue invoices"
                value={summary.overdueCount || "All clear"}
                variant={summary.overdueCount > 0 ? "danger" : "success"}
                href="/dashboard/accounting/receivable"
              />
              <AttentionItem
                label="Low stock products"
                value={summary.lowStock || "All clear"}
                variant={summary.lowStock > 0 ? "warning" : "success"}
                href="/dashboard/inventory/products"
              />
              <AttentionItem
                label={`Due today — $${summary.expectedToday.toFixed(2)}`}
                value={summary.dueToday || "None"}
                variant={summary.dueToday > 0 ? "info" : "success"}
                href="/dashboard/invoices"
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <QuickAction label="New Invoice" icon={<Plus className="w-5 h-5" />} href="/dashboard/invoices/new" />
            <QuickAction label="Add Customer" icon={<Users className="w-5 h-5" />} href="/dashboard/customers" />
            <QuickAction label="Add Product" icon={<Package className="w-5 h-5" />} href="/dashboard/inventory/products" />
            <QuickAction label="Record Expense" icon={<Receipt className="w-5 h-5" />} href="/dashboard/accounting/expenses" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RecentInvoices />
            <TopCustomers />
          </div>
        </>
      ) : null}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

interface KpiCardProps {
  title: string; value: string; change: string;
  trend: "up" | "down"; icon: React.ReactNode; href: string;
}

function KpiCard({ title, value, change, trend, icon, href }: KpiCardProps) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-neutral-500">{title}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
            </div>
            <div className="bg-brand-50 p-2 rounded-lg">{icon}</div>
          </div>
          <div className="flex items-center mt-2">
            {trend === "up"
              ? <ArrowUpRight className="w-4 h-4 text-emerald-500" />
              : <ArrowDownRight className="w-4 h-4 text-red-500" />}
            <span className={`text-sm ml-1 ${trend === "up" ? "text-emerald-600" : "text-red-600"}`}>
              {change}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function QuickAction({ label, icon, href }: { label: string; icon: React.ReactNode; href: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-neutral-200 hover:border-brand-300 hover:shadow-md transition">
      <div className="bg-brand-50 p-3 rounded-lg">{icon}</div>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

function AttentionItem({
  label, value, variant, href,
}: {
  label: string; value: string | number;
  variant: "success" | "warning" | "danger" | "info"; href: string;
}) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-lg border border-neutral-200 p-4 hover:border-brand-300 hover:bg-neutral-50 transition">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <Badge variant={variant}>{value}</Badge>
    </Link>
  );
}

function RecentInvoices() {
  const [invoices, setInvoices] = useState<RecentInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: RecentInvoice[] }>("/dashboard/recent-invoices")
      .then((r) => { if (active) setInvoices(r.data); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Invoices</CardTitle>
        <Link href="/dashboard/invoices"><Button variant="ghost" size="sm">View all</Button></Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : invoices.length === 0 ? (
          <p className="text-neutral-500 text-center py-4 text-sm">No invoices yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="pb-2">Invoice</th>
                  <th className="pb-2">Customer</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t">
                    <td className="py-2 font-medium">
                      <Link href={`/dashboard/invoices/${inv.id}`} className="text-brand-700 hover:underline">
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="py-2">
                      {inv.customer ? `${inv.customer.firstName} ${inv.customer.lastName}` : "—"}
                    </td>
                    <td className="py-2">${inv.total.toLocaleString()}</td>
                    <td className="py-2">
                      <Badge variant={inv.status === "paid" ? "success" : inv.status === "overdue" ? "danger" : "default"}>
                        {inv.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TopCustomers() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Customers</CardTitle>
        <Link href="/dashboard/customers"><Button variant="ghost" size="sm">View all</Button></Link>
      </CardHeader>
      <CardContent>
        <p className="text-neutral-500 text-center py-8 text-sm">No data available</p>
      </CardContent>
    </Card>
  );
}