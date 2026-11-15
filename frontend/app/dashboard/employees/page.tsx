"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Briefcase } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import DataTable, { Column } from "@/components/ui/DataTable";
import StatCard from "@/components/ui/StatCard";
import NumericInput from "@/components/ui/NumericInput";
import { Field, Input } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { useOpenOnQuery } from "@/hooks/useOpenOnQuery";
import { can } from "@/lib/permissions";

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

const EMPTY = { firstName: "", lastName: "", email: "", phone: "", position: "", salary: 0, hireDate: "" };

export default function EmployeesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { format } = useCurrency();
  const canEdit = can(user?.permissions, "hr", "write");
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [deleting, setDeleting] = useState<Employee | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Employee[] }>("/employees")
      .then((r) => { if (active) { setEmployees(r.data); setLoadError(null); } })
      .catch((e: unknown) => { if (active) setLoadError(e instanceof Error ? e.message : "Something went wrong"); });
    return () => { active = false; };
  }, [reloadKey]);
  const reload = () => setReloadKey((k) => k + 1);

  const openNew = useCallback(() => {
    setEditing(null);
    setForm(EMPTY);
    setFormError("");
    setFormOpen(true);
  }, []);
  useOpenOnQuery("new", openNew);

  const openEdit = (e: Employee) => {
    setEditing(e);
    setForm({
      firstName: e.firstName, lastName: e.lastName, email: e.email ?? "", phone: e.phone ?? "",
      position: e.position ?? "", salary: e.salary || 0, hireDate: e.hireDate ? e.hireDate.split("T")[0] : "",
    });
    setFormError("");
    setFormOpen(true);
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setFormError("");
    if (!form.firstName.trim() || !form.lastName.trim()) return setFormError("Enter the first and last name");
    if (form.salary < 0) return setFormError("Salary cannot be negative");
    setSaving(true);
    try {
      await apiFetch(editing ? `/employees/${editing.id}` : "/employees", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({ ...form, salary: Number(form.salary), hireDate: form.hireDate ? new Date(form.hireDate) : null }),
      });
      setFormOpen(false);
      reload();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Could not save the employee");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteError("");
    setDeleteBusy(true);
    try {
      await apiFetch(`/employees/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      reload();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete the employee");
    } finally {
      setDeleteBusy(false);
    }
  };

  const payroll = (employees ?? []).reduce((s, e) => s + (e.salary || 0), 0);

  const columns: Column<Employee>[] = [
    {
      key: "name", header: "Name", sortValue: (e) => `${e.firstName} ${e.lastName}`,
      cell: (e) => (
        <span>
          <span className="font-medium">{e.firstName} {e.lastName}</span>
          {e.position && <span className="block text-xs text-ink-soft">{e.position}</span>}
        </span>
      ),
    },
    { key: "phone", header: "Phone", hideBelow: "sm", cell: (e) => <span className="text-ink-soft">{e.phone || "—"}</span> },
    { key: "hired", header: "Hired", hideBelow: "md", sortValue: (e) => (e.hireDate ? new Date(e.hireDate) : new Date(0)), cell: (e) => <span className="text-ink-soft">{e.hireDate ? new Date(e.hireDate).toLocaleDateString() : "—"}</span> },
    { key: "salary", header: "Monthly salary", align: "right", sortValue: (e) => e.salary, cell: (e) => format(e.salary || 0) },
  ];
  if (canEdit) {
    columns.push({
      key: "actions", header: "", align: "right",
      cell: (e) => (
        <span className="inline-flex gap-1">
          <Button variant="ghost" size="icon-sm" onClick={(ev) => { ev.stopPropagation(); openEdit(e); }} aria-label={`Edit ${e.firstName} ${e.lastName}`}><Pencil size={15} /></Button>
          <Button variant="ghost" size="icon-sm" onClick={(ev) => { ev.stopPropagation(); setDeleteError(""); setDeleting(e); }} aria-label={`Delete ${e.firstName} ${e.lastName}`} className="hover:text-danger"><Trash2 size={15} /></Button>
        </span>
      ),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Factory and office staff, their roles and salaries. Payroll uses these salaries."
        actions={canEdit ? <Button onClick={openNew}><Plus size={16} /> Add employee</Button> : undefined}
      />

      {employees && employees.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard label="Employees" value={employees.length} />
          <StatCard label="Monthly salaries" value={format(payroll)} />
        </div>
      )}

      <DataTable
        rows={employees}
        columns={columns}
        rowKey={(e) => e.id}
        searchText={(e) => `${e.firstName} ${e.lastName} ${e.position ?? ""} ${e.phone ?? ""} ${e.email ?? ""}`}
        searchPlaceholder="Search name, role or phone"
        error={loadError}
        onRetry={reload}
        onRowClick={(e) => router.push(`/dashboard/employees/${e.id}`)}
        rowLabel={(e) => `Open ${e.firstName} ${e.lastName}`}
        empty={{
          icon: <Briefcase size={22} />,
          title: "No employees yet",
          description: "Add your staff to run payroll and track attendance and leave.",
          action: canEdit ? <Button onClick={openNew}><Plus size={16} /> Add employee</Button> : undefined,
        }}
      />

      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit employee" : "Add employee"}
        footer={<><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" form="employee-form" isLoading={saving}>{editing ? "Save" : "Add employee"}</Button></>}
      >
        <form id="employee-form" onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} autoFocus /></Field>
            <Field label="Last name" required><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role / position"><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="e.g. Mill operator" /></Field>
            <Field label="Hire date"><Input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          </div>
          <Field label="Monthly salary"><NumericInput min={0} value={form.salary} onChange={(v) => setForm({ ...form, salary: v })} /></Field>
          {formError && <p className="text-sm text-danger" role="alert">{formError}</p>}
        </form>
      </Dialog>

      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting ? `${deleting.firstName} ${deleting.lastName}` : "employee"}?`}
        description="Employees with payroll, attendance or leave records cannot be deleted; their history is kept."
        footer={<><Button variant="outline" onClick={() => setDeleting(null)}>Keep</Button><Button variant="danger" onClick={remove} isLoading={deleteBusy}>Delete</Button></>}
      >
        {deleteError ? <p className="text-sm text-danger" role="alert">{deleteError}</p> : <p className="text-sm text-ink-soft">This can&apos;t be undone.</p>}
      </Dialog>
    </div>
  );
}
