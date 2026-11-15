"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Truck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import DataTable, { Column } from "@/components/ui/DataTable";
import StatCard from "@/components/ui/StatCard";
import { Field, Input } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { useOpenOnQuery } from "@/hooks/useOpenOnQuery";
import { can } from "@/lib/permissions";

interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  owed: number;
  overdue: number;
}

const EMPTY = { name: "", email: "", phone: "", address: "" };

export default function SuppliersPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { format } = useCurrency();
  const canEdit = can(user?.permissions, "purchasing", "write");
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Supplier[] }>("/suppliers")
      .then((r) => { if (active) { setSuppliers(r.data); setLoadError(null); } })
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

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, email: s.email ?? "", phone: s.phone ?? "", address: s.address ?? "" });
    setFormError("");
    setFormOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim()) return setFormError("Enter the supplier's name");
    setSaving(true);
    try {
      await apiFetch(editing ? `/suppliers/${editing.id}` : "/suppliers", { method: editing ? "PUT" : "POST", body: JSON.stringify(form) });
      setFormOpen(false);
      reload();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Could not save the supplier");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteError("");
    setDeleteBusy(true);
    try {
      await apiFetch(`/suppliers/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      reload();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete the supplier");
    } finally {
      setDeleteBusy(false);
    }
  };

  const totalOwed = (suppliers ?? []).reduce((s, x) => s + x.owed, 0);
  const totalOverdue = (suppliers ?? []).reduce((s, x) => s + x.overdue, 0);

  const columns: Column<Supplier>[] = [
    { key: "name", header: "Supplier", sortValue: (s) => s.name, cell: (s) => <span className="font-medium">{s.name}</span> },
    { key: "phone", header: "Phone", hideBelow: "sm", cell: (s) => <span className="text-ink-soft">{s.phone || "—"}</span> },
    { key: "email", header: "Email", hideBelow: "md", cell: (s) => <span className="text-ink-soft">{s.email || "—"}</span> },
    {
      key: "owed", header: "You owe", align: "right", sortValue: (s) => s.owed,
      cell: (s) => (s.owed > 0 ? (
        <span>
          {format(s.owed)}
          {s.overdue > 0 && <span className="block text-xs text-danger">{format(s.overdue)} overdue</span>}
        </span>
      ) : <span className="text-ink-faint">—</span>),
    },
  ];
  if (canEdit) {
    columns.push({
      key: "actions", header: "", align: "right",
      cell: (s) => (
        <span className="inline-flex gap-1">
          <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); openEdit(s); }} aria-label={`Edit ${s.name}`}><Pencil size={15} /></Button>
          <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); setDeleteError(""); setDeleting(s); }} aria-label={`Delete ${s.name}`} className="hover:text-danger"><Trash2 size={15} /></Button>
        </span>
      ),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Who you buy from, and what you owe each of them."
        actions={canEdit ? <Button onClick={openNew}><Plus size={16} /> Add supplier</Button> : undefined}
      />

      {suppliers && suppliers.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard label="Suppliers" value={suppliers.length} />
          <StatCard label="You owe" value={format(totalOwed)} />
          <StatCard label="Overdue" value={format(totalOverdue)} tone={totalOverdue > 0 ? "negative" : "default"} />
        </div>
      )}

      <DataTable
        rows={suppliers}
        columns={columns}
        rowKey={(s) => s.id}
        searchText={(s) => `${s.name} ${s.email ?? ""} ${s.phone ?? ""}`}
        searchPlaceholder="Search name, phone or email"
        error={loadError}
        onRetry={reload}
        onRowClick={(s) => router.push(`/dashboard/suppliers/${s.id}`)}
        rowLabel={(s) => `Open ${s.name}`}
        empty={{
          icon: <Truck size={22} />,
          title: "No suppliers yet",
          description: "Add the people and companies you buy raw materials and packaging from.",
          action: canEdit ? <Button onClick={openNew}><Plus size={16} /> Add supplier</Button> : undefined,
        }}
      />

      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit supplier" : "Add supplier"}
        footer={<><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" form="supplier-form" isLoading={saving}>{editing ? "Save" : "Add supplier"}</Button></>}
      >
        <form id="supplier-form" onSubmit={save} className="space-y-4">
          <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          </div>
          <Field label="Address"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          {formError && <p className="text-sm text-danger" role="alert">{formError}</p>}
        </form>
      </Dialog>

      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? "supplier"}?`}
        description="Suppliers with deliveries on record cannot be deleted; their history is kept."
        footer={<><Button variant="outline" onClick={() => setDeleting(null)}>Keep</Button><Button variant="danger" onClick={remove} isLoading={deleteBusy}>Delete</Button></>}
      >
        {deleteError ? <p className="text-sm text-danger" role="alert">{deleteError}</p> : <p className="text-sm text-ink-soft">This can&apos;t be undone.</p>}
      </Dialog>
    </div>
  );
}
