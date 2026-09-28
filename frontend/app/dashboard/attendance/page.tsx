"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import { Plus, Trash2, Calendar } from "lucide-react";

interface Employee { id: string; firstName: string; lastName: string; }
interface AttendanceRecord {
  id: string;
  date: string;
  status: string;
  notes: string | null;
  employee: { firstName: string; lastName: string };
}

const statuses = ["present", "absent", "late", "leave"];

const statusVariant = (s: string): "success" | "danger" | "warning" | "info" => {
  if (s === "present") return "success";
  if (s === "absent") return "danger";
  if (s === "late") return "warning";
  return "info";
};

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    employeeId: "",
    date: new Date().toISOString().split("T")[0],
    status: "present",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    apiFetch<{ success: boolean; data: AttendanceRecord[] }>("/attendance")
      .then((res) => setRecords(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ success: boolean; data: AttendanceRecord[] }>("/attendance"),
      apiFetch<{ success: boolean; data: Employee[] }>("/employees"),
    ]).then(([a, e]) => {
      if (active) {
        setRecords(a.data);
        setEmployees(e.data);
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/attendance", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setShowForm(false);
      setForm({ ...form, notes: "" });
      load();
    } catch (err) { console.error(err); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this record?")) return;
    try {
      await apiFetch(`/attendance/${id}`, { method: "DELETE" });
      load();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Track employee attendance."
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> Mark Attendance
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : records.length === 0 ? (
            <div className="py-16 text-center text-neutral-400">
              <Calendar className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
              <p>No attendance records yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-500 text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Employee</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Notes</th>
                    <th className="px-6 py-3 font-medium w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-neutral-50">
                      <td className="px-6 py-3 text-neutral-600">
                        {new Date(r.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3 font-medium">
                        {r.employee.firstName} {r.employee.lastName}
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                      </td>
                      <td className="px-6 py-3 text-neutral-500">{r.notes || "—"}</td>
                      <td className="px-6 py-3">
                        <button onClick={() => handleDelete(r.id)}
                          className="p-1 text-neutral-400 hover:text-red-600">
                          <Trash2 size={16} />
                        </button>
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
              <h2 className="text-lg font-bold">Mark Attendance</h2>
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
                <label className="block text-sm font-medium mb-1">Date</label>
                <input type="date" required value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white">
                  {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <input value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" isLoading={submitting}>Save</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}