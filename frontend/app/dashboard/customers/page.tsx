"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import DataTable, { Column } from "@/components/ui/DataTable";
import { Field, Input } from "@/components/ui/Input";
import { useOpenOnQuery } from "@/hooks/useOpenOnQuery";

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
}

const EMPTY = { firstName: "", lastName: "", email: "", phone: "", address: "" };

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Customer[] }>("/customers")
      .then((r) => { if (active) { setCustomers(r.data); setLoadError(null); } })
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

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ firstName: c.firstName, lastName: c.lastName, email: c.email ?? "", phone: c.phone ?? "", address: c.address ?? "" });
    setFormError("");
    setFormOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      await apiFetch(editing ? `/customers/${editing.id}` : "/customers", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(form),
      });
      setFormOpen(false);
      reload();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Could not save the customer");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await apiFetch(`/customers/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      reload();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete the customer");
    } finally {
      setDeleteBusy(false);
    }
  };

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (c) => `${c.firstName} ${c.lastName}`,
      cell: (c) => (
        <Link href={`/dashboard/customers/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:text-brand-dark">
          {c.firstName} {c.lastName}
        </Link>
      ),
    },
    { key: "phone", header: "Phone", sortValue: (c) => c.phone, cell: (c) => <span className="whitespace-nowrap text-ink-soft">{c.phone || "—"}</span> },
    { key: "email", header: "Email", hideBelow: "md", sortValue: (c) => c.email, cell: (c) => <span className="text-ink-soft">{c.email || "—"}</span> },
    { key: "address", header: "Address", hideBelow: "lg", cell: (c) => <span className="text-ink-soft">{c.address || "—"}</span> },
    {
      key: "added",
      header: "Added",
      hideBelow: "sm",
      align: "right",
      sortValue: (c) => new Date(c.createdAt),
      cell: (c) => <span className="text-ink-soft">{new Date(c.createdAt).toLocaleDateString()}</span>,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (c) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" onClick={() => openEdit(c)} aria-label={`Edit ${c.firstName} ${c.lastName}`}>
            <Pencil size={15} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => { setDeleteError(""); setDeleting(c); }} aria-label={`Delete ${c.firstName} ${c.lastName}`} className="hover:text-danger">
            <Trash2 size={15} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="People and businesses you sell to."
        actions={<Button onClick={openNew}><Plus size={16} /> Add customer</Button>}
      />

      <DataTable
        rows={customers}
        columns={columns}
        rowKey={(c) => c.id}
        searchText={(c) => `${c.firstName} ${c.lastName} ${c.email ?? ""} ${c.phone ?? ""}`}
        searchPlaceholder="Search name, phone or email"
        initialSort={{ key: "name", dir: "asc" }}
        error={loadError}
        onRetry={reload}
        onRowClick={(c) => router.push(`/dashboard/customers/${c.id}`)}
        rowLabel={(c) => `Open ${c.firstName} ${c.lastName}`}
        empty={{
          icon: <Users size={22} />,
          title: "No customers yet",
          description: "Add the people and businesses you sell to, so invoices and balances are tracked per customer.",
          action: <Button onClick={openNew}><Plus size={16} /> Add your first customer</Button>,
        }}
      />

      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit customer" : "New customer"}
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" form="customer-form" isLoading={saving}>{editing ? "Save changes" : "Add customer"}</Button>
          </>
        }
      >
        <form id="customer-form" onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="First name" required>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} autoFocus />
            </Field>
            <Field label="Last name" required>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </Field>
          </div>
          <Field label="Phone">
            <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Address">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          {formError && <p className="text-sm text-danger" role="alert">{formError}</p>}
        </form>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.firstName ?? ""} ${deleting?.lastName ?? ""}?`}
        description="This removes the customer. Customers with invoices can't be deleted."
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>Keep customer</Button>
            <Button variant="danger" onClick={confirmDelete} isLoading={deleteBusy}>Delete</Button>
          </>
        }
      >
        {deleteError ? <p className="text-sm text-danger" role="alert">{deleteError}</p> : <p className="text-sm text-ink-soft">This can&apos;t be undone.</p>}
      </Dialog>
    </div>
  );
}
