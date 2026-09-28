"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import { Plus, Receipt } from "lucide-react";

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  amountPaid: number;
  dueDate: string | null;
  createdAt: string;
  customer: { firstName: string; lastName: string } | null;
}

const statusVariant = (status: string): "success" | "warning" | "danger" | "info" | "default" => {
  switch (status) {
    case "paid": return "success";
    case "partially_paid": return "info";
    case "overdue": return "danger";
    case "unpaid": return "warning";
    case "cancelled": return "default";
    default: return "default";
  }
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Invoice[] }>("/invoices")
      .then((res) => { if (active) setInvoices(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      (inv.customer && `${inv.customer.firstName} ${inv.customer.lastName}`.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Manage your sales invoices and payments."
        actions={
          <Link href="/dashboard/invoices/new">
            <Button>
              <Plus className="w-4 h-4 mr-1" />
              New Invoice
            </Button>
          </Link>
        }
      />

      <input
        type="text"
        placeholder="Search by invoice number or customer..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:w-80 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-neutral-400">
              <Receipt className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
              <p>No invoices yet.</p>
              <Link href="/dashboard/invoices/new">
                <Button className="mt-4">Create your first invoice</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-500 text-left">
                  <tr>
                    <th className="px-6 py-3 font-medium">Invoice</th>
                    <th className="px-6 py-3 font-medium">Customer</th>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Due</th>
                    <th className="px-6 py-3 font-medium text-right">Amount</th>
                    <th className="px-6 py-3 font-medium text-right">Paid</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filtered.map((inv) => (
                    <tr key={inv.id} className="hover:bg-neutral-50">
                      <td className="px-6 py-4">
                        <Link
                          href={`/dashboard/invoices/${inv.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-neutral-700">
                        {inv.customer ? `${inv.customer.firstName} ${inv.customer.lastName}` : "—"}
                      </td>
                      <td className="px-6 py-4 text-neutral-600">
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-neutral-600">
                        {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-6 py-4 text-right font-medium">
                        ${inv.total.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right text-neutral-600">
                        ${inv.amountPaid.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={statusVariant(inv.status)}>
                          {inv.status.replace("_", " ")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}