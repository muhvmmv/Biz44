"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import ReportNotes from "@/components/reports/ReportNotes";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocationVersion } from "@/hooks/useLocationRefetch";

const COLORS = ["#AB6B73", "#243447", "#527A9E", "#4F8068", "#C49A52", "#B96F5D", "#824C54", "#6B6563"];

export default function ReportsPage() {
  const { format } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [salesByMonth, setSalesByMonth] = useState<{ month: string; total: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; quantity: number; total: number }[]>([]);
  const [topCustomers, setTopCustomers] = useState<{ name: string; total: number; invoices: number; outstanding: number }[]>([]);
  const [expenses, setExpenses] = useState<{ name: string; total: number }[]>([]);
  const [inventory, setInventory] = useState<{ name: string; sku: string | null; quantity: number; valueAtCost: number; valueAtPrice: number }[]>([]);
  const version = useLocationVersion();

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ success: boolean; data: typeof salesByMonth }>("/reports/sales-by-month"),
      apiFetch<{ success: boolean; data: typeof topProducts }>("/reports/sales-by-product"),
      apiFetch<{ success: boolean; data: typeof topCustomers }>("/reports/top-customers"),
      apiFetch<{ success: boolean; data: typeof expenses }>("/reports/expenses-by-category"),
      apiFetch<{ success: boolean; data: typeof inventory }>("/reports/inventory-valuation"),
    ]).then(([s, p, c, e, i]) => {
      if (!active) return;
      setSalesByMonth(s.data.slice(-6));
      setTopProducts(p.data.slice(0, 5));
      setTopCustomers(c.data.slice(0, 5));
      setExpenses(e.data);
      setInventory(i.data);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);

  if (loading) return <div className="p-6 space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-64" />)}</div>;

  const totalInventoryValue = inventory.reduce((s, i) => s + i.valueAtCost, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Insights across sales, inventory, and finances." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Sales by Month</CardTitle></CardHeader>
          <CardContent>
            {salesByMonth.length === 0 ? (
              <p className="text-center text-ink-soft py-12">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={salesByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5DFDC" />
                  <XAxis dataKey="month" stroke="#6B6563" fontSize={12} />
                  <YAxis stroke="#6B6563" fontSize={12} />
                  <Tooltip formatter={(value) => format(Number(value))}
                    contentStyle={{ borderRadius: 8, border: "1px solid #E5DFDC", background: "#fff" }} />
                  <Bar dataKey="total" fill="#AB6B73" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Expenses by Category</CardTitle></CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <p className="text-center text-ink-soft py-12">No data yet</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Top Products</CardTitle></CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <p className="text-center text-ink-soft py-8">No data yet</p>
            ) : (
              <div className="space-y-3">
                {topProducts.map((p, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-border-soft last:border-0">
                    <div>
                      <p className="font-medium text-ink">{p.name}</p>
                      <p className="text-xs text-ink-soft">{p.quantity} units sold</p>
                    </div>
                    <span className="font-semibold text-ink">{format(p.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top Customers</CardTitle></CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <p className="text-center text-ink-soft py-8">No data yet</p>
            ) : (
              <div className="space-y-3">
                {topCustomers.map((c, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-border-soft last:border-0">
                    <div>
                      <p className="font-medium text-ink">{c.name}</p>
                      <p className="text-xs text-ink-soft">{c.invoices} invoices</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-ink">{format(c.total)}</p>
                      {c.outstanding > 0 && (
                        <p className="text-xs text-warning">{format(c.outstanding)} owed</p>
                      )}
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
          <CardTitle>Inventory Valuation</CardTitle>
          <p className="text-sm text-ink-soft">
            Total cost value: <span className="font-semibold text-ink">{format(totalInventoryValue)}</span>
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {inventory.length === 0 ? (
            <p className="text-center text-ink-soft py-12">No products yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ivory text-ink-soft text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Product</th>
                    <th className="px-6 py-3 font-medium">SKU</th>
                    <th className="px-6 py-3 font-medium text-right">Qty</th>
                    <th className="px-6 py-3 font-medium text-right">Value at Cost</th>
                    <th className="px-6 py-3 font-medium text-right">Value at Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {inventory.map((p, i) => (
                    <tr key={i} className="hover:bg-ivory">
                      <td className="px-6 py-3 font-medium text-ink">{p.name}</td>
                      <td className="px-6 py-3 text-ink-soft">{p.sku || "—"}</td>
                      <td className="px-6 py-3 text-right text-ink">{p.quantity}</td>
                      <td className="px-6 py-3 text-right text-ink">{format(p.valueAtCost)}</td>
                      <td className="px-6 py-3 text-right text-ink">{format(p.valueAtPrice)}</td>
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