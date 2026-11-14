"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import NumericInput from "@/components/ui/NumericInput";
import { Plus, Pencil, Trash2, Briefcase } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  salary: number;
  hireDate: string | null;
}

export default function EmployeesPage() {
  const { format } = useCurrency();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    position: "",
    salary: 0,
    hireDate: "",
  });

  const reload = () => {
    apiFetch<{ success: boolean; data: Employee[] }>("/employees")
      .then((res) => setEmployees(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Employee[] }>("/employees")
      .then((res) => {
        if (active) setEmployees(res.data);
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      position: "",
      salary: 0,
      hireDate: "",
    });
    setShowForm(true);
  };

  const openEdit = (e: Employee) => {
    setEditing(e);
    setForm({
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email || "",
      phone: e.phone || "",
      position: e.position || "",
      salary: e.salary || 0,
      hireDate: e.hireDate ? e.hireDate.split("T")[0] : "",
    });
    setShowForm(true);
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const payload = {
      ...form,
      salary: Number(form.salary),
      hireDate: form.hireDate ? new Date(form.hireDate) : null,
    };
    try {
      if (editing) {
        await apiFetch(`/employees/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/employees", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setShowForm(false);
      reload();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this employee?")) return;
    try {
      await apiFetch(`/employees/${id}`, { method: "DELETE" });
      reload();
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    return (
      e.firstName.toLowerCase().includes(q) ||
      e.lastName.toLowerCase().includes(q) ||
      (e.position || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Manage your team and payroll information."
        actions={
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> Add Employee
          </Button>
        }
      />

      <input
        type="text"
        placeholder="Search by name or position..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:w-80 rounded-lg border border-border-soft bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-brand"
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-ink-soft">
              <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No employees yet.</p>
              <Button onClick={openNew} className="mt-4">
                Add your first employee
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ivory text-ink-soft text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-6 py-3 font-medium">Position</th>
                    <th className="px-6 py-3 font-medium">Email</th>
                    <th className="px-6 py-3 font-medium">Phone</th>
                    <th className="px-6 py-3 font-medium">Salary</th>
                    <th className="px-6 py-3 font-medium">Hire Date</th>
                    <th className="px-6 py-3 font-medium w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {filtered.map((emp) => (
                    <tr key={emp.id} className="hover:bg-ivory">
                      <td className="px-6 py-4">
                        <Link
                          href={`/dashboard/employees/${emp.id}`}
                          className="font-medium text-brand-dark hover:underline"
                        >
                          {emp.firstName} {emp.lastName}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-ink-soft">
                        {emp.position || "—"}
                      </td>
                      <td className="px-6 py-4 text-ink-soft">
                        {emp.email || "—"}
                      </td>
                      <td className="px-6 py-4 text-ink-soft">
                        {emp.phone || "—"}
                      </td>
                      <td className="px-6 py-4 text-ink">{format(emp.salary)}</td>
                      <td className="px-6 py-4 text-ink-soft">
                        {emp.hireDate
                          ? new Date(emp.hireDate).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEdit(emp)}
                            className="p-1 text-ink-soft hover:text-brand-dark transition"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(emp.id)}
                            className="p-1 text-ink-soft hover:text-danger transition"
                          >
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8 border border-border-soft">
            <div className="p-6 border-b border-border-soft">
              <h2 className="text-lg font-bold text-charcoal">
                {editing ? "Edit Employee" : "New Employee"}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-charcoal">
                    First name
                  </label>
                  <input
                    required
                    value={form.firstName}
                    onChange={(e) =>
                      setForm({ ...form, firstName: e.target.value })
                    }
                    className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-charcoal">
                    Last name
                  </label>
                  <input
                    required
                    value={form.lastName}
                    onChange={(e) =>
                      setForm({ ...form, lastName: e.target.value })
                    }
                    className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-charcoal">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-charcoal">
                  Phone
                </label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-charcoal">
                  Position
                </label>
                <input
                  value={form.position}
                  onChange={(e) =>
                    setForm({ ...form, position: e.target.value })
                  }
                  className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-charcoal">
                    Salary
                  </label>
                  <NumericInput
                    min={0}
                    value={form.salary}
                    onChange={(v) => setForm({ ...form, salary: v })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-charcoal">
                    Hire date
                  </label>
                  <input
                    type="date"
                    value={form.hireDate}
                    onChange={(e) =>
                      setForm({ ...form, hireDate: e.target.value })
                    }
                    className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">{editing ? "Update" : "Create"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}