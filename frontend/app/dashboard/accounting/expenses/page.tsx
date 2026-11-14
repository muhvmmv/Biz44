"use client";

import { useEffect, useState } from "react";
import PaymentAccountSelect from "@/components/ui/PaymentAccountSelect";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import NumericInput from "@/components/ui/NumericInput";
import { Plus, DollarSign } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

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
  const { format } = useCurrency();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    category: "General Expense",
    amount: 0,
    description: "",
    date: new Date().toISOString().split("T")[0],
  });
  const [accountId, setAccountId] = useState("");
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
      .then((res) => {
        if (active) setExpenses(res.data);
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.amount <= 0) {
      setError("Amount must be greater than 0");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/accounting/expenses", {
        method: "POST",
        body: JSON.stringify({ ...form, accountId }),
      });
      setShowForm(false);
      setForm({
        category: "General Expense",
        amount: 0,
        description: "",
        date: new Date().toISOString().split("T")[0],
      });
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
            <p className="text-sm text-ink-soft">Total expenses</p>
            <p className="text-2xl font-bold mt-1 text-ink">{format(total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-ink-soft">Number of entries</p>
            <p className="text-2xl font-bold mt-1 text-ink">{expenses.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <div className="py-16 text-center text-ink-soft">
              <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No expenses recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ivory text-ink-soft text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Category</th>
                    <th className="px-6 py-3 font-medium">Description</th>
                    <th className="px-6 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-ivory">
                      <td className="px-6 py-3 text-ink-soft">
                        {new Date(e.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant="danger">{e.account.name}</Badge>
                      </td>
                      <td className="px-6 py-3 text-ink-soft">
                        {e.description || "—"}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-danger">
                        -{format(e.amount)}
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-border-soft">
            <div className="p-6 border-b border-border-soft">
              <h2 className="text-lg font-bold text-charcoal">Record Expense</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-charcoal">
                  Category
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(" Expense", "")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-charcoal">
                  Amount
                </label>
                <NumericInput
                  min={0.01}
                  value={form.amount}
                  onChange={(v) => setForm({ ...form, amount: v })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-charcoal">
                  Paid from
                </label>
                <PaymentAccountSelect value={accountId} onChange={setAccountId} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-charcoal">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-charcoal">
                  Description
                </label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              {error && <p className="text-danger text-sm">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={submitting}>
                  Record
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}