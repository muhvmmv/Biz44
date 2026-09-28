"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Plus, Pencil, Trash2, StickyNote, X } from "lucide-react";

interface Note {
  id: string;
  title: string;
  content: string;
  category: string;
  date: string;
}

const categories = [
  { value: "general", label: "General", variant: "default" as const },
  { value: "sales", label: "Sales", variant: "success" as const },
  { value: "inventory", label: "Inventory", variant: "warning" as const },
  { value: "finance", label: "Finance", variant: "info" as const },
];

export default function ReportNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState({
    title: "",
    content: "",
    category: "general",
    date: new Date().toISOString().split("T")[0],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    const url = filter ? `/report-notes?category=${filter}` : "/report-notes";
    apiFetch<{ success: boolean; data: Note[] }>(url)
      .then((res) => setNotes(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    const url = filter ? `/report-notes?category=${filter}` : "/report-notes";
    apiFetch<{ success: boolean; data: Note[] }>(url)
      .then((res) => { if (active) setNotes(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filter]);

  const openNew = () => {
    setEditing(null);
    setForm({
      title: "",
      content: "",
      category: "general",
      date: new Date().toISOString().split("T")[0],
    });
    setError("");
    setShowForm(true);
  };

  const openEdit = (note: Note) => {
    setEditing(note);
    setForm({
      title: note.title,
      content: note.content,
      category: note.category,
      date: note.date.split("T")[0],
    });
    setError("");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.title.trim() || !form.content.trim()) {
      setError("Title and content are required");
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await apiFetch(`/report-notes/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch("/report-notes", {
          method: "POST",
          body: JSON.stringify(form),
        });
      }
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    try {
      await apiFetch(`/report-notes/${id}`, { method: "DELETE" });
      load();
    } catch (err) { console.error(err); }
  };

  const variantFor = (cat: string) =>
    categories.find((c) => c.value === cat)?.variant || "default";

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <StickyNote className="w-5 h-5 text-brand-600" />
            Report Notes
          </CardTitle>
          <p className="text-sm text-neutral-500 mt-1">
            Log explanations, exceptions, or one-off events (e.g. damaged stock, sales spike).
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" /> Add Note
        </Button>
      </CardHeader>
      <CardContent>
        {/* Filter chips */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setFilter("")}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
              filter === ""
                ? "bg-brand-600 text-white border-brand-600"
                : "border-neutral-200 text-neutral-600 hover:border-brand-300"
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.value}
              onClick={() => setFilter(c.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                filter === c.value
                  ? "bg-brand-600 text-white border-brand-600"
                  : "border-neutral-200 text-neutral-600 hover:border-brand-300"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-center text-neutral-400 py-8 text-sm">Loading…</p>
        ) : notes.length === 0 ? (
          <div className="text-center py-10 text-neutral-400">
            <StickyNote className="w-10 h-10 mx-auto mb-2 text-neutral-300" />
            <p className="text-sm">No notes yet.</p>
            <p className="text-xs mt-1">
              Add a note to explain anomalies like damaged stock or rejected sales.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div
                key={note.id}
                className="border border-neutral-200 rounded-lg p-4 hover:border-brand-300 transition group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="font-semibold text-neutral-900">{note.title}</h4>
                      <Badge variant={variantFor(note.category)}>{note.category}</Badge>
                    </div>
                    <p className="text-xs text-neutral-500 mb-2">
                      {new Date(note.date).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                    <p className="text-sm text-neutral-600 whitespace-pre-wrap">
                      {note.content}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(note)}
                      className="p-1.5 text-neutral-400 hover:text-brand-600 transition"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(note.id)}
                      className="p-1.5 text-neutral-400 hover:text-red-600 transition"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {editing ? "Edit Note" : "Add Report Note"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 text-neutral-400 hover:text-neutral-700"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. 5 units rejected due to damage"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Note *</label>
                <textarea
                  rows={5}
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder="Describe what happened and why it matters..."
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={submitting}>
                  {editing ? "Update" : "Save Note"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
}