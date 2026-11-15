"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, FileText, Users, Truck, Package, Plus, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { allPages } from "@/lib/navigation";
import { QUICK_ACTIONS } from "./quickActions";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface Result {
  id: string;
  group: string;
  label: string;
  hint?: string;
  href: string;
  icon: React.ReactNode;
}

interface Data {
  customers: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null }[];
  suppliers: { id: string; name: string; phone: string | null }[];
  products: { id: string; name: string; sku: string | null }[];
  invoices: { id: string; invoiceNumber: string; status: string; customer?: { firstName: string; lastName: string } | null; customerName?: string | null }[];
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD");

/**
 * Global search (⌘K / Ctrl+K / "/"): pages, quick actions, and the
 * company's customers, suppliers, products and invoices. Records are loaded
 * once when the palette first opens and filtered as you type.
 */
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    if (!data && !loadingData) {
      setTimeout(() => setLoadingData(true), 0);
      const get = <T,>(path: string) =>
        apiFetch<{ success: boolean; data: T }>(path).then((r) => r.data).catch(() => [] as unknown as T);
      Promise.all([
        get<Data["customers"]>("/customers"),
        get<Data["suppliers"]>("/suppliers"),
        get<Data["products"]>("/products"),
        get<Data["invoices"]>("/invoices"),
      ])
        .then(([customers, suppliers, products, invoices]) => setData({ customers, suppliers, products, invoices }))
        .finally(() => setLoadingData(false));
    }
    return () => clearTimeout(t);
  }, [open, data, loadingData]);

  const results = useMemo<Result[]>(() => {
    const q = norm(query.trim());
    // Records match anywhere; pages and actions match at the start of a word,
    // so "ay" finds "Ayesha" rather than "Payables".
    const match = (...fields: (string | null | undefined)[]) => !q || fields.some((f) => f && norm(f).includes(q));
    const wordMatch = (...fields: (string | null | undefined)[]) =>
      !q || fields.some((f) => f && norm(f).split(/[\s›&/-]+/).some((w) => w.startsWith(q)));
    const out: Result[] = [];

    QUICK_ACTIONS.filter((a) => can(user?.permissions, a.area, "write") && wordMatch(a.label, ...(a.keywords ?? []))).forEach((a) =>
      out.push({ id: `action:${a.href}`, group: "Actions", label: a.label, href: a.href, icon: <Plus size={16} /> })
    );
    allPages(user?.permissions)
      .filter((p) => wordMatch(p.leaf?.name ?? p.item.name, p.item.name, ...(p.leaf?.keywords ?? p.item.keywords ?? [])))
      .slice(0, q ? 8 : 6)
      .forEach((p) =>
        out.push({
          id: `page:${p.href}`,
          group: "Pages",
          label: p.leaf ? `${p.item.name} › ${p.leaf.name}` : p.item.name,
          hint: p.section,
          href: p.href,
          icon: <ArrowRight size={16} />,
        })
      );

    if (q && data) {
      data.invoices
        .filter((i) => match(i.invoiceNumber, i.customerName, i.customer && `${i.customer.firstName} ${i.customer.lastName}`))
        .slice(0, 5)
        .forEach((i) =>
          out.push({
            id: `inv:${i.id}`, group: "Invoices", label: i.invoiceNumber,
            hint: i.customer ? `${i.customer.firstName} ${i.customer.lastName}` : i.customerName ?? undefined,
            href: `/dashboard/invoices/${i.id}`, icon: <FileText size={16} />,
          })
        );
      data.customers
        .filter((c) => match(`${c.firstName} ${c.lastName}`, c.email, c.phone))
        .slice(0, 5)
        .forEach((c) =>
          out.push({ id: `cus:${c.id}`, group: "Customers", label: `${c.firstName} ${c.lastName}`, hint: c.phone ?? c.email ?? undefined, href: `/dashboard/customers/${c.id}`, icon: <Users size={16} /> })
        );
      data.suppliers
        .filter((s) => match(s.name, s.phone))
        .slice(0, 5)
        .forEach((s) => out.push({ id: `sup:${s.id}`, group: "Suppliers", label: s.name, hint: s.phone ?? undefined, href: `/dashboard/suppliers/${s.id}`, icon: <Truck size={16} /> }));
      data.products
        .filter((p) => match(p.name, p.sku))
        .slice(0, 5)
        .forEach((p) => out.push({ id: `pro:${p.id}`, group: "Products", label: p.name, hint: p.sku ?? undefined, href: `/dashboard/inventory/products/${p.id}`, icon: <Package size={16} /> }));
    }
    return out;
  }, [query, data, user?.permissions]);

  const go = (r: Result | undefined) => {
    if (!r) return;
    onClose();
    setQuery("");
    setCursor(0);
    router.push(r.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(results[cursor]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  // Keep the highlighted row in view.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  let index = -1;
  const groups = Array.from(new Set(results.map((r) => r.group)));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="Search" className="w-full max-w-xl overflow-hidden rounded-2xl border border-border-soft bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-border-soft px-4">
          <Search size={18} className="text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search pages, invoices, customers, products…"
            aria-label="Search"
            aria-controls="palette-results"
            aria-activedescendant={results[cursor] ? `palette-${results[cursor].id}` : undefined}
            className="h-14 flex-1 bg-transparent text-base text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-none"
          />
          <kbd className="hidden rounded-md border border-border-soft px-1.5 py-0.5 text-[11px] text-ink-soft sm:block">Esc</kbd>
        </div>
        <div ref={listRef} id="palette-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-ink-soft">
              {loadingData ? "Loading…" : `No results for "${query}"`}
            </p>
          ) : (
            groups.map((g) => (
              <div key={g} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{g}</p>
                {results.filter((r) => r.group === g).map((r) => {
                  index += 1;
                  const i = index;
                  const active = i === cursor;
                  return (
                    <button
                      key={r.id}
                      id={`palette-${r.id}`}
                      role="option"
                      aria-selected={active}
                      data-index={i}
                      onMouseMove={() => setCursor(i)}
                      onClick={() => go(r)}
                      className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm", active ? "bg-brand-light text-brand-dark" : "text-ink")}
                    >
                      <span className={cn("shrink-0", active ? "text-brand" : "text-ink-soft")}>{r.icon}</span>
                      <span className="flex-1 truncate">{r.label}</span>
                      {r.hint && <span className="truncate text-xs text-ink-soft">{r.hint}</span>}
                      {active && <CornerDownLeft size={14} className="shrink-0 text-brand" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-4 border-t border-border-soft bg-surface-muted px-4 py-2 text-[11px] text-ink-soft">
          <span><kbd className="font-sans">↑↓</kbd> move</span>
          <span><kbd className="font-sans">Enter</kbd> open</span>
          <span><kbd className="font-sans">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
