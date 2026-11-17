"use client";

import { useEffect, useState } from "react";
import { Check, Factory, Pencil, Plus, Star, Store, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { reportError, confirmAction } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Dialog from "@/components/ui/Dialog";
import EmptyState from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import { useLocation } from "@/hooks/useLocation";
import { cn } from "@/lib/utils";

type Kind = "factory" | "store";

interface Location {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  isDefault: boolean;
  kind: Kind;
}

const emptyForm = { name: "", kind: "" as Kind | "", city: "", address: "", phone: "", email: "" };

const KINDS: { value: Kind; label: string; icon: typeof Factory; text: string }[] = [
  { value: "factory", label: "Factory", icon: Factory, text: "Buys raw materials, makes products, and sells to customers or to your stores." },
  { value: "store", label: "Store", icon: Store, text: "Receives goods from a factory and sells them. No production or raw materials." },
];

export default function LocationsSettingsPage() {
  const { refresh: refreshSharedLocations } = useLocation();
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const res = await apiFetch<{ success: boolean; data: Location[] }>("/locations");
    setLocations(res.data);
  };

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Location[] }>("/locations")
      .then((res) => { if (active) setLocations(res.data); })
      .catch((e: unknown) => { reportError(e, "Could not load your branches"); if (active) setLocations([]); });
    return () => { active = false; };
  }, []);

  const refreshAll = () => Promise.all([load(), refreshSharedLocations()]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setOpen(true);
  };

  const openEdit = (loc: Location) => {
    setEditing(loc);
    setForm({ name: loc.name, kind: loc.kind ?? "factory", city: loc.city || "", address: loc.address || "", phone: loc.phone || "", email: loc.email || "" });
    setError("");
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Give the branch a name");
    if (!form.kind) return setError("Choose whether this branch is a factory or a store");
    setSubmitting(true);
    try {
      await apiFetch(editing ? `/locations/${editing.id}` : "/locations", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({ ...form, name: form.name.trim() }),
      });
      setOpen(false);
      await refreshAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save the branch");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (loc: Location) => {
    const next = loc.status === "active" ? "inactive" : "active";
    if (next === "inactive" && !(await confirmAction({ title: `Deactivate ${loc.name}?`, description: "Its history is kept. Nobody can record anything there until you activate it again.", danger: true, confirmLabel: "Deactivate" }))) return;
    try {
      await apiFetch(`/locations/${loc.id}`, { method: "PUT", body: JSON.stringify({ status: next }) });
      await refreshAll();
    } catch (err) { reportError(err); }
  };

  const remove = async (loc: Location) => {
    if (!(await confirmAction({ title: `Delete ${loc.name}?`, description: "Only a branch with no records can be deleted.", danger: true, confirmLabel: "Delete" }))) return;
    try {
      await apiFetch(`/locations/${loc.id}`, { method: "DELETE" });
      await refreshAll();
    } catch (err) { reportError(err); }
  };

  const makeDefault = async (loc: Location) => {
    if (!(await confirmAction({ title: `Make ${loc.name} the main branch?`, confirmLabel: "Make main" }))) return;
    try {
      await apiFetch(`/locations/${loc.id}/set-default`, { method: "POST" });
      await refreshAll();
    } catch (err) { reportError(err); }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Branches"
        description="Your factories and stores. Factories make products; stores receive them and sell."
        actions={<Button onClick={openNew}><Plus size={16} /> Add branch</Button>}
      />

      {locations === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => <div key={i} className="h-36 animate-pulse rounded-[24px] bg-surface-muted" />)}
        </div>
      ) : locations.length === 0 ? (
        <Card><EmptyState icon={<Store size={22} />} title="No branches yet" description="Add the places where you make or sell your goods." action={<Button onClick={openNew}><Plus size={16} /> Add branch</Button>} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {locations.map((loc) => {
            const KindIcon = loc.kind === "store" ? Store : Factory;
            return (
              <div key={loc.id} className={cn("flex flex-col rounded-[24px] border border-border-soft bg-surface p-5 shadow-card", loc.status !== "active" && "opacity-70")}>
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-muted text-ink"><KindIcon size={20} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{loc.name}</p>
                    <p className="text-sm text-ink-soft">{loc.kind === "store" ? "Store" : "Factory"}{loc.city ? ` · ${loc.city}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {loc.isDefault && <Badge variant="info"><Star size={11} /> Main</Badge>}
                    {loc.status !== "active" && <Badge>Inactive</Badge>}
                  </div>
                </div>
                {(loc.address || loc.phone || loc.email) && (
                  <div className="mt-3 space-y-0.5 text-xs text-ink-soft">
                    {loc.address && <p>{loc.address}</p>}
                    <p className="flex flex-wrap gap-x-3">{loc.phone && <span>{loc.phone}</span>}{loc.email && <span>{loc.email}</span>}</p>
                  </div>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-border-soft pt-3 mt-4">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(loc)}><Pencil size={14} /> Edit</Button>
                  {!loc.isDefault && loc.status === "active" && (
                    <Button size="sm" variant="ghost" onClick={() => makeDefault(loc)}><Check size={14} /> Make main</Button>
                  )}
                  {!loc.isDefault && (
                    <Button size="sm" variant="ghost" onClick={() => toggleStatus(loc)}>{loc.status === "active" ? "Deactivate" : "Activate"}</Button>
                  )}
                  {!loc.isDefault && (
                    <Button size="sm" variant="ghost" className="ml-auto text-ink-soft hover:text-danger" onClick={() => remove(loc)} aria-label={`Delete ${loc.name}`}><Trash2 size={14} /></Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : "New branch"}
        description={editing ? undefined : "Is this a place that makes products, or one that only sells them?"}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="branch-form" isLoading={submitting}>{editing ? "Save changes" : "Create branch"}</Button>
          </>
        }
      >
        <form id="branch-form" onSubmit={submit} className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">Type of branch</legend>
            <div role="radiogroup" aria-label="Type of branch" className="grid gap-3 sm:grid-cols-2">
              {KINDS.map((k) => {
                const selected = form.kind === k.value;
                return (
                  <button
                    key={k.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setForm({ ...form, kind: k.value })}
                    className={cn(
                      "relative flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                      selected ? "border-charcoal bg-surface-muted shadow-card" : "border-border-soft hover:border-ink-faint"
                    )}
                  >
                    <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", selected ? "bg-charcoal text-ivory" : "bg-surface-muted text-ink")}><k.icon size={18} /></span>
                    <span className="font-semibold text-ink">{k.label}</span>
                    <span className="text-xs leading-relaxed text-ink-soft">{k.text}</span>
                    {selected && <Check size={16} className="absolute right-3 top-3 text-ink" />}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Field label="Name">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kano branch" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          </div>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Address"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </form>
      </Dialog>
    </div>
  );
}
