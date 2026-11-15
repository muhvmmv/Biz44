"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { reportError, confirmAction } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import NumericInput from "@/components/ui/NumericInput";
import { Play, Check, Trash2, DollarSign } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import Dialog from "@/components/ui/Dialog";
import PaymentAccountSelect from "@/components/ui/PaymentAccountSelect";

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
  const { format } = useCurrency();
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
      .then((res) => {
        if (active) setPayrolls(res.data);
      })
      .catch((e: unknown) => reportError(e, "Could not load this page"))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
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

  const [paying, setPaying] = useState<Payroll | null>(null);
  const [payAccountId, setPayAccountId] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");

  const markPaid = (id: string) => {
    setPayError("");
    setPaying(payrolls.find((p) => p.id === id) ?? null);
  };

  const confirmPay = async () => {
    if (!paying) return;
    setPayBusy(true);
    setPayError("");
    try {
      await apiFetch(`/payroll/${paying.id}/pay`, {
        method: "POST",
        body: JSON.stringify({ accountId: payAccountId }),
      });
      setPaying(null);
      load();
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPayBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ title: "Delete this payroll entry?", danger: true }))) return;
    try {
      await apiFetch(`/payroll/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      reportError(err);
    }
  };

  const totalPending = payrolls
    .filter((p) => p.status === "pending")
    .reduce((s, p) => s + p.net, 0);
  const totalPaid = payrolls
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + p.net, 0);

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
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-ink-soft">Pending</p>
            <p className="text-2xl font-bold mt-1 text-warning">
              {format(totalPending)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-ink-soft">Paid</p>
            <p className="text-2xl font-bold mt-1 text-success">
              {format(totalPaid)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-ink-soft">Entries</p>
            <p className="text-2xl font-bold mt-1 text-ink">{payrolls.length}</p>
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
          ) : payrolls.length === 0 ? (
            <div className="py-16 text-center text-ink-soft">
              <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No payroll entries yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ivory text-ink-soft text-left">
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
                <tbody className="divide-y divide-border-soft">
                  {payrolls.map((p) => (
                    <tr key={p.id} className="hover:bg-ivory">
                      <td className="px-6 py-3">
                        <div className="font-medium text-ink">
                          {p.employee.firstName} {p.employee.lastName}
                        </div>
                        {p.employee.position && (
                          <div className="text-xs text-ink-soft">
                            {p.employee.position}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3 text-ink-soft">{p.period}</td>
                      <td className="px-6 py-3 text-right text-ink">
                        {format(p.gross)}
                      </td>
                      <td className="px-6 py-3 text-right text-danger">
                        -{format(p.deductions)}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-ink">
                        {format(p.net)}
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={p.status === "paid" ? "success" : "warning"}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex gap-1 justify-end">
                          {p.status === "pending" && (
                            <>
                              <button
                                onClick={() => markPaid(p.id)}
                                className="p-1 text-ink-soft hover:text-success"
                                title="Pay salary"
                                aria-label="Pay salary"
                              >
                                <Check size={16} />
                              </button>
                              <button
                                onClick={() => handleDelete(p.id)}
                                className="p-1 text-ink-soft hover:text-danger"
                                title="Delete" aria-label="Delete payroll entry"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-border-soft">
            <div className="p-6 border-b border-border-soft">
              <h2 className="text-lg font-bold text-charcoal">Run Payroll</h2>
              <p className="text-sm text-ink-soft mt-1">
                Creates payroll entries for all employees for the selected period.
              </p>
            </div>
            <form onSubmit={handleRun} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-charcoal">
                  Period
                </label>
                <input
                  type="month"
                  required
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-charcoal">
                  Deduction rate (%)
                </label>
                <NumericInput
                  min={0}
                  max={100}
                  value={deductionRate}
                  onChange={setDeductionRate}
                />
              </div>
              {error && <p className="text-danger text-sm">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowRun(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={submitting}>
                  Run Payroll
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Dialog
        open={paying !== null}
        onClose={() => setPaying(null)}
        title="Pay salary"
        description={
          paying
            ? `${paying.employee.firstName} ${paying.employee.lastName} · ${paying.period}. The full gross salary is recorded as an expense; deductions are kept as owed until paid over.`
            : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setPaying(null)}>Cancel</Button>
            <Button onClick={confirmPay} isLoading={payBusy}>Pay {paying ? format(paying.net) : ""}</Button>
          </>
        }
      >
        {paying && (
          <div className="rounded-xl bg-ivory p-4 text-sm grid grid-cols-2 gap-1">
            <span className="text-ink-soft">Gross salary</span><span className="text-right tabular-nums">{format(paying.gross)}</span>
            <span className="text-ink-soft">Deductions</span><span className="text-right tabular-nums">− {format(paying.deductions)}</span>
            <span className="font-medium">Net pay</span><span className="text-right tabular-nums font-medium">{format(paying.net)}</span>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">Pay from</label>
          <PaymentAccountSelect value={payAccountId} onChange={setPayAccountId} />
        </div>
        {payError && <p className="text-sm text-danger">{payError}</p>}
      </Dialog>
    </div>
  );
}
