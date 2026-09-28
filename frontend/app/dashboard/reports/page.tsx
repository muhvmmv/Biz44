"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import ReportNotes from "@/components/reports/ReportNotes";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316", "#ec4899"];

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [salesByMonth, setSalesByMonth] = useState<{ month: string; total: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; quantity: number; total: number }[]>([]);
  const [topCustomers, setTopCustomers] = useState<{ name: string; total: number; invoices: number; outstanding: number }[]>([]);
  const [expenses, setExpenses] = useState<{ name: string; total: number }[]>([]);
  const [inventory, setInventory] = useState<{ name: string; sku: string | null; quantity: number; valueAtCost: number; valueAtPrice: number }[]>([]);

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
  }, []);

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
              <p className="text-center text-neutral-400 py-12">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={salesByMonth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="total" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Expenses by Category</CardTitle></CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <p className="text-center text-neutral-400 py-12">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={expenses} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {expenses.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
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
              <p className="text-center text-neutral-400 py-8">No data yet</p>
            ) : (
              <div className="space-y-3">
                {topProducts.map((p, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-neutral-500">{p.quantity} units sold</p>
                    </div>
                    <span className="font-semibold">${p.total.toFixed(2)}</span>
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
              <p className="text-center text-neutral-400 py-8">No data yet</p>
            ) : (
              <div className="space-y-3">
                {topCustomers.map((c, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-neutral-500">{c.invoices} invoices</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">${c.total.toFixed(2)}</p>
                      {c.outstanding > 0 && (
                        <p className="text-xs text-amber-600">${c.outstanding.toFixed(2)} owed</p>
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
          <p className="text-sm text-neutral-500">
            Total cost value: <span className="font-semibold text-neutral-900">${totalInventoryValue.toFixed(2)}</span>
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {inventory.length === 0 ? (
            <p className="text-center text-neutral-400 py-12">No products yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-500 text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Product</th>
                    <th className="px-6 py-3 font-medium">SKU</th>
                    <th className="px-6 py-3 font-medium text-right">Qty</th>
                    <th className="px-6 py-3 font-medium text-right">Value at Cost</th>
                    <th className="px-6 py-3 font-medium text-right">Value at Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {inventory.map((p, i) => (
                    <tr key={i} className="hover:bg-neutral-50">
                      <td className="px-6 py-3 font-medium">{p.name}</td>
                      <td className="px-6 py-3 text-neutral-500">{p.sku || "—"}</td>
                      <td className="px-6 py-3 text-right">{p.quantity}</td>
                      <td className="px-6 py-3 text-right">${p.valueAtCost.toFixed(2)}</td>
                      <td className="px-6 py-3 text-right">${p.valueAtPrice.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {/* ... existing report cards ... */}

      <ReportNotes />
    </div>
  );
}