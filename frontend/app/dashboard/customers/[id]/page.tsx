"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { reportError } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Plus, DollarSign, TrendingUp, Receipt, FileText } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

interface Customer {
  id: string; firstName: string; lastName: string;
  email: string | null; phone: string | null; address: string | null;
  createdAt: string;
}
interface Invoice {
  id: string; invoiceNumber: string; status: string;
  total: number; amountPaid: number; createdAt: string; dueDate: string | null;
}
interface Payment {
  id: string; amount: number; method: string;
  paidAt: string; reference: string | null; invoiceNumber: string;
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
  const { format } = useCurrency();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "invoices" | "payments">("overview");

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Data }>(`/customers/${id}/summary`)
      .then((res) => { if (active) setData(res.data); })
      .catch((e: unknown) => reportError(e, "Could not load this page"))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  if (loading) return <div className="p-8"><Skeleton className="h-96" /></div>;
  if (!data) return <div className="p-8 text-ink-soft">Customer not found.</div>;

  const { customer, summary, invoices, payments } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${customer.firstName} ${customer.lastName}`}
        description={`Customer since ${new Date(customer.createdAt).toLocaleDateString()}`}
        actions={
          <>
            <ButtonLink href={`/dashboard/customers/${customer.id}/statement`} variant="outline"><FileText size={16} /> Statement</ButtonLink>
            <ButtonLink href={`/dashboard/invoices/new?customerId=${customer.id}`}><Plus size={16} /> New Invoice</ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-2 text-ink-soft text-sm mb-1"><TrendingUp size={14} /> Total sales</div>
          <p className="text-2xl font-bold text-ink">{format(summary.totalSales)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-2 text-ink-soft text-sm mb-1"><DollarSign size={14} /> Total paid</div>
          <p className="text-2xl font-bold text-success">{format(summary.totalPaid)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-2 text-ink-soft text-sm mb-1"><Receipt size={14} /> Outstanding</div>
          <p className="text-2xl font-bold text-warning">{format(summary.outstanding)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-2 text-ink-soft text-sm mb-1"><Receipt size={14} /> Invoices</div>
          <p className="text-2xl font-bold text-ink">{summary.invoiceCount}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4 text-sm">
          <div><p className="text-ink-soft">Email</p><p className="font-medium text-ink">{customer.email || "—"}</p></div>
          <div><p className="text-ink-soft">Phone</p><p className="font-medium text-ink">{customer.phone || "—"}</p></div>
          <div><p className="text-ink-soft">Address</p><p className="font-medium text-ink">{customer.address || "—"}</p></div>
        </CardContent>
      </Card>

      <div className="flex gap-2 border-b border-border-soft">
        {(["overview", "invoices", "payments"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t ? "border-brand text-brand-dark" : "border-transparent text-ink-soft hover:text-charcoal"
            }`}>
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
                  className="flex justify-between px-6 py-3 border-b border-border-soft last:border-0 hover:bg-ivory">
                  <div>
                    <p className="font-medium text-ink">{inv.invoiceNumber}</p>
                    <p className="text-xs text-ink-soft">{new Date(inv.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-ink">{format(inv.total)}</p>
                    <Badge variant={statusVariant(inv.status)}>{inv.status}</Badge>
                  </div>
                </Link>
              ))}
              {invoices.length === 0 && <p className="text-center text-ink-soft py-8 text-sm">No invoices yet</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent Payments</CardTitle></CardHeader>
            <CardContent className="p-0">
              {payments.slice(0, 5).map((p) => (
                <div key={p.id} className="flex justify-between px-6 py-3 border-b border-border-soft last:border-0">
                  <div>
                    <p className="font-medium text-ink">{format(p.amount)}</p>
                    <p className="text-xs text-ink-soft">{p.method} · {p.invoiceNumber}</p>
                  </div>
                  <p className="text-xs text-ink-soft">{new Date(p.paidAt).toLocaleDateString()}</p>
                </div>
              ))}
              {payments.length === 0 && <p className="text-center text-ink-soft py-8 text-sm">No payments yet</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "invoices" && (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-ivory text-ink-soft text-left">
              <tr>
                <th className="px-6 py-3 font-medium">Invoice</th>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Due</th>
                <th className="px-6 py-3 font-medium text-right">Amount</th>
                <th className="px-6 py-3 font-medium text-right">Paid</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-ivory">
                  <td className="px-6 py-3">
                    <Link href={`/dashboard/invoices/${inv.id}`} className="font-medium text-brand-dark hover:underline">
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-ink-soft">{new Date(inv.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-3 text-ink-soft">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}</td>
                  <td className="px-6 py-3 text-right text-ink">{format(inv.total)}</td>
                  <td className="px-6 py-3 text-right text-ink-soft">{format(inv.amountPaid)}</td>
                  <td className="px-6 py-3"><Badge variant={statusVariant(inv.status)}>{inv.status}</Badge></td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={6} className="text-center text-ink-soft py-8">No invoices yet</td></tr>
              )}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      {tab === "payments" && (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-ivory text-ink-soft text-left">
              <tr>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Invoice</th>
                <th className="px-6 py-3 font-medium">Method</th>
                <th className="px-6 py-3 font-medium">Reference</th>
                <th className="px-6 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-6 py-3 text-ink-soft">{new Date(p.paidAt).toLocaleDateString()}</td>
                  <td className="px-6 py-3 font-medium text-ink">{p.invoiceNumber}</td>
                  <td className="px-6 py-3"><Badge variant="info">{p.method}</Badge></td>
                  <td className="px-6 py-3 text-ink-soft">{p.reference || "—"}</td>
                  <td className="px-6 py-3 text-right font-medium text-success">+{format(p.amount)}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={5} className="text-center text-ink-soft py-8">No payments yet</td></tr>
              )}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  );
}