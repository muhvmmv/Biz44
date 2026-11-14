"use client";

import { ReactNode, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import Button from "./Button";
import EmptyState from "./EmptyState";
import Skeleton from "./Skeleton";
import { controlClasses } from "./Input";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => string | number | Date | null | undefined;
  /** Right-align numbers and money. */
  align?: "left" | "right" | "center";
  /** Hide on small screens. */
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
  headerClassName?: string;
}

const HIDE: Record<string, string> = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };
const ALIGN: Record<string, string> = { left: "text-left", right: "text-right tabular-nums", center: "text-center" };

interface DataTableProps<T> {
  /** null while loading. */
  rows: T[] | null;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Text to search in; enables the search box. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  /** Extra controls (filters, tabs) shown beside the search box. */
  toolbar?: ReactNode;
  initialSort?: { key: string; dir: "asc" | "desc" };
  pageSize?: number;
  /** Shown when there are no rows at all. */
  empty?: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode };
  error?: string | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  /** Row label for screen readers when rows are clickable. */
  rowLabel?: (row: T) => string;
  className?: string;
}

/**
 * The standard Biz44 table: search, sorting, pagination, loading / empty /
 * error states, right-aligned numbers, clickable rows, responsive columns.
 * Sorting and search run on the rows already loaded.
 */
export default function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchText,
  searchPlaceholder = "Search…",
  toolbar,
  initialSort,
  pageSize = 20,
  empty,
  error,
  onRetry,
  onRowClick,
  rowLabel,
  className,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    let out = q && searchText ? rows.filter((r) => searchText(r).toLowerCase().includes(q)) : rows.slice();
    const col = sort && columns.find((c) => c.key === sort.key);
    if (col?.sortValue) {
      const dir = sort!.dir === "asc" ? 1 : -1;
      out = out.sort((a, b) => {
        const av = col.sortValue!(a);
        const bv = col.sortValue!(b);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const x = av instanceof Date ? av.getTime() : av;
        const y = bv instanceof Date ? bv.getTime() : bv;
        if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
        return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" }) * dir;
      });
    }
    return out;
  }, [rows, query, searchText, sort, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

  const toggleSort = (key: string) => {
    setPage(1);
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  };

  const showToolbar = !!searchText || !!toolbar;

  return (
    <div className={cn("rounded-2xl border border-border-soft bg-surface shadow-card", className)}>
      {showToolbar && (
        <div className="flex flex-col gap-3 border-b border-border-soft p-4 sm:flex-row sm:items-center">
          {searchText && (
            <div className="relative sm:w-72">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="search"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className={cn(controlClasses, "h-10 pl-9")}
              />
            </div>
          )}
          {toolbar && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{toolbar}</div>}
        </div>
      )}

      {error ? (
        <EmptyState tone="error" title="Couldn't load this list" description={error} action={onRetry && <Button variant="outline" onClick={onRetry}>Try again</Button>} />
      ) : rows === null ? (
        <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={empty?.title ?? "Nothing here yet"} description={empty?.description} action={empty?.action} icon={empty?.icon} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" description={`Nothing matches "${query}".`} action={<Button variant="outline" onClick={() => setQuery("")}>Clear search</Button>} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-soft bg-surface-muted">
                  {columns.map((c) => {
                    const active = sort?.key === c.key;
                    const ariaSort = active ? (sort!.dir === "asc" ? "ascending" : "descending") : c.sortValue ? "none" : undefined;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={ariaSort}
                        className={cn("px-4 py-3 text-xs font-medium uppercase tracking-wide text-ink-soft", ALIGN[c.align ?? "left"], c.hideBelow && HIDE[c.hideBelow], c.headerClassName)}
                      >
                        {c.sortValue ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key)}
                            className={cn("inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink focus-visible:outline-none focus-visible:text-ink", active && "text-ink", c.align === "right" && "flex-row-reverse")}
                          >
                            {c.header}
                            {active ? (sort!.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-40" />}
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {visible.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(row); } : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}
                    className={cn("transition-colors", onRowClick && "cursor-pointer hover:bg-surface-muted focus-visible:outline-none focus-visible:bg-brand-light/40")}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn("px-4 py-3 text-ink", ALIGN[c.align ?? "left"], c.hideBelow && HIDE[c.hideBelow], c.className)}>
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border-soft px-4 py-3 text-sm text-ink-soft">
            <span className="tabular-nums">
              {filtered.length === 0 ? 0 : (current - 1) * pageSize + 1}–{Math.min(current * pageSize, filtered.length)} of {filtered.length}
              {filtered.length !== rows.length && <span> (filtered from {rows.length})</span>}
            </span>
            {pages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => setPage(current - 1)} disabled={current <= 1} aria-label="Previous page">
                  <ChevronLeft size={16} />
                </Button>
                <span className="px-2 tabular-nums">{current} / {pages}</span>
                <Button variant="ghost" size="icon-sm" onClick={() => setPage(current + 1)} disabled={current >= pages} aria-label="Next page">
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
