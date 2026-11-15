"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowRight, Plus, Trash2, Truck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import DataTable, { Column } from "@/components/ui/DataTable";
import NumericInput from "@/components/ui/NumericInput";
import { Field, Input, Select } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocation } from "@/hooks/useLocation";
import { useLocationVersion } from "@/hooks/useLocationRefetch";
import { useOpenOnQuery } from "@/hooks/useOpenOnQuery";
import { can } from "@/lib/permissions";
import { formatQty } from "@/lib/units";

interface Transfer {
  id: string;
  number: string;
  createdAt: string;
  notes: string | null;
  totalCost: number;
  fromLocation: { id: string; name: string };
  toLocation: { id: string; name: string };
  lines: { id: string; quantity: number; totalCost: number; product: { id: string; name: string; unit: string } }[];
}
interface Product { id: string; name: string; unit: string; quantity: number; itemType: string }
interface Line { productId: string; quantity: number }

export default function TransfersPage() {
  const { user } = useAuth();
  const { format } = useCurrency();
  const { locations, activeLocationId } = useLocation();
  const version = useLocationVersion();
  const canMove = can(user?.permissions, "inventory", "write");

  const [transfers, setTransfers] = useState<Transfer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: "", quantity: 0 }]);
  // Stock at the source location, tagged with that location so a change of
  // source always shows the right list (and "loading" until it arrives).
  const [stockFor, setStockFor] = useState<{ locationId: string; items: Product[] } | null>(null);
  const stock = stockFor && stockFor.locationId === fromId ? stockFor.items : null;
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Transfer[] }>("/stock-transfers")
      .then((r) => { if (active) { setTransfers(r.data); setError(null); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load transfers"); });
    return () => { active = false; };
  }, [version, key]);

  // Stock available at the source location.
  useEffect(() => {
    if (!open || !fromId) return;
    let active = true;
    apiFetch<{ success: boolean; data: Product[] }>(`/products?locationId=${fromId}`)
      .then((r) => { if (active) setStockFor({ locationId: fromId, items: r.data }); })
      .catch(() => { if (active) setStockFor({ locationId: fromId, items: [] }); });
    return () => { active = false; };
  }, [open, fromId]);

  const openNew = () => {
    const from = activeLocationId !== "all" ? activeLocationId : locations[0]?.id ?? "";
    setFromId(from);
    setToId(locations.find((l) => l.id !== from)?.id ?? "");
    setNotes("");
    setLines([{ productId: "", quantity: 0 }]);
    setFormError("");
    setOpen(true);
  };
  useOpenOnQuery("new", openNew);

  const byId = useMemo(() => new Map((stock ?? []).map((p) => [p.id, p])), [stock]);
  const inStock = (stock ?? []).filter((p) => p.quantity > 0);

  const save = async () => {
    setFormError("");
    const clean = lines.filter((l) => l.productId);
    if (!fromId || !toId) return setFormError("Choose both locations");
    if (fromId === toId) return setFormError("Choose two different locations");
    if (clean.length === 0) return setFormError("Add at least one item");
    for (const l of clean) {
      const p = byId.get(l.productId);
      if (!(l.quantity > 0)) return setFormError("Every item needs a quantity");
      if (p && l.quantity > p.quantity) return setFormError(`Only ${formatQty(p.quantity, p.unit)} of ${p.name} at the source location`);
    }
    setSaving(true);
    try {
      await apiFetch("/stock-transfers", { method: "POST", body: JSON.stringify({ fromLocationId: fromId, toLocationId: toId, notes: notes || undefined, items: clean }) });
      setOpen(false);
      setKey((k) => k + 1);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Could not move the stock");
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<Transfer>[] = [
    { key: "number", header: "Transfer", sortValue: (t) => t.number, cell: (t) => <span className="font-medium">{t.number}</span> },
    {
      key: "route", header: "From → to", sortValue: (t) => t.fromLocation.name,
      cell: (t) => <span className="inline-flex items-center gap-1.5">{t.fromLocation.name} <ArrowRight size={14} className="text-ink-faint" /> {t.toLocation.name}</span>,
    },
    { key: "items", header: "Items", hideBelow: "sm", cell: (t) => <span className="text-ink-soft">{t.lines.map((l) => `${formatQty(l.quantity, l.product.unit)} ${l.product.name}`).join(", ")}</span> },
    { key: "value", header: "Value at cost", align: "right", hideBelow: "md", sortValue: (t) => t.totalCost, cell: (t) => format(t.totalCost) },
    { key: "date", header: "Date", sortValue: (t) => new Date(t.createdAt), cell: (t) => <span className="text-ink-soft">{new Date(t.createdAt).toLocaleDateString()}</span> },
  ];

  const transferred = transfers?.find((t) => t.id === expanded);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock transfers"
        description="Move stock between your factory, stores and warehouses. Each batch keeps its cost and history, so stock value doesn't change."
        actions={canMove && locations.length > 1 ? <Button onClick={openNew}><Plus size={16} /> New transfer</Button> : undefined}
      />

      {locations.length < 2 && (
        <Card><CardContent className="py-5 text-sm">You have access to one location. Add another location in Settings (or ask an administrator for access) to move stock between them.</CardContent></Card>
      )}

      <DataTable
        rows={transfers}
        columns={columns}
        rowKey={(t) => t.id}
        searchText={(t) => `${t.number} ${t.fromLocation.name} ${t.toLocation.name} ${t.lines.map((l) => l.product.name).join(" ")}`}
        searchPlaceholder="Search transfer, location or item"
        error={error}
        onRetry={() => setKey((k) => k + 1)}
        onRowClick={(t) => setExpanded(t.id)}
        rowLabel={(t) => `Open ${t.number}`}
        empty={{ icon: <Truck size={22} />, title: "No transfers yet", description: "Stock moved between locations appears here." }}
      />

      <Dialog
        open={!!transferred}
        onClose={() => setExpanded(null)}
        title={transferred ? `${transferred.number}: ${transferred.fromLocation.name} → ${transferred.toLocation.name}` : ""}
        description={transferred ? `${new Date(transferred.createdAt).toLocaleString()}${transferred.notes ? ` · ${transferred.notes}` : ""}` : undefined}
        footer={<Button variant="outline" onClick={() => setExpanded(null)}>Close</Button>}
      >
        {transferred && (
          <div className="divide-y divide-border-soft text-sm">
            {transferred.lines.map((l) => (
              <div key={l.id} className="flex justify-between gap-3 py-2">
                <span>{l.product.name}</span>
                <span className="tabular-nums">{formatQty(l.quantity, l.product.unit)} <span className="text-ink-soft">· {format(l.totalCost)}</span></span>
              </div>
            ))}
            <div className="flex justify-between py-2 font-semibold"><span>Total at cost</span><span className="tabular-nums">{format(transferred.totalCost)}</span></div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New stock transfer"
        description="Stock leaves the first location oldest batch first and arrives at the second straight away."
        className="sm:max-w-xl"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} isLoading={saving}><Truck size={16} /> Move stock</Button></>}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <Select value={fromId} onChange={(e) => { if (e.target.value !== fromId) { setFromId(e.target.value); setLines([{ productId: "", quantity: 0 }]); } }}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="To">
            <Select value={toId} onChange={(e) => setToId(e.target.value)}>
              {locations.filter((l) => l.id !== fromId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Items</p>
          {lines.map((l, i) => {
            const p = byId.get(l.productId);
            const over = p && l.quantity > p.quantity;
            return (
              <Fragment key={i}>
                <div className="grid grid-cols-[1fr_8rem_2rem] items-center gap-2">
                  <Select value={l.productId} onChange={(e) => setLines((ls) => ls.map((x, idx) => (idx === i ? { ...x, productId: e.target.value } : x)))} aria-label="Item" disabled={!stock}>
                    <option value="">{stock ? (inStock.length ? "Choose item" : "Nothing in stock here") : "Loading stock…"}</option>
                    {inStock.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatQty(p.quantity, p.unit)})</option>)}
                  </Select>
                  <div className="relative">
                    <NumericInput value={l.quantity} onChange={(v) => setLines((ls) => ls.map((x, idx) => (idx === i ? { ...x, quantity: v } : x)))} className={`pr-10 text-right ${over ? "border-danger" : ""}`} aria-label="Quantity" />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-soft">{p?.unit ?? ""}</span>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} disabled={lines.length <= 1} aria-label="Remove item"><Trash2 size={15} /></Button>
                </div>
                {over && <p className="text-xs text-danger">Only {formatQty(p.quantity, p.unit)} here</p>}
              </Fragment>
            );
          })}
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { productId: "", quantity: 0 }])}><Plus size={14} /> Add item</Button>
        </div>
        <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional, e.g. driver or vehicle" /></Field>
        {formError && <p className="text-sm text-danger" role="alert">{formError}</p>}
      </Dialog>
    </div>
  );
}
