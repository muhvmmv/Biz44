"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Plus, MapPin, Pencil, Trash2, Check, X } from "lucide-react";
import { useLocation } from "@/hooks/useLocation";

interface Location {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  isDefault: boolean;
}

const emptyForm = { name: "", city: "", address: "", phone: "", email: "" };

export default function LocationsSettingsPage() {
  const { refresh: refreshSharedLocations } = useLocation();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
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
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  };

  const openEdit = (loc: Location) => {
    setEditing(loc);
    setForm({
      name: loc.name,
      city: loc.city || "",
      address: loc.address || "",
      phone: loc.phone || "",
      email: loc.email || "",
    });
    setError("");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await apiFetch(`/locations/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch("/locations", {
          method: "POST",
          body: JSON.stringify(form),
        });
      }
      setShowForm(false);

      // Refresh both the local list AND the shared header dropdown state
      await Promise.all([load(), refreshSharedLocations()]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (loc: Location) => {
    const newStatus = loc.status === "active" ? "inactive" : "active";
    if (newStatus === "inactive" && !confirm(`Deactivate "${loc.name}"?`)) return;
    try {
      await apiFetch(`/locations/${loc.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      await Promise.all([load(), refreshSharedLocations()]);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleDelete = async (loc: Location) => {
    if (!confirm(`Delete "${loc.name}" permanently?`)) return;
    try {
      await apiFetch(`/locations/${loc.id}`, { method: "DELETE" });
      await Promise.all([load(), refreshSharedLocations()]);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const setAsDefault = async (loc: Location) => {
    if (!confirm(`Make "${loc.name}" the default branch?`)) return;
    try {
      await apiFetch(`/locations/${loc.id}/set-default`, { method: "POST" });
      await Promise.all([load(), refreshSharedLocations()]);
    } catch (err) { console.error(err); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Branches / Locations"
        description="Manage your business locations."
        actions={
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> Add Branch
          </Button>
        }
      />

      {loading ? (
        <p className="text-center text-ink-soft py-8">Loading...</p>
      ) : (
        <div className="space-y-3">
          {locations.map((loc) => (
            <Card key={loc.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-rose-light text-rose-vale flex items-center justify-center shrink-0">
                      <MapPin size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-ink">{loc.name}</p>
                        <Badge variant={loc.status === "active" ? "success" : "default"}>
                          {loc.status}
                        </Badge>
                        {loc.isDefault && <Badge variant="info">Default</Badge>}
                      </div>
                      {loc.city && <p className="text-sm text-ink-soft mt-0.5">{loc.city}</p>}
                      {loc.address && <p className="text-xs text-ink-soft">{loc.address}</p>}
                      <div className="flex gap-4 mt-1 text-xs text-ink-soft flex-wrap">
                        {loc.phone && <span>{loc.phone}</span>}
                        {loc.email && <span>{loc.email}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!loc.isDefault && loc.status === "active" && (
                      <button onClick={() => setAsDefault(loc)} className="p-2 text-ink-soft hover:text-navy" title="Set as default">
                        <Check size={16} />
                      </button>
                    )}
                    <button onClick={() => openEdit(loc)} className="p-2 text-ink-soft hover:text-rose-vale" title="Edit">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => toggleStatus(loc)} className="px-2 py-1 text-xs font-medium text-ink-soft hover:text-navy">
                      {loc.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => handleDelete(loc)}
                      disabled={loc.isDefault}
                      className={`p-2 ${loc.isDefault ? "text-ink-soft opacity-30 cursor-not-allowed" : "text-ink-soft hover:text-danger"}`}
                      title={loc.isDefault ? "Cannot delete the default branch" : "Delete"}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {locations.length === 0 && (
            <p className="text-ink-soft text-center py-8">No branches yet.</p>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-border-soft">
            <div className="p-6 border-b border-border-soft flex items-center justify-between">
              <h2 className="text-lg font-bold text-navy">
                {editing ? "Edit Branch" : "New Branch"}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 text-ink-soft hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-navy">Name *</label>
                <input required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Lagos Branch"
                  className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rose-vale" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-navy">City</label>
                  <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rose-vale" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-navy">Phone</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rose-vale" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-navy">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rose-vale" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-navy">Address</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rose-vale" />
              </div>
              {error && <p className="text-danger text-sm">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" isLoading={submitting}>
                  {editing ? "Save Changes" : "Create Branch"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}