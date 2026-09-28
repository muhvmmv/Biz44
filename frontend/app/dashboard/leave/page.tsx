"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import { Plus, Check, X, Trash2, Calendar } from "lucide-react";

interface Employee { id: string; firstName: string; lastName: string; }
interface Leave {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: string;
  employee: { firstName: string; lastName: string };
}

const leaveTypes = ["annual", "sick", "personal", "other"];

const statusVariant = (s: string): "success" | "danger" | "warning" => {
  if (s === "approved") return "success";
  if (s === "rejected") return "danger";
  return "warning";
};

export default function LeavePage() {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    employeeId: "",
    type: "annual",
    startDate: "",
    endDate: "",
    reason: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    apiFetch<{ success: boolean; data: Leave[] }>("/leave")
      .then((res) => setLeaves(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ success: boolean; data: Leave[] }>("/leave"),
      apiFetch<{ success: boolean; data: Employee[] }>("/employees"),
    ]).then(([l, e]) => {
      if (active) {
        setLeaves(l.data);
        setEmployees(e.data);
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/leave", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setShowForm(false);
      setForm({ employeeId: "", type: "annual", startDate: "", endDate: "", reason: "" });
      load();
    } catch (err) { console.error(err); }
    finally { setSubmitting(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await apiFetch(`/leave/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      load();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this leave request?")) return;
    try {
      await apiFetch(`/leave/${id}`, { method: "DELETE" });
      load();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave"
        description="Manage employee leave requests."
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> New Leave Request
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : leaves.length === 0 ? (
            <div className="py-16 text-center text-neutral-400">
              <Calendar className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
              <p>No leave requests yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-500 text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Employee</th>
                    <th className="px-6 py-3 font-medium">Type</th>
                    <th className="px-6 py-3 font-medium">From</th>
                    <th className="px-6 py-3 font-medium">To</th>
                    <th className="px-6 py-3 font-medium">Reason</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium w-32"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {leaves.map((l) => (
                    <tr key={l.id} className="hover:bg-neutral-50">
                      <td className="px-6 py-3 font-medium">
                        {l.employee.firstName} {l.employee.lastName}
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant="info">{l.type}</Badge>
                      </td>
                      <td className="px-6 py-3 text-neutral-600">
                        {new Date(l.startDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3 text-neutral-600">
                        {new Date(l.endDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3 text-neutral-500">{l.reason || "—"}</td>
                      <td className="px-6 py-3">
                        <Badge variant={statusVariant(l.status)}>{l.status}</Badge>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex gap-1 justify-end">
                          {l.status === "pending" && (
                            <>
                              <button onClick={() => updateStatus(l.id, "approved")}
                                className="p-1 text-neutral-400 hover:text-emerald-600" title="Approve">
                                <Check size={16} />
                              </button>
                              <button onClick={() => updateStatus(l.id, "rejected")}
                                className="p-1 text-neutral-400 hover:text-red-600" title="Reject">
                                <X size={16} />
                              </button>
                            </>
                          )}
                          <button onClick={() => handleDelete(l.id)}
                            className="p-1 text-neutral-400 hover:text-red-600">
                            <Trash2 size={16} />
                          </button>
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

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold">New Leave Request</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Employee</label>
                <select required value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white">
                  <option value="">Select employee</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Leave type</label>
                <select value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white">
                  {leaveTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">From</label>
                  <input type="date" required value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">To</label>
                  <input type="date" required value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Reason</label>
                <input value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" isLoading={submitting}>Submit</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}