"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ClipboardList } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import DataTable, { Column } from "@/components/ui/DataTable";
import { useCurrency } from "@/hooks/useCurrency";
import { formatQty } from "@/lib/units";

interface Bom {
  id: string;
  outputQuantity: number;
  estimatedUnitCost: number;
  updatedAt: string;
  product: { id: string; name: string; unit: string; price: number };
  lines: { id: string; component: { name: string } }[];
}

export default function BomsPage() {
  const { format } = useCurrency();
  const router = useRouter();
  const [boms, setBoms] = useState<Bom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Bom[] }>("/production/boms")
      .then((r) => { if (active) { setBoms(r.data); setError(null); } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Something went wrong"); });
    return () => { active = false; };
  }, [key]);

  const columns: Column<Bom>[] = [
    { key: "product", header: "Finished good", sortValue: (b) => b.product.name, cell: (b) => <span className="font-medium">{b.product.name}</span> },
    { key: "batch", header: "Makes", align: "right", sortValue: (b) => b.outputQuantity, cell: (b) => formatQty(b.outputQuantity, b.product.unit) },
    {
      key: "materials", header: "Materials", hideBelow: "md",
      cell: (b) => <span className="text-ink-soft">{b.lines.map((l) => l.component.name).join(", ")}</span>,
    },
    { key: "cost", header: "Est. cost / unit", align: "right", sortValue: (b) => b.estimatedUnitCost, cell: (b) => format(b.estimatedUnitCost) },
    {
      key: "margin", header: "Est. margin", align: "right", hideBelow: "sm",
      sortValue: (b) => (b.product.price > 0 ? (b.product.price - b.estimatedUnitCost) / b.product.price : -1),
      cell: (b) => {
        if (!b.product.price) return <span className="text-ink-faint">—</span>;
        const m = ((b.product.price - b.estimatedUnitCost) / b.product.price) * 100;
        return <span className={m >= 0 ? "text-success" : "text-danger"}>{m.toFixed(1)}%</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bills of materials"
        description="What each finished good is made from. Production orders take their material requirements from here."
        actions={<ButtonLink href="/dashboard/production/boms/new"><Plus size={16} /> New bill of materials</ButtonLink>}
      />
      <DataTable
        rows={boms}
        columns={columns}
        rowKey={(b) => b.id}
        searchText={(b) => `${b.product.name} ${b.lines.map((l) => l.component.name).join(" ")}`}
        searchPlaceholder="Search product or material"
        initialSort={{ key: "product", dir: "asc" }}
        error={error}
        onRetry={() => setKey((k) => k + 1)}
        onRowClick={(b) => router.push(`/dashboard/production/boms/${b.id}`)}
        rowLabel={(b) => `Edit bill of materials for ${b.product.name}`}
        empty={{
          icon: <ClipboardList size={22} />,
          title: "No bills of materials yet",
          description: "Create one for each finished good: the raw materials and packaging it uses, and in what quantities.",
          action: <ButtonLink href="/dashboard/production/boms/new"><Plus size={16} /> New bill of materials</ButtonLink>,
        }}
      />
    </div>
  );
}
