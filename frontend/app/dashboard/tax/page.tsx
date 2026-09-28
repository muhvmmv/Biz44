"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import { ScrollText, AlertTriangle } from "lucide-react";

interface Invoice {
  total: number;
  taxTotal: number;
  status: string;
  finalizedAt: string | null;
}

export default function TaxPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [taxRate, setTaxRate] = useState(7.5);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Invoice[] }>("/invoices")
      .then((res) => { if (active) setInvoices(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const finalized = invoices.filter((i) => i.finalizedAt);
  const taxableSales = finalized.reduce((s, i) => s + i.total, 0);
  const taxCollected = taxableSales * (taxRate / 100);

  const thisMonth = finalized.filter((i) => {
    if (!i.finalizedAt) return false;
    const d = new Date(i.finalizedAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const thisMonthSales = thisMonth.reduce((s, i) => s + i.total, 0);
  const thisMonthTax = thisMonthSales * (taxRate / 100);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax"
        description="Configure tax rates and view tax reports."
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="p-5">
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Tax Rate (%)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
                className="w-full sm:w-40 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-neutral-500 mt-2">
                Applied to finalized invoices. Configure per-country tax rules in Settings.
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardContent className="p-5">
              <p className="text-sm text-neutral-500">Taxable Sales</p>
              <p className="text-2xl font-bold mt-1">${taxableSales.toLocaleString()}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-neutral-500">Tax Collected</p>
              <p className="text-2xl font-bold mt-1 text-brand-600">${taxCollected.toFixed(2)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-neutral-500">This Month</p>
              <p className="text-2xl font-bold mt-1">${thisMonthTax.toFixed(2)}</p>
              <p className="text-xs text-neutral-500 mt-1">on ${thisMonthSales.toFixed(2)}</p>
            </CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-5 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Tax compliance reminder</p>
                <p className="text-sm text-neutral-500 mt-1">
                  Biz44 helps you track and estimate taxes. Always confirm rates and filing
                  requirements with your local tax authority or accountant.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}