"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import { Plus, DollarSign } from "lucide-react";

interface Expense {
  id: string;
  description: string | null;
  amount: number;
  date: string;
  account: { name: string };
}

const categories = [
  "Rent Expense",
  "Utilities Expense",
  "Salary Expense",
  "Transportation",
  "Marketing",
  "Software",
  "Insurance",
  "General Expense",
];

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    category: "General Expense",
    amount: 0,
    description: "",
    date: new Date().toISOString().split("T")[0],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    apiFetch<{ success: boolean; data: Expense[] }>("/accounting/expenses")
      .then((res) => setExpenses(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Expense[] }>("/accounting/expenses")
      .then((res) => { if (active) setExpenses(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.amount <= 0) { setError("Amount must be greater than 0"); return; }
    setSubmitting(true);
    try {
      await apiFetch("/accounting/expenses", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setShowForm(false);
      setForm({ category: "General Expense", amount: 0, description: "", date: new Date().toISOString().split("T")[0] });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Track your business expenses."
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> Record Expense
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-neutral-500">Total expenses</p>
            <p className="text-2xl font-bold mt-1">${total.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-neutral-500">Number of entries</p>
            <p className="text-2xl font-bold mt-1">{expenses.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : expenses.length === 0 ? (
            <div className="py-16 text-center text-neutral-400">
              <DollarSign className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
              <p>No expenses recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-500 text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Category</th>
                    <th className="px-6 py-3 font-medium">Description</th>
                    <th className="px-6 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-neutral-50">
                      <td className="px-6 py-3 text-neutral-600">
                        {new Date(e.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant="danger">{e.account.name}</Badge>
                      </td>
                      <td className="px-6 py-3 text-neutral-600">{e.description || "—"}</td>
                      <td className="px-6 py-3 text-right font-medium text-red-600">
                        -${e.amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold">Record Expense</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white">
                  {categories.map((c) => <option key={c} value={c}>{c.replace(" Expense", "")}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Amount</label>
                <input type="number" step="0.01" min="0.01" required value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date</label>
                <input type="date" value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" isLoading={submitting}>Record</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}