"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, KeyRound } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Dialog from "@/components/ui/Dialog";
import DataTable, { Column } from "@/components/ui/DataTable";
import { Field, Input, Select } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "@/hooks/useLocation";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/permissions";

interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  locations: { id: string; name: string }[];
}

const ROLES = ["admin", "manager", "accountant", "storekeeper", "sales"];

interface Form { firstName: string; lastName: string; email: string; role: string; password: string; locationIds: string[]; isActive: boolean }

export default function TeamPage() {
  const { user } = useAuth();
  const { locations } = useLocation();
  const isAdmin = user?.role === "admin";
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  const [editing, setEditing] = useState<TeamMember | "new" | null>(null);
  const [form, setForm] = useState<Form>({ firstName: "", lastName: "", email: "", role: "sales", password: "", locationIds: [], isActive: true });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [resetFor, setResetFor] = useState<TeamMember | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetMessage, setResetMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => apiFetch<{ success: boolean; data: TeamMember[] }>("/users").then((r) => r.data), []);
  useEffect(() => {
    let active = true;
    load()
      .then((d) => { if (active) { setMembers(d); setError(null); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load the team"); });
    return () => { active = false; };
  }, [load, key]);

  const openNew = () => {
    setForm({ firstName: "", lastName: "", email: "", role: "sales", password: "", locationIds: locations.map((l) => l.id).slice(0, 1), isActive: true });
    setFormError("");
    setEditing("new");
  };
  const openEdit = (m: TeamMember) => {
    setForm({ firstName: m.firstName, lastName: m.lastName, email: m.email, role: m.role, password: "", locationIds: m.locations.map((l) => l.id), isActive: m.isActive });
    setFormError("");
    setEditing(m);
  };

  const save = async () => {
    setFormError("");
    if (!form.firstName.trim() || !form.lastName.trim()) return setFormError("Enter the first and last name");
    if (form.locationIds.length === 0) return setFormError("Choose at least one location");
    if (editing === "new" && form.password.length < 8) return setFormError("The starting password must be at least 8 characters");
    setSaving(true);
    try {
      if (editing === "new") {
        await apiFetch("/users", { method: "POST", body: JSON.stringify(form) });
      } else if (editing) {
        const { firstName, lastName, role, locationIds, isActive } = form;
        await apiFetch(`/users/${editing.id}`, { method: "PUT", body: JSON.stringify({ firstName, lastName, role, locationIds, isActive }) });
      }
      setEditing(null);
      setKey((k) => k + 1);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!resetFor) return;
    setResetMessage(null);
    if (newPassword.length < 8) return setResetMessage({ ok: false, text: "At least 8 characters" });
    try {
      await apiFetch(`/users/${resetFor.id}/password`, { method: "POST", body: JSON.stringify({ password: newPassword }) });
      setResetMessage({ ok: true, text: `Password set. Give it to ${resetFor.firstName}; they can change it on their profile.` });
      setNewPassword("");
    } catch (e: unknown) {
      setResetMessage({ ok: false, text: e instanceof Error ? e.message : "Could not set the password" });
    }
  };

  const toggleLocation = (id: string) =>
    setForm((f) => ({ ...f, locationIds: f.locationIds.includes(id) ? f.locationIds.filter((x) => x !== id) : [...f.locationIds, id] }));

  const columns: Column<TeamMember>[] = [
    {
      key: "name", header: "Name", sortValue: (m) => `${m.firstName} ${m.lastName}`,
      cell: (m) => (
        <span>
          <span className="font-medium">{m.firstName} {m.lastName}</span>
          {m.id === user?.id && <span className="ml-1.5 text-xs text-ink-soft">(you)</span>}
          <span className="block text-xs text-ink-soft">{m.email}</span>
        </span>
      ),
    },
    { key: "role", header: "Role", sortValue: (m) => m.role, cell: (m) => ROLE_LABELS[m.role] ?? m.role },
    { key: "locations", header: "Locations", hideBelow: "md", cell: (m) => <span className="text-ink-soft">{m.locations.map((l) => l.name).join(", ") || "—"}</span> },
    { key: "status", header: "Status", sortValue: (m) => (m.isActive ? 0 : 1), cell: (m) => (m.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="default">Deactivated</Badge>) },
  ];
  if (isAdmin) {
    columns.push({
      key: "actions", header: "", align: "right",
      cell: (m) => (
        <span className="inline-flex gap-1">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setResetFor(m); setNewPassword(""); setResetMessage(null); }}>
            <KeyRound size={14} /> Password
          </Button>
        </span>
      ),
    });
  }

  const self = editing && editing !== "new" && editing.id === user?.id;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="Everyone who can sign in to your company, what their role allows, and which locations they work at."
        actions={isAdmin ? <Button onClick={openNew}><UserPlus size={16} /> Add staff member</Button> : undefined}
      />
      {!isAdmin && <p className="text-sm text-ink-soft">Only an administrator can add or change staff accounts.</p>}

      <DataTable
        rows={members}
        columns={columns}
        rowKey={(m) => m.id}
        searchText={(m) => `${m.firstName} ${m.lastName} ${m.email} ${m.role}`}
        searchPlaceholder="Search name, email or role"
        error={error}
        onRetry={() => setKey((k) => k + 1)}
        onRowClick={isAdmin ? openEdit : undefined}
        rowLabel={(m) => `Edit ${m.firstName} ${m.lastName}`}
        empty={{ title: "No staff yet" }}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {ROLES.map((r) => (
          <div key={r} className="rounded-2xl border border-border-soft bg-surface p-4 text-sm">
            <p className="font-semibold">{ROLE_LABELS[r]}</p>
            <p className="mt-1 text-ink-soft">{ROLE_DESCRIPTIONS[r]}</p>
          </div>
        ))}
      </div>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add staff member" : "Edit staff member"}
        description={editing === "new" ? "They sign in with this email and the starting password you give them, and can change it on their profile." : undefined}
        className="sm:max-w-lg"
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save} isLoading={saving}>{editing === "new" ? "Add" : "Save"}</Button></>}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
          <Field label="Last name" required><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
        </div>
        {editing === "new" ? (
          <>
            <Field label="Email" required><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" /></Field>
            <Field label="Starting password" required hint="At least 8 characters"><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></Field>
          </>
        ) : (
          <Field label="Email"><Input value={form.email} disabled /></Field>
        )}
        <Field label="Role" hint={ROLE_DESCRIPTIONS[form.role]}>
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={!!self}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Locations</legend>
          <div className="flex flex-wrap gap-2">
            {locations.map((l) => (
              <label key={l.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${form.locationIds.includes(l.id) ? "border-brand bg-brand-light" : "border-border-soft"}`}>
                <input type="checkbox" className="accent-[var(--color-brand)]" checked={form.locationIds.includes(l.id)} onChange={() => toggleLocation(l.id)} />
                {l.name}
              </label>
            ))}
          </div>
        </fieldset>
        {editing !== "new" && !self && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Active (untick to stop them signing in; their records are kept)
          </label>
        )}
        {formError && <p className="text-sm text-danger" role="alert">{formError}</p>}
      </Dialog>

      <Dialog
        open={resetFor !== null}
        onClose={() => setResetFor(null)}
        title={`Set a new password for ${resetFor?.firstName ?? ""}`}
        description="Use this when someone has forgotten their password."
        footer={<><Button variant="outline" onClick={() => setResetFor(null)}>Close</Button><Button onClick={resetPassword}>Set password</Button></>}
      >
        <Field label="New password" hint="At least 8 characters"><Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></Field>
        {resetMessage && <p className={`text-sm ${resetMessage.ok ? "text-success" : "text-danger"}`} role={resetMessage.ok ? "status" : "alert"}>{resetMessage.text}</p>}
      </Dialog>
    </div>
  );
}
