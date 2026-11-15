"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  Area, AreaChart, Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertCircle, ArrowDownRight, ArrowUpRight, Boxes, CalendarClock, ChevronRight, Factory, FileText, Landmark,
  PackageX, Receipt, TrendingUp, Truck, Wallet,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { reportError } from "@/components/ui/Feedback";
import CountUp from "@/components/dashboard/CountUp";
import { StatusBadge } from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocation } from "@/hooks/useLocation";
import { useLocationVersion } from "@/hooks/useLocationRefetch";
import { useChartColors } from "@/hooks/useTheme";
import { formatQty } from "@/lib/units";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- types
interface Summary {
  revenue: number | null;
  revenueChange: number | null;
  grossProfit: number | null;
  grossMargin: number | null;
  netProfit: number | null;
  netMargin: number | null;
  opex: number | null;
  cogs: number | null;
  totalCash: number | null;
  cashIn: number | null;
  cashOut: number | null;
  cashAccounts: { id: string; name: string; subtype: string; balance: number }[] | null;
  outstanding: number | null;
  overdueCount: number | null;
  unpaidCount: number | null;
  dueToday: number | null;
  expectedToday: number | null;
  lowStock: number | null;
  outOfStock: number | null;
  topProducts: { name: string; total: number }[] | null;
  supplierOutstanding: number | null;
  supplierUnpaidCount: number | null;
  supplierOverdueAmount: number | null;
  supplierOverdueCount: number | null;
  inventoryValue: number | null;
  inventoryByStage: { raw: number; wip: number; finished: number } | null;
  production: {
    completedOrders: number;
    inProgressOrders: number;
    draftOrders: number;
    totalCost: number;
    wipValue: number;
    products: { name: string; unit: string; produced: number; planned?: number; unitCost: number; yieldPercent: number | null }[];
  } | null;
}
interface MonthRow { month: string; revenue: number; cogs: number; opex: number; grossProfit: number; netProfit: number }
interface RecentInvoice {
  id: string; invoiceNumber: string; total: number; status: string; createdAt: string; dueDate: string | null;
  customer?: { firstName: string; lastName: string } | null; customerName?: string | null;
}
interface TopCustomer { id: string; name: string; sales: number; outstanding: number; invoices: number }

// ---------------------------------------------------------------- motion
const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } };
const rise: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 26 } },
};

const RANGES = [
  { value: 1, label: "This month" },
  { value: 3, label: "3M" },
  { value: 6, label: "6M" },
  { value: 12, label: "12M" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function monthLabel(m: string) {
  if (/^\d{4}-\d{2}$/.test(m)) {
    const [y, mo] = m.split("-").map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: "short" });
  }
  return m;
}

/** Money that fits a small tile: full below a million, else ₦1.41M. */
function shortMoney(format: (n: number) => string, n: number) {
  if (Math.abs(n) < 1e6) return format(n).replace(/\.00$/, "");
  const symbol = format(0).replace(/[\d.,\s]/g, "");
  return `${n < 0 ? "-" : ""}${symbol}${(Math.abs(n) / 1e6).toFixed(2)}M`;
}

/** Short money for chart axes: ₦1.2M, ₦850k. */
function compact(symbol: string, v: number) {
  const a = Math.abs(v);
  if (a >= 1e9) return `${symbol}${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${symbol}${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${symbol}${(v / 1e3).toFixed(0)}k`;
  return `${symbol}${v.toFixed(0)}`;
}

// ---------------------------------------------------------------- page
export default function DashboardPage() {
  const { user } = useAuth();
  const { format, currency } = useCurrency();
  const { activeLocation, locations, activeLocationId } = useLocation();
  const version = useLocationVersion();
  const perms = user?.permissions;
  const canMoney = can(perms, "money");
  const canSales = can(perms, "sales");
  const canInventory = can(perms, "inventory");

  const [range, setRange] = useState(12);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chart, setChart] = useState<MonthRow[]>([]);
  const [recent, setRecent] = useState<RecentInvoice[] | null>(null);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[] | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ success: boolean; data: Summary }>(`/dashboard/summary?months=${range}`),
      canMoney
        ? apiFetch<{ success: boolean; data: MonthRow[] }>(`/dashboard/monthly-chart?months=${Math.max(range, 6)}`)
        : Promise.resolve({ success: true, data: [] as MonthRow[] }),
    ])
      .then(([s, c]) => { if (active) { setSummary(s.data); setChart(c.data); } })
      .catch((e: unknown) => reportError(e, "Could not load the dashboard"));
    return () => { active = false; };
  }, [range, version, canMoney]);

  useEffect(() => {
    if (!canSales) return;
    let active = true;
    Promise.all([
      apiFetch<{ success: boolean; data: RecentInvoice[] }>("/dashboard/recent-invoices"),
      apiFetch<{ success: boolean; data: TopCustomer[] }>(`/dashboard/top-customers?months=${range}`),
    ])
      .then(([r, t]) => { if (active) { setRecent(r.data); setTopCustomers(t.data); } })
      .catch(() => { if (active) { setRecent([]); setTopCustomers([]); } });
    return () => { active = false; };
  }, [version, canSales, range]);

  const symbol = useMemo(() => format(0).replace(/[\d.,\s]/g, "") || "", [format]);
  const branch = activeLocationId === "all" ? (locations.length > 1 ? "all branches" : null) : activeLocation?.name ?? null;
  const attentionCount =
    (summary?.overdueCount ?? 0) + (summary?.supplierOverdueCount ?? 0) + (summary?.outOfStock ?? 0) + (summary?.lowStock ?? 0) + (summary?.dueToday ?? 0);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
      {/* ---------- Greeting ---------- */}
      <motion.div variants={rise} className="flex flex-col gap-4 pt-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-ink-soft">
            {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            {branch && <> · <span className="text-ink">{branch}</span></>}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {greeting()}, <span>{user?.firstName || "there"}</span>
          </h1>
          {summary && (
            <p className="mt-1.5 text-sm text-ink-soft">
              {attentionCount > 0
                ? <>You have <span className="font-semibold text-ink">{attentionCount}</span> thing{attentionCount === 1 ? "" : "s"} that need attention today.</>
                : "Everything is on track today."}
            </p>
          )}
        </div>
        <RangePicker value={range} onChange={setRange} />
      </motion.div>

      {!summary ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* ---------- Money + charts ---------- */}
          {canMoney && (
            <div className="grid gap-5 xl:grid-cols-12">
              <div className="space-y-5 xl:col-span-4">
                <motion.div variants={rise}><BalanceCard summary={summary} format={format} currency={currency} /></motion.div>
                <div className="grid grid-cols-2 gap-4">
                  <motion.div variants={rise}>
                    <KpiCard
                      label="Revenue" value={summary.revenue ?? 0} format={format} icon={<TrendingUp size={17} />}
                      change={summary.revenueChange} changeLabel="vs last month" series={chart.map((m) => m.revenue)} href="/dashboard/reports"
                    />
                  </motion.div>
                  <motion.div variants={rise}>
                    <KpiCard
                      label="Gross profit" value={summary.grossProfit ?? 0} format={format} icon={<Boxes size={17} />}
                      note={`${(summary.grossMargin ?? 0).toFixed(1)}% margin`} series={chart.map((m) => m.grossProfit)} href="/dashboard/accounting/profit-loss"
                    />
                  </motion.div>
                  <motion.div variants={rise}>
                    <KpiCard
                      label="Net profit" value={summary.netProfit ?? 0} format={format} icon={<Wallet size={17} />}
                      note={`${(summary.netMargin ?? 0).toFixed(1)}% margin`} series={chart.map((m) => m.netProfit)} href="/dashboard/accounting/profit-loss"
                      negative={(summary.netProfit ?? 0) < 0}
                    />
                  </motion.div>
                  <motion.div variants={rise}>
                    <KpiCard
                      label="Outstanding" value={summary.outstanding ?? 0} format={format} icon={<Receipt size={17} />}
                      note={`${summary.unpaidCount ?? 0} unpaid invoice${summary.unpaidCount === 1 ? "" : "s"}`} href="/dashboard/accounting/receivable"
                      progress={summary.outstanding ? Math.min(1, (summary.expectedToday ?? 0) / summary.outstanding) : 0}
                    />
                  </motion.div>
                </div>
              </div>

              <div className="space-y-5 xl:col-span-8">
                <div className="grid gap-5 lg:grid-cols-5">
                  <motion.div variants={rise} className="lg:col-span-3">
                    <PerformanceChart data={chart} format={format} symbol={symbol} />
                  </motion.div>
                  <motion.div variants={rise} className="lg:col-span-2">
                    <TopProducts products={summary.topProducts ?? []} format={format} />
                  </motion.div>
                </div>
                <motion.div variants={rise}><NeedsAttention summary={summary} format={format} /></motion.div>
              </div>
            </div>
          )}

          {!canMoney && <motion.div variants={rise}><NeedsAttention summary={summary} format={format} /></motion.div>}

          {/* ---------- Operations ---------- */}
          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {canInventory && summary.inventoryByStage && (
              <motion.div variants={rise}><InventoryByStage stages={summary.inventoryByStage} format={format} /></motion.div>
            )}
            {canInventory && summary.production && (
              <motion.div variants={rise}><ProductionThisMonth production={summary.production} format={format} /></motion.div>
            )}
            {canSales && (
              <motion.div variants={rise} className={cn(!canInventory && "lg:col-span-2 xl:col-span-3")}>
                <TopCustomers rows={topCustomers} format={format} />
              </motion.div>
            )}
          </div>

          {canSales && <motion.div variants={rise}><RecentInvoices rows={recent} format={format} /></motion.div>}
        </>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------- pieces
function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[24px] border border-border-soft bg-surface p-5 shadow-card", className)}>{children}</div>;
}

function PanelHead({ title, href, linkLabel = "View all", extra }: { title: string; href?: string; linkLabel?: string; extra?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <div className="flex items-center gap-2">
        {extra}
        {href && (
          <Link href={href} className="group inline-flex items-center gap-0.5 text-xs font-semibold text-ink-soft hover:text-ink">
            {linkLabel}<ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

function RangePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex rounded-full border border-border-soft bg-surface/80 p-1 shadow-card" role="tablist" aria-label="Period">
      {RANGES.map((r) => (
        <button
          key={r.value}
          role="tab"
          aria-selected={value === r.value}
          onClick={() => onChange(r.value)}
          className={cn("relative rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors", value === r.value ? "text-ivory" : "text-ink-soft hover:text-ink")}
        >
          {value === r.value && (
            <motion.span layoutId="range-pill" className="absolute inset-0 rounded-full bg-charcoal shadow" transition={{ type: "spring", stiffness: 420, damping: 32 }} />
          )}
          <span className="relative">{r.label}</span>
        </button>
      ))}
    </div>
  );
}

function BalanceCard({ summary, format, currency }: { summary: Summary; format: (n: number) => string; currency: string }) {
  const accounts = summary.cashAccounts ?? [];
  const shown = accounts.slice(0, 3);
  return (
    <div className="brand-card relative overflow-hidden rounded-[28px] p-6 text-white shadow-[0_24px_50px_-20px_rgb(240_90_40/0.65)]">
      {/* decorative rings */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border-[28px] border-white/10"
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />

      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-white/85">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 backdrop-blur"><Landmark size={16} /></span>
          Total cash &amp; bank
        </div>
        <span className="rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-xs font-bold tracking-wide backdrop-blur">{currency}</span>
      </div>

      <p className="relative mt-4 text-[34px] font-bold leading-none tracking-tight sm:text-[40px]">
        <CountUp value={summary.totalCash ?? 0} format={format} duration={1.6} />
      </p>
      <div className="relative mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/85">
        <span className="inline-flex items-center gap-1"><ArrowDownRight size={15} className="rotate-180" /> In <CountUp value={summary.cashIn ?? 0} format={format} /></span>
        <span className="inline-flex items-center gap-1"><ArrowDownRight size={15} /> Out <CountUp value={summary.cashOut ?? 0} format={format} /></span>
      </div>

      {shown.length > 0 && (
        <div className="relative mt-5 grid grid-cols-3 gap-2.5">
          {shown.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.08 }}
            >
              <Link
                href={`/dashboard/accounting/accounts/${a.id}`}
                className="block rounded-2xl border border-white/20 bg-white/15 p-3 backdrop-blur transition-colors hover:bg-white/25"
              >
                <p className="truncate text-xs font-semibold text-white/80">{a.name}</p>
                <p className="mt-1 truncate text-sm font-bold" title={format(a.balance)}><CountUp value={a.balance} format={(n) => shortMoney(format, n)} delay={0.2} /></p>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
      <Link href="/dashboard/accounting/accounts" className="relative mt-4 inline-flex items-center gap-1 text-xs font-semibold text-white/85 hover:text-white">
        {accounts.length > 3 ? `All ${accounts.length} accounts` : "Cash & Banks"} <ChevronRight size={14} />
      </Link>
    </div>
  );
}


function KpiCard({
  label, value, format, icon, change, changeLabel, note, series, href, negative, progress,
}: {
  label: string; value: number; format: (n: number) => string; icon: ReactNode;
  change?: number | null; changeLabel?: string; note?: string; series?: number[]; color?: string; href: string; negative?: boolean; progress?: number;
}) {
  const up = (change ?? 0) >= 0;
  const c = useChartColors();
  const data = (series ?? []).map((v, i) => ({ i, v }));
  return (
    <Link href={href} className="lift group @container relative flex h-full flex-col overflow-hidden rounded-[22px] border border-border-soft bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-soft bg-surface-muted text-ink">{icon}</span>
        <ArrowUpRight size={16} className="text-ink-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={cn("mt-1 truncate text-base font-bold tracking-tight @[190px]:text-xl", negative ? "text-danger" : "text-ink")} title={format(value)}>
        <CountUp value={value} format={format} />
      </p>
      {change !== undefined && change !== null ? (
        <p className={cn("mt-1 inline-flex items-center gap-1 text-xs font-semibold", up ? "text-success" : "text-danger")}>
          {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(change).toFixed(1)}%
          <span className="font-normal text-ink-faint">{changeLabel}</span>
        </p>
      ) : note ? (
        <p className="mt-1 truncate text-xs text-ink-soft">{note}</p>
      ) : null}
      {data.length > 1 ? (
        <div className="-mx-4 -mb-4 mt-3 h-12">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${label.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.strong} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={c.strong} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={c.strong} strokeWidth={2} fill={`url(#spark-${label.replace(/\s/g, "")})`} animationDuration={1400} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : progress !== undefined ? (
        <div className="mt-auto pt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <motion.div className="h-full rounded-full bg-charcoal" initial={{ width: 0 }} animate={{ width: `${Math.max(4, progress * 100)}%` }} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.3 }} />
          </div>
          <p className="mt-1 text-[11px] text-ink-faint">Due today vs outstanding</p>
        </div>
      ) : null}
    </Link>
  );
}

function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; format: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-strong rounded-2xl px-3.5 py-2.5 text-xs">
      <p className="mb-1.5 font-semibold text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-soft"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}</span>
          <span className="font-semibold tabular-nums text-ink">{format(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function PerformanceChart({ data, format, symbol }: { data: MonthRow[]; format: (n: number) => string; symbol: string }) {
  const c = useChartColors();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const rows = data.map((m) => ({ month: monthLabel(m.month), Sales: m.revenue, Expenses: m.cogs + m.opex, Profit: m.netProfit }));
  const series = [
    { key: "Sales", color: c.strong },
    { key: "Expenses", color: c.muted },
    { key: "Profit", color: c.mid },
  ];
  const toggle = (k: string) => setHidden((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <Panel className="h-full">
      <PanelHead
        title="Sales, profit & expenses"
        href="/dashboard/accounting/profit-loss"
        linkLabel="P&L"
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {series.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => toggle(s.key)}
            aria-pressed={!hidden.has(s.key)}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all", hidden.has(s.key) ? "border-border-soft text-ink-faint" : "border-border-strong text-ink")}
          >
            <span className="h-2 w-2 rounded-full transition-opacity" style={{ background: s.color, opacity: hidden.has(s.key) ? 0.3 : 1 }} />
            {s.key}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="py-20 text-center text-sm text-ink-soft">No sales recorded yet.</p>
      ) : (
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barGap={4}>
              <defs>
                <linearGradient id="bar-sales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.strong} stopOpacity={1} />
                  <stop offset="100%" stopColor={c.strong} stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={c.grid} strokeDasharray="4 6" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: c.axis, fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: c.axis, fontSize: 11 }} tickFormatter={(v: number) => compact(symbol, v)} width={56} />
              <Tooltip cursor={{ fill: c.grid, opacity: 0.5, radius: 8 } as object} content={<ChartTooltip format={format} />} />
              {!hidden.has("Sales") && <Bar dataKey="Sales" fill="url(#bar-sales)" radius={[8, 8, 3, 3]} maxBarSize={26} animationDuration={1100} />}
              {!hidden.has("Expenses") && <Bar dataKey="Expenses" fill={c.muted} radius={[8, 8, 3, 3]} maxBarSize={26} animationDuration={1100} animationBegin={150} />}
              {!hidden.has("Profit") && (
                <Line type="monotone" dataKey="Profit" stroke={c.mid} strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3, strokeWidth: 0, fill: c.mid }} activeDot={{ r: 5 }} animationDuration={1500} animationBegin={300} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

function TopProducts({ products, format }: { products: { name: string; total: number }[]; format: (n: number) => string }) {
  const c = useChartColors();
  const total = products.reduce((s, p) => s + p.total, 0);
  const top = products.slice(0, 5);
  return (
    <Panel className="flex h-full flex-col">
      <PanelHead title="Top products" href="/dashboard/reports" linkLabel="Margins" />
      {top.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-soft">No sales in this period.</p>
      ) : (
        <>
          <div className="relative mx-auto h-[170px] w-[170px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={top} dataKey="total" nameKey="name" innerRadius={56} outerRadius={82} paddingAngle={3} cornerRadius={6} stroke="none" animationDuration={1300}>
                  {top.map((_, i) => <Cell key={i} fill={c.palette[i % c.palette.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip format={format} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Sales</span>
              <span className="max-w-[110px] truncate text-sm font-bold text-ink"><CountUp value={total} format={format} /></span>
            </div>
          </div>
          <ul className="mt-3 space-y-2">
            {top.map((p, i) => {
              const pct = total > 0 ? (p.total / total) * 100 : 0;
              return (
                <li key={p.name} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.palette[i % c.palette.length] }} /><span className="truncate text-ink">{p.name}</span></span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-soft">{pct.toFixed(0)}%</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}

function NeedsAttention({ summary, format }: { summary: Summary; format: (n: number) => string }) {
  const tiles: { key: string; label: string; count: number; sub: string; href: string; icon: ReactNode; tone: "danger" | "warning" | "info" }[] = [];
  if (summary.overdueCount !== null) tiles.push({ key: "overdue", label: "Overdue invoices", count: summary.overdueCount, sub: summary.overdueCount ? "Follow up with customers" : "All paid on time", href: "/dashboard/accounting/receivable", icon: <AlertCircle size={20} />, tone: "danger" });
  if (summary.supplierUnpaidCount !== null) tiles.push({ key: "supplier", label: "Supplier payments", count: summary.supplierOverdueCount ?? 0, sub: summary.supplierOutstanding ? `${format(summary.supplierOutstanding)} owed` : "Nothing owed", href: "/dashboard/accounting/payable", icon: <Truck size={20} />, tone: (summary.supplierOverdueCount ?? 0) > 0 ? "danger" : "warning" });
  if (summary.lowStock !== null) tiles.push({ key: "stock", label: "Low stock", count: (summary.lowStock ?? 0) + (summary.outOfStock ?? 0), sub: summary.outOfStock ? `${summary.outOfStock} out of stock` : "At or below reorder level", href: "/dashboard/inventory/products", icon: <PackageX size={20} />, tone: "warning" });
  if (summary.dueToday !== null) tiles.push({ key: "today", label: "Due today", count: summary.dueToday, sub: summary.expectedToday ? `${format(summary.expectedToday)} expected` : "Nothing due", href: "/dashboard/invoices", icon: <CalendarClock size={20} />, tone: "info" });

  if (tiles.length === 0) return null;
  return (
    <Panel>
      <PanelHead title="Needs attention" href="/dashboard/notifications" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t, i) => (
          <motion.div key={t.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.07 }}>
            <Link href={t.href} className="lift group flex h-full flex-col rounded-[20px] border border-border-soft bg-surface-muted p-4">
              <span className="relative inline-flex w-fit">
                <span className={cn("flex h-11 w-11 items-center justify-center rounded-2xl", t.count > 0 ? "bg-charcoal text-ivory shadow-raised" : "border border-border-soft bg-surface text-ink-faint")}>{t.icon}</span>
                {t.count > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/60" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500 ring-2 ring-surface" />
                  </span>
                )}
              </span>
              <p className="mt-3 text-2xl font-bold tracking-tight text-ink"><CountUp value={t.count} duration={1} /></p>
              <p className="text-sm font-semibold text-ink">{t.label}</p>
              <p className="mt-0.5 truncate text-xs text-ink-soft">{t.sub}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </Panel>
  );
}

function InventoryByStage({ stages, format }: { stages: { raw: number; wip: number; finished: number }; format: (n: number) => string }) {
  const total = stages.raw + stages.wip + stages.finished;
  const parts = [
    { key: "raw", label: "Raw materials & packaging", value: stages.raw, cls: "bg-ink-faint", dot: "bg-ink-faint" },
    { key: "wip", label: "Work in progress", value: stages.wip, cls: "bg-ink-soft", dot: "bg-ink-soft" },
    { key: "finished", label: "Finished goods", value: stages.finished, cls: "bg-charcoal", dot: "bg-charcoal" },
  ];
  return (
    <Panel className="h-full">
      <PanelHead title="Inventory by stage" href="/dashboard/inventory/products" />
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Stock value at cost</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-ink"><CountUp value={total} format={format} /></p>
      <div className="mt-4 flex h-3 gap-1 overflow-hidden rounded-full bg-surface-muted">
        {total > 0 && parts.map((p, i) => (
          <motion.div
            key={p.key}
            className={cn("h-full rounded-full", p.cls)}
            initial={{ width: 0 }}
            animate={{ width: `${(p.value / total) * 100}%` }}
            transition={{ duration: 1.1, delay: 0.3 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2.5 text-sm">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-ink-soft"><span className={cn("h-2.5 w-2.5 rounded-full", p.dot)} />{p.label}</span>
            <span className="font-semibold tabular-nums text-ink"><CountUp value={p.value} format={format} /></span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ProductionThisMonth({ production, format }: { production: NonNullable<Summary["production"]>; format: (n: number) => string }) {
  const all = production.completedOrders + production.inProgressOrders + production.draftOrders;
  const done = all > 0 ? production.completedOrders / all : 0;
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <Panel className="h-full">
      <PanelHead title="Production this period" href="/dashboard/production" />
      <div className="flex items-center gap-5">
        <div className="relative h-[88px] w-[88px] shrink-0">
          <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
            <circle cx="40" cy="40" r={R} fill="none" strokeWidth="9" className="stroke-surface-muted" />
            <motion.circle
              cx="40" cy="40" r={R} fill="none" strokeWidth="9" strokeLinecap="round" className="stroke-charcoal"
              strokeDasharray={C}
              initial={{ strokeDashoffset: C }}
              animate={{ strokeDashoffset: C * (1 - done) }}
              transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-ink"><CountUp value={production.completedOrders} /></span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">done</span>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 text-sm">
          <div><p className="text-ink-soft">Running</p><p className="text-lg font-bold text-ink"><CountUp value={production.inProgressOrders} /></p></div>
          <div><p className="text-ink-soft">Planned</p><p className="text-lg font-bold text-ink"><CountUp value={production.draftOrders} /></p></div>
          <div className="col-span-2"><p className="text-ink-soft">Production cost</p><p className="font-bold text-ink"><CountUp value={production.totalCost} format={format} /></p></div>
        </div>
      </div>
      {production.products.length > 0 ? (
        <ul className="mt-4 space-y-2.5">
          {production.products.slice(0, 3).map((p) => (
            <li key={p.name} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-ink">{p.name}</span>
                <span className="shrink-0 text-xs text-ink-soft">{formatQty(p.produced, p.unit)} · {format(p.unitCost)}/{p.unit}</span>
              </div>
              {p.yieldPercent !== null && (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <motion.div className="h-full rounded-full bg-charcoal" initial={{ width: 0 }} animate={{ width: `${Math.min(100, p.yieldPercent)}%` }} transition={{ duration: 1.1, delay: 0.4 }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-soft"><Factory size={15} /> No runs completed in this period yet.</p>
      )}
    </Panel>
  );
}

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}
const AVATAR = ["bg-charcoal text-ivory", "border border-border-soft bg-surface-muted text-ink"];

function TopCustomers({ rows, format }: { rows: TopCustomer[] | null; format: (n: number) => string }) {
  const max = Math.max(1, ...(rows ?? []).map((r) => r.sales));
  return (
    <Panel className="h-full">
      <PanelHead title="Top customers" href="/dashboard/customers" />
      {rows === null ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-soft">No customer sales in this period.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.id}>
              <Link href={`/dashboard/customers/${r.id}`} className="group flex items-center gap-3">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", i === 0 ? AVATAR[0] : AVATAR[1])}>{initialsOf(r.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-semibold text-ink group-hover:text-ink">{r.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-ink"><CountUp value={r.sales} format={format} /></span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <motion.span className={cn("block h-full rounded-full", i === 0 ? "bg-charcoal" : "bg-ink-faint")} initial={{ width: 0 }} animate={{ width: `${(r.sales / max) * 100}%` }} transition={{ duration: 1, delay: 0.2 + i * 0.08, ease: [0.16, 1, 0.3, 1] }} />
                  </span>
                  {r.outstanding > 0 && <span className="mt-0.5 block text-[11px] text-warning">{format(r.outstanding)} still owed</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RecentInvoices({ rows, format }: { rows: RecentInvoice[] | null; format: (n: number) => string }) {
  return (
    <Panel>
      <PanelHead title="Recent invoices" href="/dashboard/invoices" />
      {rows === null ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center text-sm text-ink-soft">
          <FileText size={22} className="mb-2" /> No invoices yet.
          <Link href="/dashboard/invoices/new" className="mt-2 font-semibold text-ink underline-offset-2 hover:underline">Make your first sale</Link>
        </div>
      ) : (
        <ul className="divide-y divide-border-soft">
          {rows.map((inv, i) => {
            const name = inv.customer ? `${inv.customer.firstName} ${inv.customer.lastName}` : inv.customerName || "Walk-in customer";
            return (
              <motion.li key={inv.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.05 }}>
                <Link href={`/dashboard/invoices/${inv.id}`} className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-surface-muted">
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold", AVATAR[1])}>{initialsOf(name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{name}</span>
                    <span className="block text-xs text-ink-soft">{inv.invoiceNumber} · {new Date(inv.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                  </span>
                  <span className="hidden sm:block"><StatusBadge status={inv.status} /></span>
                  <span className="w-28 shrink-0 text-right text-sm font-bold tabular-nums text-ink">{format(inv.total)}</span>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-5 xl:grid-cols-12">
      <div className="space-y-5 xl:col-span-4">
        <Skeleton className="h-64 rounded-[28px]" />
        <div className="grid grid-cols-2 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-[22px]" />)}</div>
      </div>
      <div className="space-y-5 xl:col-span-8">
        <Skeleton className="h-[380px] rounded-[24px]" />
        <Skeleton className="h-48 rounded-[24px]" />
      </div>
    </div>
  );
}
