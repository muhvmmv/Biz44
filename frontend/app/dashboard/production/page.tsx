"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Factory, ClipboardList } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import DataTable, { Column } from "@/components/ui/DataTable";
import StatCard from "@/components/ui/StatCard";
import Tabs from "@/components/ui/Tabs";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocationVersion } from "@/hooks/useLocationRefetch";
import { formatQty } from "@/lib/units";

interface Order {
  id: string;
  number: string;
  status: "draft" | "in_progress" | "completed" | "cancelled";
  plannedQuantity: number;
  producedQuantity: number;
  unitCost: number;
  totalCost: number;
  yieldPercent: number | null;
  plannedDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  product: { id: string; name: string; unit: string };
  location: { name: string } | null;
}

interface Summary {
  completedOrders: number;
  inProgressOrders: number;
  draftOrders: number;
  wipValue: number;
  totalCost: number;
}

type Filter = "all" | Order["status"];

export default function ProductionOrdersPage() {
  const { format } = useCurrency();
  const router = useRouter();
  const version = useLocationVersion();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [key, setKey] = useState(0);

  useEffect(() => {
    let active = true;
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    Promise.all([
      apiFetch<{ success: boolean; data: Order[] }>("/production/orders"),
      apiFetch<{ success: boolean; data: Summary }>(`/production/summary?from=${monthStart}`),
    ])
      .then(([o, s]) => { if (active) { setOrders(o.data); setSummary(s.data); setError(null); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Something went wrong"); });
    return () => { active = false; };
  }, [version, key]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders?.length ?? 0 };
    for (const s of ["draft", "in_progress", "completed", "cancelled"]) c[s] = orders?.filter((o) => o.status === s).length ?? 0;
    return c;
  }, [orders]);
  const rows = orders ? orders.filter((o) => filter === "all" || o.status === filter) : null;

  const columns: Column<Order>[] = [
    { key: "number", header: "Order", sortValue: (o) => o.number, cell: (o) => <span className="font-medium">{o.number}</span> },
    { key: "product", header: "Product", sortValue: (o) => o.product.name, cell: (o) => o.product.name },
    { key: "planned", header: "Planned", align: "right", sortValue: (o) => o.plannedQuantity, cell: (o) => formatQty(o.plannedQuantity, o.product.unit) },
    {
      key: "produced", header: "Produced", align: "right", sortValue: (o) => o.producedQuantity,
      cell: (o) => (o.status === "completed" ? (
        <span>
          {formatQty(o.producedQuantity, o.product.unit)}
          {o.yieldPercent !== null && <span className="ml-1.5 text-xs text-ink-soft">{o.yieldPercent}%</span>}
        </span>
      ) : <span className="text-ink-faint">—</span>),
    },
    {
      key: "cost", header: "Cost", align: "right", hideBelow: "sm", sortValue: (o) => o.totalCost,
      cell: (o) => (o.status === "draft" || o.status === "cancelled" ? <span className="text-ink-faint">—</span> : (
        <span>
          {format(o.totalCost)}
          {o.status === "completed" && o.producedQuantity > 0 && <span className="block text-xs text-ink-soft">{format(o.unitCost)} / {o.product.unit}</span>}
        </span>
      )),
    },
    {
      key: "date", header: "Date", hideBelow: "md", sortValue: (o) => new Date(o.completedAt ?? o.startedAt ?? o.plannedDate ?? o.createdAt),
      cell: (o) => <span className="text-ink-soft">{new Date(o.completedAt ?? o.startedAt ?? o.plannedDate ?? o.createdAt).toLocaleDateString()}</span>,
    },
    { key: "status", header: "Status", sortValue: (o) => o.status, cell: (o) => <StatusBadge status={o.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production"
        description="Turn raw materials into finished goods. Materials move into work in progress when an order starts; finished goods enter stock at actual cost when it completes."
        actions={
          <>
            <ButtonLink href="/dashboard/production/boms" variant="outline"><ClipboardList size={16} /> Bills of materials</ButtonLink>
            <ButtonLink href="/dashboard/production/new"><Plus size={16} /> New production order</ButtonLink>
          </>
        }
      />

      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="In progress" value={summary.inProgressOrders} hint={`${summary.draftOrders} planned`} />
          <StatCard label="Work in progress value" value={format(summary.wipValue)} hint="Materials in running orders" />
          <StatCard label="Completed this month" value={summary.completedOrders} />
          <StatCard label="Production cost this month" value={format(summary.totalCost)} />
        </div>
      )}

      <Tabs
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All", count: counts.all },
          { value: "draft", label: "Planned", count: counts.draft },
          { value: "in_progress", label: "In progress", count: counts.in_progress },
          { value: "completed", label: "Completed", count: counts.completed },
          { value: "cancelled", label: "Cancelled", count: counts.cancelled },
        ]}
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(o) => o.id}
        searchText={(o) => `${o.number} ${o.product.name}`}
        searchPlaceholder="Search order or product"
        error={error}
        onRetry={() => setKey((k) => k + 1)}
        onRowClick={(o) => router.push(`/dashboard/production/${o.id}`)}
        rowLabel={(o) => `Open ${o.number}`}
        empty={{
          icon: <Factory size={22} />,
          title: "No production orders yet",
          description: "Create a bill of materials for a finished good, then plan a production run.",
          action: <ButtonLink href="/dashboard/production/new"><Plus size={16} /> New production order</ButtonLink>,
        }}
      />
    </div>
  );
}
