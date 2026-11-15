"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell, LabelList,
} from "recharts";
import {
  ArrowUpRight, ArrowDownRight, AlertTriangle, Package, Users,
  DollarSign, TrendingUp, Plus, Receipt, ShoppingCart,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocationVersion } from "@/hooks/useLocationRefetch";
import { getBusinessConfig } from "@/lib/business-config";
import { formatQty } from "@/lib/units";
import { can } from "@/lib/permissions";

interface DashboardSummary {
  revenue: number;
  revenueChange: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  opex: number;
  netProfit: number;
  netMargin: number;
  profit: number;
  profitMargin: number;
  expenses: number;
  netCash: number;
  totalCash: number;
  cashIn: number;
  cashOut: number;
  cashAccounts: { id: string; name: string; subtype: string; balance: number }[];
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
  supplierOutstanding: number;
  supplierUnpaidCount: number;
  supplierOverdueAmount: number;
  supplierOverdueCount: number;
  inventoryByStage?: { raw: number; wip: number; finished: number };
  production?: {
    completedOrders: number;
    inProgressOrders: number;
    draftOrders: number;
    totalCost: number;
    wipValue: number;
    products: { name: string; unit: string; produced: number; unitCost: number; yieldPercent: number | null }[];
  };
}

interface RecentInvoice {
  id: string;
  invoiceNumber: string;
  total: number;
  status: string;
  customer?: { firstName: string; lastName: string } | null;
}

const CHART = {
  revenue: "#F05A28",
  profit: "#4F8068",
  loss: "#B94A48",
  expenses: "#A1A1AA",
};

const PIE_COLORS = ["#F05A28", "#1C1C1F", "#3B82F6", "#16A34A", "#A1A1AA", "#0D9488"];

function formatCompact(value: number, currency: string): string {
  const symbol =
    currency === "NGN" ? "₦" :
    currency === "USD" ? "$" :
    currency === "EUR" ? "€" :
    currency === "GBP" ? "£" :
    currency === "KES" ? "KSh" :
    currency === "GHS" ? "₵" :
    currency === "ZAR" ? "R" :
    currency === "INR" ? "₹" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${symbol}${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${symbol}${(value / 1_000).toFixed(0)}k`;
  return `${symbol}${value.toFixed(0)}`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { format, currency } = useCurrency();
  const version = useLocationVersion();
  const config = getBusinessConfig(user?.businessType);
  const perms = user?.permissions;
  const canMoney = can(perms, "money");
  const canSales = can(perms, "sales");

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [chartData, setChartData] = useState<{
    month: string;
    revenue: number;
    cogs: number;
    opex: number;
    grossProfit: number;
    netProfit: number;
  }[]>([]);
  const [range, setRange] = useState(12);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.all([
      apiFetch<{ success: boolean; data: DashboardSummary }>(`/dashboard/summary?months=${range}`),
      canMoney
        ? apiFetch<{ success: boolean; data: typeof chartData }>(`/dashboard/monthly-chart?months=${range}`)
        : Promise.resolve({ success: true, data: [] as typeof chartData }),
    ])
      .then(([s, c]) => {
        if (!active) return;
        setSummary(s.data);
        setChartData(c.data);
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [range, version, canMoney]);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            Good {getGreeting()}, {user?.firstName || "there"}
          </h1>
          <p className="text-ink-soft mt-1 text-sm">
            Here&apos;s what&apos;s happening with your {config.label.toLowerCase()} business.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={range}
            onChange={(e) => {
              setLoading(true);
              setRange(Number(e.target.value));
            }}
            className="border border-border-soft rounded-lg px-3 py-2 text-sm bg-white text-charcoal focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value={1}>This month</option>
            <option value={3}>Last 3 months</option>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
          </select>
          {can(perms, "sales", "write") && (
            <Link href="/dashboard/invoices/new">
              <Button>
                <Plus className="w-4 h-4 mr-1" /> Create Invoice
              </Button>
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : summary ? (
        <>
          {/* KPI CARDS */}
          {canMoney && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title={range === 1 ? "Revenue this month" : `Revenue · ${range} months`}
              value={format(summary.revenue)}
              change={`${summary.revenueChange >= 0 ? "+" : ""}${summary.revenueChange.toFixed(1)}% vs last month`}
              trend={summary.revenueChange >= 0 ? "up" : "down"}
              icon={<DollarSign className="w-5 h-5" />}
              accent="rose"
              href="/dashboard/reports"
            />
            <KpiCard
              title="Gross Profit"
              value={format(summary.grossProfit)}
              change={`${summary.grossMargin.toFixed(1)}% gross margin`}
              trend={summary.grossProfit >= 0 ? "up" : "down"}
              icon={<TrendingUp className="w-5 h-5" />}
              accent="charcoal"
              href="/dashboard/accounting/profit-loss"
            />
            <KpiCard
              title="Net Profit"
              value={format(summary.netProfit)}
              change={`${summary.netMargin.toFixed(1)}% net margin`}
              trend={summary.netProfit >= 0 ? "up" : "down"}
              icon={<TrendingUp className="w-5 h-5" />}
              accent={summary.netProfit >= 0 ? "green" : "terracotta"}
              href="/dashboard/accounting/profit-loss"
            />
            <KpiCard
              title="Outstanding"
              value={format(summary.outstanding)}
              change={`${summary.unpaidCount} unpaid`}
              trend="down"
              icon={<Receipt className="w-5 h-5" />}
              accent="terracotta"
              href="/dashboard/accounting/receivable"
            />
          </div>
          )}

          {/* CASH POSITION */}
          {canMoney && (
          <Card>
            <CardHeader>
              <CardTitle>Cash position</CardTitle>
              <Link href="/dashboard/accounting/accounts" className="text-sm font-medium text-brand-dark hover:underline">
                Cash &amp; Banks
              </Link>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="col-span-2 rounded-xl bg-charcoal text-white p-4">
                  <p className="text-xs text-white/70">Total cash &amp; bank</p>
                  <p className="text-2xl font-bold tabular-nums mt-1">{format(summary.totalCash)}</p>
                  <p className="text-xs text-white/70 mt-1">
                    In {format(summary.cashIn)} · Out {format(summary.cashOut)}
                  </p>
                </div>
                {summary.cashAccounts.map((a) => (
                  <Link
                    key={a.id}
                    href={`/dashboard/accounting/accounts/${a.id}`}
                    className="rounded-xl border border-border-soft p-4 hover:border-brand transition-colors"
                  >
                    <p className="text-xs text-ink-soft truncate">{a.name}</p>
                    <p className={`text-lg font-semibold tabular-nums mt-1 ${a.balance < 0 ? "text-danger" : "text-ink"}`}>
                      {format(a.balance)}
                    </p>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
          )}

          {summary.inventoryByStage && summary.production && (
            <FactoryOverview stages={summary.inventoryByStage} production={summary.production} format={format} />
          )}

          {/* CHARTS */}
          {canMoney && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Sales, Profit &amp; Expenses</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart
                    data={chartData}
                    margin={{ top: 28, right: 12, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5DFDC" />
                    <XAxis dataKey="month" fontSize={12} stroke="#6B6563" />
                    <YAxis
                      fontSize={12}
                      stroke="#6B6563"
                      domain={[0, (dataMax: number) => dataMax * 1.18]}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #E5DFDC",
                        background: "#fff",
                      }}
                      formatter={(value) => format(Number(value))}
                    />
                    <Legend />

                    <Bar dataKey="revenue" fill={CHART.revenue} radius={[6, 6, 0, 0]} name="Revenue">
                      <LabelList
                        dataKey="revenue"
                        position="top"
                        formatter={(v) => formatCompact(Number(v), currency)}
                        style={{ fontSize: 10, fill: "#6B6563", fontWeight: 600 }}
                      />
                    </Bar>

                    <Bar dataKey="netProfit" fill={CHART.profit} radius={[6, 6, 0, 0]} name="Net Profit">
                      {chartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.netProfit >= 0 ? CHART.profit : CHART.loss}
                        />
                      ))}
                      <LabelList
                        dataKey="netProfit"
                        position="top"
                        formatter={(v) => formatCompact(Number(v), currency)}
                        style={{ fontSize: 10, fill: "#6B6563", fontWeight: 600 }}
                      />
                    </Bar>

                    <Bar dataKey="opex" fill={CHART.expenses} radius={[6, 6, 0, 0]} name="Expenses">
                      <LabelList
                        dataKey="opex"
                        position="top"
                        formatter={(v) => formatCompact(Number(v), currency)}
                        style={{ fontSize: 10, fill: "#6B6563", fontWeight: 600 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Products</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.topProducts.length === 0 ? (
                  <p className="text-center text-ink-soft py-12 text-sm">No sales yet</p>
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
                      <Tooltip formatter={(v) => format(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          )}

          {/* NEEDS ATTENTION — now 4 columns including supplier outstanding */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-warning" />
                Needs Attention
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {summary.overdueCount !== null && (
              <AttentionItem
                label="Overdue invoices"
                value={summary.overdueCount || "All clear"}
                variant={summary.overdueCount > 0 ? "danger" : "success"}
                href="/dashboard/accounting/receivable"
              />
              )}
              {summary.supplierUnpaidCount !== null && (
              <AttentionItem
                label="Supplier payments due"
                value={
                  summary.supplierOverdueCount > 0
                    ? `${summary.supplierOverdueCount} overdue`
                    : summary.supplierUnpaidCount > 0
                    ? `${summary.supplierUnpaidCount} unpaid`
                    : "All clear"
                }
                variant={
                  summary.supplierOverdueCount > 0
                    ? "danger"
                    : summary.supplierUnpaidCount > 0
                    ? "warning"
                    : "success"
                }
                href="/dashboard/purchases?status=unpaid"
                sublabel={
                  summary.supplierOutstanding > 0
                    ? format(summary.supplierOutstanding)
                    : undefined
                }
              />
              )}
              {summary.lowStock !== null && (
              <AttentionItem
                label="Low stock products"
                value={summary.lowStock || "All clear"}
                variant={summary.lowStock > 0 ? "warning" : "success"}
                href="/dashboard/inventory/products"
              />
              )}
              {summary.dueToday !== null && (
              <AttentionItem
                label={`Due today — ${format(summary.expectedToday)}`}
                value={summary.dueToday || "None"}
                variant={summary.dueToday > 0 ? "info" : "success"}
                href="/dashboard/invoices"
              />
              )}
            </CardContent>
          </Card>

          {/* QUICK ACTIONS */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {can(perms, "sales", "write") && <QuickAction label="New Invoice" icon={<Plus className="w-5 h-5" />} href="/dashboard/invoices/new" />}
            {can(perms, "sales", "write") && <QuickAction label="Add Customer" icon={<Users className="w-5 h-5" />} href="/dashboard/customers?new=1" />}
            {can(perms, "inventory", "write") && <QuickAction label="Add Product" icon={<Package className="w-5 h-5" />} href="/dashboard/inventory/products?new=1" />}
            {can(perms, "purchasing", "write") && <QuickAction label="Receive Inventory" icon={<ShoppingCart className="w-5 h-5" />} href="/dashboard/inventory/receive" />}
            {can(perms, "money", "write") && <QuickAction label="Record Expense" icon={<Receipt className="w-5 h-5" />} href="/dashboard/accounting/expenses?new=1" />}
          </div>

          {canSales && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <RecentInvoices version={version} format={format} />
              <TopCustomers />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function FactoryOverview({
  stages,
  production,
  format,
}: {
  stages: NonNullable<DashboardSummary["inventoryByStage"]>;
  production: NonNullable<DashboardSummary["production"]>;
  format: (n: number) => string;
}) {
  const total = stages.raw + stages.wip + stages.finished;
  const parts = [
    { key: "raw", label: "Raw materials & packaging", value: stages.raw, color: "bg-charcoal" },
    { key: "wip", label: "Work in progress", value: stages.wip, color: "bg-brand-dark" },
    { key: "finished", label: "Finished goods", value: stages.finished, color: "bg-brand" },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Inventory by stage</CardTitle>
          <Link href="/dashboard/inventory/products" className="text-sm text-brand-dark hover:underline">Products</Link>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-2xl font-bold tabular-nums">{format(total)}</p>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
            {total > 0 && parts.map((p) => (
              <div key={p.key} className={p.color} style={{ width: `${(p.value / total) * 100}%` }} />
            ))}
          </div>
          <ul className="space-y-2 text-sm">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-ink-soft">
                  <span className={`h-2.5 w-2.5 rounded-full ${p.color}`} /> {p.label}
                </span>
                <span className="tabular-nums font-medium">{format(p.value)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Production this month</CardTitle>
          <Link href="/dashboard/production" className="text-sm text-brand-dark hover:underline">Production</Link>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-ink-soft">Completed</p>
              <p className="text-xl font-bold tabular-nums">{production.completedOrders}</p>
            </div>
            <div>
              <p className="text-ink-soft">Running</p>
              <p className="text-xl font-bold tabular-nums">{production.inProgressOrders}</p>
              {production.draftOrders > 0 && <p className="text-xs text-ink-soft">{production.draftOrders} planned</p>}
            </div>
            <div>
              <p className="text-ink-soft">Cost</p>
              <p className="text-xl font-bold tabular-nums">{format(production.totalCost)}</p>
            </div>
          </div>
          {production.products.length === 0 ? (
            <p className="text-sm text-ink-soft">No production completed this month yet.</p>
          ) : (
            <ul className="divide-y divide-border-soft text-sm">
              {production.products.slice(0, 4).map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">{p.name}</span>
                    <span className="block text-xs text-ink-soft">
                      {formatQty(p.produced, p.unit)}
                      {p.yieldPercent !== null ? ` · ${p.yieldPercent}% yield` : ""}
                    </span>
                  </span>
                  <span className="tabular-nums text-ink-soft">{format(p.unitCost)} / {p.unit}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
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
  title: string;
  value: string;
  change: string;
  trend: "up" | "down";
  icon: React.ReactNode;
  href: string;
  accent: "rose" | "charcoal" | "green" | "terracotta";
}

function KpiCard({ title, value, change, trend, icon, href, accent }: KpiCardProps) {
  const accents = {
    rose: "bg-brand-light text-brand-dark",
    charcoal: "bg-charcoal-light text-charcoal",
    green: "bg-green-50 text-success",
    terracotta: "bg-red-50 text-danger",
  };
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-ink-soft">{title}</p>
              <p className="text-2xl font-bold mt-1 text-ink">{value}</p>
            </div>
            <div className={`p-2 rounded-lg ${accents[accent]}`}>{icon}</div>
          </div>
          <div className="flex items-center mt-2">
            {trend === "up" ? (
              <ArrowUpRight className="w-4 h-4 text-success" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-danger" />
            )}
            <span className={`text-sm ml-1 ${trend === "up" ? "text-success" : "text-danger"}`}>
              {change}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function QuickAction({
  label,
  icon,
  href,
}: {
  label: string;
  icon: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-border-soft hover:border-brand hover:shadow-md transition"
    >
      <div className="bg-brand-light p-3 rounded-lg text-brand-dark">{icon}</div>
      <span className="text-sm font-medium text-ink text-center">{label}</span>
    </Link>
  );
}

function AttentionItem({
  label,
  value,
  variant,
  href,
  sublabel,
}: {
  label: string;
  value: string | number;
  variant: "success" | "warning" | "danger" | "info";
  href: string;
  sublabel?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start justify-between gap-3 rounded-lg border border-border-soft p-4 hover:border-brand hover:bg-ivory transition"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink truncate">{label}</p>
        {sublabel && (
          <p className="text-xs text-ink-soft mt-0.5 truncate">{sublabel}</p>
        )}
      </div>
      <Badge variant={variant}>{value}</Badge>
    </Link>
  );
}

function RecentInvoices({
  version,
  format,
}: {
  version: number;
  format: (n: number) => string;
}) {
  const [invoices, setInvoices] = useState<RecentInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: RecentInvoice[] }>("/dashboard/recent-invoices")
      .then((r) => {
        if (active) setInvoices(r.data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [version]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Invoices</CardTitle>
        <Link href="/dashboard/invoices">
          <Button variant="ghost" size="sm">
            View all
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <p className="text-ink-soft text-center py-4 text-sm">No invoices yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-ink-soft">
                <tr>
                  <th className="pb-2">Invoice</th>
                  <th className="pb-2">Customer</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-border-soft">
                    <td className="py-2 font-medium">
                      <Link
                        href={`/dashboard/invoices/${inv.id}`}
                        className="text-brand-dark hover:underline"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="py-2 text-ink-soft">
                      {inv.customer
                        ? `${inv.customer.firstName} ${inv.customer.lastName}`
                        : "—"}
                    </td>
                    <td className="py-2 text-ink">{format(inv.total)}</td>
                    <td className="py-2">
                      <Badge
                        variant={
                          inv.status === "paid"
                            ? "success"
                            : inv.status === "overdue"
                            ? "danger"
                            : "default"
                        }
                      >
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
        <Link href="/dashboard/customers">
          <Button variant="ghost" size="sm">
            View all
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <p className="text-ink-soft text-center py-8 text-sm">No data available</p>
      </CardContent>
    </Card>
  );
}