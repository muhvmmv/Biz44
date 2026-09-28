"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Plus, DollarSign, TrendingUp, Receipt } from "lucide-react";

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  amountPaid: number;
  createdAt: string;
  dueDate: string | null;
}

interface Payment {
  id: string;
  amount: number;
  method: string;
  paidAt: string;
  reference: string | null;
  invoiceNumber: string;
}

interface Data {
  customer: Customer;
  summary: { totalSales: number; totalPaid: number; outstanding: number; invoiceCount: number };
  invoices: Invoice[];
  payments: Payment[];
}

const statusVariant = (s: string): "success" | "warning" | "danger" | "info" | "default" => {
  if (s === "paid") return "success";
  if (s === "partially_paid") return "info";
  if (s === "overdue") return "danger";
  if (s === "unpaid") return "warning";
  return "default";
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "invoices" | "payments">("overview");

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Data }>(`/customers/${id}/summary`)
      .then((res) => { if (active) setData(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  if (loading) return <div className="p-8"><Skeleton className="h-96" /></div>;
  if (!data) return <div className="p-8 text-neutral-500">Customer not found.</div>;

  const { customer, summary, invoices, payments } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${customer.firstName} ${customer.lastName}`}
        description={`Customer since ${new Date(customer.createdAt).toLocaleDateString()}`}
        actions={
          <Link href={`/dashboard/invoices/new?customerId=${customer.id}`}>
            <Button>
              <Plus className="w-4 h-4 mr-1" /> New Invoice
            </Button>
          </Link>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-2 text-neutral-500 text-sm mb-1">
            <TrendingUp size={14} /> Total sales
          </div>
          <p className="text-2xl font-bold">${summary.totalSales.toFixed(2)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-2 text-neutral-500 text-sm mb-1">
            <DollarSign size={14} /> Total paid
          </div>
          <p className="text-2xl font-bold text-emerald-600">${summary.totalPaid.toFixed(2)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-2 text-neutral-500 text-sm mb-1">
            <Receipt size={14} /> Outstanding
          </div>
          <p className="text-2xl font-bold text-amber-600">${summary.outstanding.toFixed(2)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-2 text-neutral-500 text-sm mb-1">
            <Receipt size={14} /> Invoices
          </div>
          <p className="text-2xl font-bold">{summary.invoiceCount}</p>
        </CardContent></Card>
      </div>

      {/* Contact info */}
      <Card>
        <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-neutral-500">Email</p>
            <p className="font-medium">{customer.email || "—"}</p>
          </div>
          <div>
            <p className="text-neutral-500">Phone</p>
            <p className="font-medium">{customer.phone || "—"}</p>
          </div>
          <div>
            <p className="text-neutral-500">Address</p>
            <p className="font-medium">{customer.address || "—"}</p>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-neutral-200">
        {(["overview", "invoices", "payments"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Recent Invoices</CardTitle></CardHeader>
            <CardContent className="p-0">
              {invoices.slice(0, 5).map((inv) => (
                <Link key={inv.id} href={`/dashboard/invoices/${inv.id}`}
                  className="flex justify-between px-6 py-3 border-b last:border-0 hover:bg-neutral-50">
                  <div>
                    <p className="font-medium">{inv.invoiceNumber}</p>
                    <p className="text-xs text-neutral-500">
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">${inv.total.toFixed(2)}</p>
                    <Badge variant={statusVariant(inv.status)}>{inv.status}</Badge>
                  </div>
                </Link>
              ))}
              {invoices.length === 0 && (
                <p className="text-center text-neutral-400 py-8 text-sm">No invoices yet</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent Payments</CardTitle></CardHeader>
            <CardContent className="p-0">
              {payments.slice(0, 5).map((p) => (
                <div key={p.id} className="flex justify-between px-6 py-3 border-b last:border-0">
                  <div>
                    <p className="font-medium">${p.amount.toFixed(2)}</p>
                    <p className="text-xs text-neutral-500">{p.method} · {p.invoiceNumber}</p>
                  </div>
                  <p className="text-xs text-neutral-500">
                    {new Date(p.paidAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
              {payments.length === 0 && (
                <p className="text-center text-neutral-400 py-8 text-sm">No payments yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "invoices" && (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-left">
              <tr>
                <th className="px-6 py-3 font-medium">Invoice</th>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Due</th>
                <th className="px-6 py-3 font-medium text-right">Amount</th>
                <th className="px-6 py-3 font-medium text-right">Paid</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-neutral-50">
                  <td className="px-6 py-3">
                    <Link href={`/dashboard/invoices/${inv.id}`} className="font-medium text-brand-700 hover:underline">
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-neutral-600">{new Date(inv.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-3 text-neutral-600">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}</td>
                  <td className="px-6 py-3 text-right">${inv.total.toFixed(2)}</td>
                  <td className="px-6 py-3 text-right text-neutral-600">${inv.amountPaid.toFixed(2)}</td>
                  <td className="px-6 py-3"><Badge variant={statusVariant(inv.status)}>{inv.status}</Badge></td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={6} className="text-center text-neutral-400 py-8">No invoices yet</td></tr>
              )}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      {tab === "payments" && (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-left">
              <tr>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Invoice</th>
                <th className="px-6 py-3 font-medium">Method</th>
                <th className="px-6 py-3 font-medium">Reference</th>
                <th className="px-6 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-6 py-3 text-neutral-600">{new Date(p.paidAt).toLocaleDateString()}</td>
                  <td className="px-6 py-3 font-medium">{p.invoiceNumber}</td>
                  <td className="px-6 py-3"><Badge variant="info">{p.method}</Badge></td>
                  <td className="px-6 py-3 text-neutral-500">{p.reference || "—"}</td>
                  <td className="px-6 py-3 text-right font-medium text-emerald-600">+${p.amount.toFixed(2)}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={5} className="text-center text-neutral-400 py-8">No payments yet</td></tr>
              )}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  );
}