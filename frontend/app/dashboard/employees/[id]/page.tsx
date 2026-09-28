"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Plus } from "lucide-react";

interface Data {
  employee: {
    id: string; firstName: string; lastName: string; email: string | null;
    phone: string | null; position: string | null; salary: number;
    hireDate: string | null; createdAt: string;
  };
  attendance: { id: string; date: string; status: string; notes: string | null }[];
  attendanceSummary: { present: number; absent: number; late: number; leave: number };
  leaves: { id: string; type: string; startDate: string; endDate: string; status: string; reason: string | null }[];
  payrolls: { id: string; period: string; gross: number; net: number; status: string }[];
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "attendance" | "payroll" | "leave">("overview");
  const [showAttendance, setShowAttendance] = useState(false);
  const [attForm, setAttForm] = useState({
    date: new Date().toISOString().split("T")[0],
    status: "present",
    notes: "",
  });

  const load = () => {
    apiFetch<{ success: boolean; data: Data }>(`/employees/${id}/summary`)
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Data }>(`/employees/${id}/summary`)
      .then((res) => { if (active) setData(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const markAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch("/attendance", {
        method: "POST",
        body: JSON.stringify({ employeeId: id, ...attForm }),
      });
      setShowAttendance(false);
      setAttForm({ ...attForm, notes: "" });
      load();
    } catch (err) { console.error(err); }
  };

  if (loading) return <div className="p-8"><Skeleton className="h-96" /></div>;
  if (!data) return <div className="p-8 text-neutral-500">Employee not found.</div>;

  const { employee, attendance, attendanceSummary, leaves, payrolls } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${employee.firstName} ${employee.lastName}`}
        description={employee.position || "Employee"}
        actions={
          <Button onClick={() => setShowAttendance(true)}>
            <Plus className="w-4 h-4 mr-1" /> Mark Attendance
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-5">
          <p className="text-sm text-neutral-500">Salary</p>
          <p className="text-2xl font-bold mt-1">${employee.salary.toFixed(2)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-neutral-500">Present</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600">{attendanceSummary.present}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-neutral-500">Absent</p>
          <p className="text-2xl font-bold mt-1 text-red-600">{attendanceSummary.absent}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-neutral-500">Late</p>
          <p className="text-2xl font-bold mt-1 text-amber-600">{attendanceSummary.late}</p>
        </CardContent></Card>
      </div>

      <div className="flex gap-2 border-b border-neutral-200">
        {(["overview", "attendance", "payroll", "leave"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <Card>
          <CardHeader><CardTitle>Contact & Info</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-3 gap-4 text-sm">
            <div><p className="text-neutral-500">Email</p><p className="font-medium">{employee.email || "—"}</p></div>
            <div><p className="text-neutral-500">Phone</p><p className="font-medium">{employee.phone || "—"}</p></div>
            <div><p className="text-neutral-500">Hire date</p><p className="font-medium">{employee.hireDate ? new Date(employee.hireDate).toLocaleDateString() : "—"}</p></div>
          </CardContent>
        </Card>
      )}

      {tab === "attendance" && (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-left">
              <tr>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {attendance.map((a) => (
                <tr key={a.id}>
                  <td className="px-6 py-3 text-neutral-600">{new Date(a.date).toLocaleDateString()}</td>
                  <td className="px-6 py-3">
                    <Badge variant={a.status === "present" ? "success" : a.status === "absent" ? "danger" : a.status === "late" ? "warning" : "info"}>
                      {a.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-neutral-500">{a.notes || "—"}</td>
                </tr>
              ))}
              {attendance.length === 0 && (
                <tr><td colSpan={3} className="text-center text-neutral-400 py-8">No attendance records</td></tr>
              )}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      {tab === "payroll" && (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-left">
              <tr>
                <th className="px-6 py-3 font-medium">Period</th>
                <th className="px-6 py-3 font-medium text-right">Gross</th>
                <th className="px-6 py-3 font-medium text-right">Net</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {payrolls.map((p) => (
                <tr key={p.id}>
                  <td className="px-6 py-3 font-medium">{p.period}</td>
                  <td className="px-6 py-3 text-right">${p.gross.toFixed(2)}</td>
                  <td className="px-6 py-3 text-right font-medium">${p.net.toFixed(2)}</td>
                  <td className="px-6 py-3"><Badge variant={p.status === "paid" ? "success" : "warning"}>{p.status}</Badge></td>
                </tr>
              ))}
              {payrolls.length === 0 && (
                <tr><td colSpan={4} className="text-center text-neutral-400 py-8">No payroll entries</td></tr>
              )}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      {tab === "leave" && (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-left">
              <tr>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">From</th>
                <th className="px-6 py-3 font-medium">To</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {leaves.map((l) => (
                <tr key={l.id}>
                  <td className="px-6 py-3"><Badge variant="info">{l.type}</Badge></td>
                  <td className="px-6 py-3 text-neutral-600">{new Date(l.startDate).toLocaleDateString()}</td>
                  <td className="px-6 py-3 text-neutral-600">{new Date(l.endDate).toLocaleDateString()}</td>
                  <td className="px-6 py-3"><Badge variant={l.status === "approved" ? "success" : l.status === "rejected" ? "danger" : "warning"}>{l.status}</Badge></td>
                </tr>
              ))}
              {leaves.length === 0 && (
                <tr><td colSpan={4} className="text-center text-neutral-400 py-8">No leave requests</td></tr>
              )}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      {showAttendance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold">Mark Attendance</h2>
              <p className="text-sm text-neutral-500 mt-1">{employee.firstName} {employee.lastName}</p>
            </div>
            <form onSubmit={markAttendance} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Date</label>
                <input type="date" value={attForm.date}
                  onChange={(e) => setAttForm({ ...attForm, date: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <div className="grid grid-cols-4 gap-2">
                  {["present", "absent", "late", "leave"].map((s) => (
                    <button key={s} type="button"
                      onClick={() => setAttForm({ ...attForm, status: s })}
                      className={`py-2 rounded-lg text-sm font-medium border transition ${
                        attForm.status === s ? "border-brand-500 bg-brand-50 text-brand-700" : "border-neutral-200"
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <input value={attForm.notes}
                  onChange={(e) => setAttForm({ ...attForm, notes: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowAttendance(false)}>Cancel</Button>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}