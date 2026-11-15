"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import Tabs from "@/components/ui/Tabs";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import ReportNotes from "@/components/reports/ReportNotes";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocationVersion } from "@/hooks/useLocationRefetch";
import { formatQty, itemTypeLabel } from "@/lib/units";

const COLORS = ["#F05A28", "#1C1C1F", "#3B82F6", "#16A34A", "#A1A1AA", "#0D9488", "#B93D0C", "#66666E"];

type Report = "overview" | "margins" | "production" | "stock";
type Period = "month" | "last_month" | "quarter" | "year" | "all";

function periodQuery(p: Period) {
  const now = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  let from: Date | undefined, to: Date | undefined;
  if (p === "month") from = new Date(now.getFullYear(), now.getMonth(), 1);
  if (p === "last_month") { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 0); }
  if (p === "quarter") from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  if (p === "year") from = new Date(now.getFullYear(), 0, 1);
  const q = new URLSearchParams();
  if (from) q.set("from", iso(from));
  if (to) q.set("to", iso(to));
  return q.toString();
}

/** Load a report endpoint for the current period and location. */
function useReport<T>(path: string, query: string, enabled = true) {
  const version = useLocationVersion();
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({ key: "", data: null, error: null });
  const key = `${path}?${query}#${version}`;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    apiFetch<{ success: boolean; data: T }>(`${path}${query ? `?${query}` : ""}`)
      .then((r) => { if (active) setState({ key, data: r.data, error: null }); })
      .catch((e: unknown) => { if (active) setState({ key, data: null, error: e instanceof Error ? e.message : "Could not load the report" }); });
    return () => { active = false; };
  }, [path, query, key, enabled]);
  const current = state.key === key;
  return { data: current ? state.data : null, error: current ? state.error : null };
}

const th = "px-5 py-3 font-medium";
const td = "whitespace-nowrap px-5 py-3 tabular-nums";

export default function ReportsPage() {
  const [report, setReport] = useState<Report>("overview");
  const [period, setPeriod] = useState<Period>("month");
  const query = useMemo(() => periodQuery(period), [period]);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Sales, profit by product, production and stock, from the real transactions." />
      <Tabs
        value={report}
        onChange={setReport}
        options={[
          { value: "overview", label: "Overview" },
          { value: "margins", label: "Product margins" },
          { value: "production", label: "Production" },
          { value: "stock", label: "Stock movement" },
        ]}
      />
      {report !== "overview" && (
        <Tabs
          value={period}
          onChange={setPeriod}
          options={[
            { value: "month", label: "This month" },
            { value: "last_month", label: "Last month" },
            { value: "quarter", label: "This quarter" },
            { value: "year", label: "This year" },
            { value: "all", label: "All time" },
          ]}
        />
      )}
      {report === "overview" && <Overview />}
      {report === "margins" && <Margins query={query} />}
      {report === "production" && <Production query={query} />}
      {report === "stock" && <StockMovement query={query} />}
    </div>
  );
}

// ---------------------------------------------------------------- margins

interface MarginRow {
  productId: string | null; name: string; unit: string | null; quantity: number;
  revenue: number; cost: number; profit: number; marginPercent: number | null; unitPrice: number; unitCost: number;
}
interface MarginReport { products: MarginRow[]; totals: { revenue: number; cost: number; profit: number; marginPercent: number | null } }

function Margins({ query }: { query: string }) {
  const { format } = useCurrency();
  const { data, error } = useReport<MarginReport>("/reports/product-margins", query);
  if (error) return <Card><EmptyState tone="error" title="Couldn't load margins" description={error} /></Card>;
  if (!data) return <Skeleton className="h-80" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Sales (before VAT)" value={format(data.totals.revenue)} />
        <StatCard label="Cost of goods sold" value={format(data.totals.cost)} hint="Actual batch cost" />
        <StatCard label="Gross profit" value={format(data.totals.profit)} tone={data.totals.profit >= 0 ? "positive" : "negative"} />
        <StatCard label="Gross margin" value={data.totals.marginPercent === null ? "—" : `${data.totals.marginPercent}%`} />
      </div>
      <Card>
        <CardContent className="p-0">
          {data.products.length === 0 ? (
            <EmptyState title="No sales in this period" description="Finalized invoices appear here with their actual cost." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border-soft bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-soft">
                  <tr>
                    <th className={th}>Product</th>
                    <th className={`${th} text-right`}>Sold</th>
                    <th className={`${th} text-right`}>Sales</th>
                    <th className={`${th} text-right`}>Cost</th>
                    <th className={`${th} text-right`}>Profit</th>
                    <th className={`${th} text-right`}>Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {data.products.map((r) => (
                    <tr key={r.productId ?? r.name}>
                      <td className="px-5 py-3">
                        <span className="font-medium">{r.name}</span>
                        <span className="block text-xs text-ink-soft">{format(r.unitPrice)} avg price · {format(r.unitCost)} avg cost</span>
                      </td>
                      <td className={`${td} text-right`}>{formatQty(r.quantity, r.unit ?? undefined)}</td>
                      <td className={`${td} text-right`}>{format(r.revenue)}</td>
                      <td className={`${td} text-right text-ink-soft`}>{format(r.cost)}</td>
                      <td className={`${td} text-right font-medium ${r.profit < 0 ? "text-danger" : ""}`}>{format(r.profit)}</td>
                      <td className={`${td} text-right`}>{r.marginPercent === null ? "—" : `${r.marginPercent}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-ink-soft">Sales are after invoice discounts and before VAT. Items not linked to a product have no stock cost.</p>
    </div>
  );
}

// ---------------------------------------------------------------- production

interface ProductionReport {
  completedOrders: number; inProgressOrders: number; draftOrders: number; wipValue: number; totalCost: number;
  products: { name: string; unit: string; orders: number; planned: number; produced: number; shortfall: number; cost: number; unitCost: number; yieldPercent: number | null }[];
  materials: { name: string; unit: string; quantity: number; cost: number; overUsage: number }[];
}

function Production({ query }: { query: string }) {
  const { format } = useCurrency();
  const { data, error } = useReport<ProductionReport>("/reports/production", query);
  if (error) return <Card><EmptyState tone="error" title="Couldn't load production" description={error} /></Card>;
  if (!data) return <Skeleton className="h-80" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Runs completed" value={data.completedOrders} />
        <StatCard label="Production cost" value={format(data.totalCost)} />
        <StatCard label="Running now" value={data.inProgressOrders} hint={`${data.draftOrders} planned`} />
        <StatCard label="Work in progress" value={format(data.wipValue)} />
      </div>
      <Card>
        <CardHeader><CardTitle>Output</CardTitle></CardHeader>
        <CardContent className="p-0">
          {data.products.length === 0 ? (
            <EmptyState title="No production completed in this period" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-border-soft bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-soft">
                  <tr>
                    <th className={th}>Product</th>
                    <th className={`${th} text-right`}>Runs</th>
                    <th className={`${th} text-right`}>Planned</th>
                    <th className={`${th} text-right`}>Produced</th>
                    <th className={`${th} text-right`}>Yield</th>
                    <th className={`${th} text-right`}>Cost</th>
                    <th className={`${th} text-right`}>Per unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {data.products.map((p) => (
                    <tr key={p.name}>
                      <td className="px-5 py-3 font-medium">{p.name}</td>
                      <td className={`${td} text-right`}>{p.orders}</td>
                      <td className={`${td} text-right`}>{formatQty(p.planned, p.unit)}</td>
                      <td className={`${td} text-right`}>{formatQty(p.produced, p.unit)}{p.shortfall > 0 && <span className="block text-xs text-warning">{formatQty(p.shortfall, p.unit)} short</span>}</td>
                      <td className={`${td} text-right`}>{p.yieldPercent === null ? "—" : `${p.yieldPercent}%`}</td>
                      <td className={`${td} text-right`}>{format(p.cost)}</td>
                      <td className={`${td} text-right font-medium`}>{format(p.unitCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {data.materials.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Materials used</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-border-soft bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-soft">
                  <tr>
                    <th className={th}>Material</th>
                    <th className={`${th} text-right`}>Used</th>
                    <th className={`${th} text-right`}>Over standard</th>
                    <th className={`${th} text-right`}>Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {data.materials.map((m) => (
                    <tr key={m.name}>
                      <td className="px-5 py-3 font-medium">{m.name}</td>
                      <td className={`${td} text-right`}>{formatQty(m.quantity, m.unit)}</td>
                      <td className={`${td} text-right ${m.overUsage > 0 ? "text-warning" : "text-ink-soft"}`}>{m.overUsage > 0 ? formatQty(m.overUsage, m.unit) : "—"}</td>
                      <td className={`${td} text-right`}>{format(m.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- stock movement

interface StockRow {
  productId: string; name: string; unit: string; itemType: string;
  opening: number; received: number; produced: number; usedInProduction: number; sold: number; returnedToSupplier: number; adjusted: number; closing: number;
}

function StockMovement({ query }: { query: string }) {
  const { data, error } = useReport<StockRow[]>("/reports/stock-movement", query);
  const [type, setType] = useState("all");
  if (error) return <Card><EmptyState tone="error" title="Couldn't load stock movement" description={error} /></Card>;
  if (!data) return <Skeleton className="h-80" />;
  const rows = data.filter((r) => type === "all" || r.itemType === type);
  const cell = (n: number, unit: string) => (n === 0 ? <span className="text-ink-faint">—</span> : <span className={n < 0 ? "text-ink" : "text-success"}>{n > 0 ? "+" : ""}{formatQty(n, unit)}</span>);
  return (
    <div className="space-y-4">
      <Tabs
        value={type}
        onChange={setType}
        options={[
          { value: "all", label: "All items" },
          { value: "raw_material", label: "Raw materials" },
          { value: "packaging", label: "Packaging" },
          { value: "finished_good", label: "Finished goods" },
        ]}
      />
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState title="No stock in this period" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border-soft bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-soft">
                  <tr>
                    <th className={th}>Item</th>
                    <th className={`${th} text-right`}>Opening</th>
                    <th className={`${th} text-right`}>Received</th>
                    <th className={`${th} text-right`}>Produced</th>
                    <th className={`${th} text-right`}>Used in production</th>
                    <th className={`${th} text-right`}>Sold</th>
                    <th className={`${th} text-right`}>Returned to supplier</th>
                    <th className={`${th} text-right`}>Adjusted</th>
                    <th className={`${th} text-right`}>Closing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {rows.map((r) => (
                    <tr key={r.productId}>
                      <td className="px-5 py-3"><span className="font-medium">{r.name}</span><span className="block text-xs text-ink-soft">{itemTypeLabel(r.itemType)}</span></td>
                      <td className={`${td} text-right`}>{formatQty(r.opening, r.unit)}</td>
                      <td className={`${td} text-right`}>{cell(r.received, r.unit)}</td>
                      <td className={`${td} text-right`}>{cell(r.produced, r.unit)}</td>
                      <td className={`${td} text-right`}>{cell(r.usedInProduction, r.unit)}</td>
                      <td className={`${td} text-right`}>{cell(r.sold, r.unit)}</td>
                      <td className={`${td} text-right`}>{cell(r.returnedToSupplier, r.unit)}</td>
                      <td className={`${td} text-right`}>{cell(r.adjusted, r.unit)}</td>
                      <td className={`${td} text-right font-semibold`}>{formatQty(r.closing, r.unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-ink-soft">Sold is net of customer returns; adjusted includes counts and write-offs. Closing stock matches the stock batches.</p>
    </div>
  );
}

// ---------------------------------------------------------------- overview

function Overview() {
  const { format } = useCurrency();
  const version = useLocationVersion();
  const [loading, setLoading] = useState(true);
  const [salesByMonth, setSalesByMonth] = useState<{ month: string; total: number }[]>([]);
  const [topProducts, setTopProducts] = useState<MarginRow[]>([]);
  const [topCustomers, setTopCustomers] = useState<{ name: string; total: number; invoices: number; outstanding: number }[]>([]);
  const [expenses, setExpenses] = useState<{ name: string; total: number }[]>([]);
  const [inventory, setInventory] = useState<{ name: string; sku: string | null; unit?: string; quantity: number; valueAtCost: number; valueAtPrice: number }[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ success: boolean; data: typeof salesByMonth }>("/reports/sales-by-month"),
      apiFetch<{ success: boolean; data: MarginReport }>("/reports/product-margins"),
      apiFetch<{ success: boolean; data: typeof topCustomers }>("/reports/top-customers"),
      apiFetch<{ success: boolean; data: typeof expenses }>("/reports/expenses-by-category"),
      apiFetch<{ success: boolean; data: typeof inventory }>("/reports/inventory-valuation"),
    ]).then(([s, p, c, e, i]) => {
      if (!active) return;
      setSalesByMonth(s.data.slice(-6));
      setTopProducts([...p.data.products].sort((a, b) => b.revenue - a.revenue).slice(0, 5));
      setTopCustomers(c.data.slice(0, 5));
      setExpenses(e.data);
      setInventory(i.data);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);

  if (loading) return <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-64" />)}</div>;

  const totalInventoryValue = inventory.reduce((s, i) => s + i.valueAtCost, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Sales by month</CardTitle></CardHeader>
          <CardContent>
            {salesByMonth.length === 0 ? (
              <p className="py-12 text-center text-ink-soft">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={salesByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                  <XAxis dataKey="month" stroke="#66666E" fontSize={12} />
                  <YAxis stroke="#66666E" fontSize={12} />
                  <Tooltip formatter={(value) => format(Number(value))} contentStyle={{ borderRadius: 8, border: "1px solid #E7E5E4", background: "#fff" }} />
                  <Bar dataKey="total" name="Sales" fill="#F05A28" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Expenses by category</CardTitle></CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <p className="py-12 text-center text-ink-soft">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={expenses} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {expenses.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => format(Number(value))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Top products</CardTitle></CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <p className="py-8 text-center text-ink-soft">No data yet</p>
            ) : (
              <div className="space-y-3">
                {topProducts.map((p) => (
                  <div key={p.productId ?? p.name} className="flex items-center justify-between border-b border-border-soft py-2 last:border-0">
                    <div>
                      <p className="font-medium text-ink">{p.name}</p>
                      <p className="text-xs text-ink-soft">{formatQty(p.quantity, p.unit ?? undefined)} sold{p.marginPercent !== null ? ` · ${p.marginPercent}% margin` : ""}</p>
                    </div>
                    <span className="font-semibold tabular-nums text-ink">{format(p.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top customers</CardTitle></CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <p className="py-8 text-center text-ink-soft">No data yet</p>
            ) : (
              <div className="space-y-3">
                {topCustomers.map((c, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-border-soft py-2 last:border-0">
                    <div>
                      <p className="font-medium text-ink">{c.name}</p>
                      <p className="text-xs text-ink-soft">{c.invoices} invoices</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums text-ink">{format(c.total)}</p>
                      {c.outstanding > 0 && <p className="text-xs text-warning">{format(c.outstanding)} owed</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inventory valuation</CardTitle>
          <p className="text-sm text-ink-soft">Total at cost: <span className="font-semibold text-ink">{format(totalInventoryValue)}</span></p>
        </CardHeader>
        <CardContent className="p-0">
          {inventory.length === 0 ? (
            <p className="py-12 text-center text-ink-soft">No products yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-border-soft bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-soft">
                  <tr>
                    <th className={th}>Product</th>
                    <th className={th}>SKU</th>
                    <th className={`${th} text-right`}>Qty</th>
                    <th className={`${th} text-right`}>Value at cost</th>
                    <th className={`${th} text-right`}>Value at price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {inventory.map((p, i) => (
                    <tr key={i}>
                      <td className="px-5 py-3 font-medium text-ink">{p.name}</td>
                      <td className="px-5 py-3 text-ink-soft">{p.sku || "—"}</td>
                      <td className={`${td} text-right`}>{formatQty(p.quantity, p.unit)}</td>
                      <td className={`${td} text-right`}>{format(p.valueAtCost)}</td>
                      <td className={`${td} text-right`}>{format(p.valueAtPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ReportNotes />
    </div>
  );
}
