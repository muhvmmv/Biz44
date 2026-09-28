"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import { Play, Check, Trash2, DollarSign } from "lucide-react";

interface Payroll {
  id: string;
  period: string;
  gross: number;
  deductions: number;
  net: number;
  status: string;
  paidAt: string | null;
  employee: { firstName: string; lastName: string; position: string | null };
}

export default function PayrollPage() {
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRun, setShowRun] = useState(false);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [deductionRate, setDeductionRate] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    apiFetch<{ success: boolean; data: Payroll[] }>("/payroll")
      .then((res) => setPayrolls(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Payroll[] }>("/payroll")
      .then((res) => { if (active) setPayrolls(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await apiFetch("/payroll/run", {
        method: "POST",
        body: JSON.stringify({ period, deductionRate: Number(deductionRate) }),
      });
      setShowRun(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const markPaid = async (id: string) => {
    if (!confirm("Mark this payroll as paid? Salary expense will be recorded.")) return;
    try {
      await apiFetch(`/payroll/${id}/pay`, { method: "POST" });
      load();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this payroll entry?")) return;
    try {
      await apiFetch(`/payroll/${id}`, { method: "DELETE" });
      load();
    } catch (err) { console.error(err); }
  };

  const totalPending = payrolls.filter((p) => p.status === "pending").reduce((s, p) => s + p.net, 0);
  const totalPaid = payrolls.filter((p) => p.status === "paid").reduce((s, p) => s + p.net, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="Run payroll and manage salary payments."
        actions={
          <Button onClick={() => setShowRun(true)}>
            <Play className="w-4 h-4 mr-1" /> Run Payroll
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-5">
          <p className="text-sm text-neutral-500">Pending</p>
          <p className="text-2xl font-bold mt-1 text-amber-600">${totalPending.toFixed(2)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-neutral-500">Paid</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600">${totalPaid.toFixed(2)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-neutral-500">Entries</p>
          <p className="text-2xl font-bold mt-1">{payrolls.length}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : payrolls.length === 0 ? (
            <div className="py-16 text-center text-neutral-400">
              <DollarSign className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
              <p>No payroll entries yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-500 text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Employee</th>
                    <th className="px-6 py-3 font-medium">Period</th>
                    <th className="px-6 py-3 font-medium text-right">Gross</th>
                    <th className="px-6 py-3 font-medium text-right">Deductions</th>
                    <th className="px-6 py-3 font-medium text-right">Net</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium w-32"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {payrolls.map((p) => (
                    <tr key={p.id} className="hover:bg-neutral-50">
                      <td className="px-6 py-3">
                        <div className="font-medium">{p.employee.firstName} {p.employee.lastName}</div>
                        {p.employee.position && <div className="text-xs text-neutral-500">{p.employee.position}</div>}
                      </td>
                      <td className="px-6 py-3 text-neutral-600">{p.period}</td>
                      <td className="px-6 py-3 text-right">${p.gross.toFixed(2)}</td>
                      <td className="px-6 py-3 text-right text-red-600">-${p.deductions.toFixed(2)}</td>
                      <td className="px-6 py-3 text-right font-medium">${p.net.toFixed(2)}</td>
                      <td className="px-6 py-3">
                        <Badge variant={p.status === "paid" ? "success" : "warning"}>{p.status}</Badge>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex gap-1 justify-end">
                          {p.status === "pending" && (
                            <button onClick={() => markPaid(p.id)}
                              className="p-1 text-neutral-400 hover:text-emerald-600" title="Mark paid">
                              <Check size={16} />
                            </button>
                          )}
                          {p.status === "pending" && (
                            <button onClick={() => handleDelete(p.id)}
                              className="p-1 text-neutral-400 hover:text-red-600" title="Delete">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold">Run Payroll</h2>
              <p className="text-sm text-neutral-500 mt-1">
                Creates payroll entries for all employees for the selected period.
              </p>
            </div>
            <form onSubmit={handleRun} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Period</label>
                <input type="month" required value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Deduction rate (%)</label>
                <input type="number" step="0.1" min="0" max="100"
                  value={deductionRate}
                  onChange={(e) => setDeductionRate(Number(e.target.value))}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
                <p className="text-xs text-neutral-500 mt-1">Applied to all salaries in this run.</p>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowRun(false)}>Cancel</Button>
                <Button type="submit" isLoading={submitting}>Run Payroll</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}