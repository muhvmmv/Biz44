"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent } from "@/components/ui/Card";
import { Wallet, Landmark, TrendingUp, Package, CreditCard } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

interface Account {
  id: string; name: string; type: string; balance: number;
}

const iconFor = (name: string) => {
  if (name.toLowerCase().includes("cash")) return Wallet;
  if (name.toLowerCase().includes("bank")) return Landmark;
  if (name.toLowerCase().includes("receivable")) return TrendingUp;
  if (name.toLowerCase().includes("inventory")) return Package;
  if (name.toLowerCase().includes("payable")) return CreditCard;
  return Wallet;
};

export default function AccountsPage() {
  const { format } = useCurrency();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Account[] }>("/accounting/accounts")
      .then((res) => { if (active) setAccounts(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const assetAccounts = accounts.filter((a) => a.type === "asset");
  const liabilityAccounts = accounts.filter((a) => a.type === "liability");
  const totalAssets = assetAccounts.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilityAccounts.reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Cash & Banks" description="Your financial account balances." />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card><CardContent className="p-5">
              <p className="text-sm text-ink-soft">Total Assets</p>
              <p className="text-2xl font-bold mt-1 text-ink">{format(totalAssets)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-ink-soft">Total Liabilities</p>
              <p className="text-2xl font-bold mt-1 text-ink">{format(totalLiabilities)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-ink-soft">Net Position</p>
              <p className="text-2xl font-bold mt-1 text-ink">{format(totalAssets - totalLiabilities)}</p>
            </CardContent></Card>
          </div>

          <div>
            <h3 className="font-semibold text-navy mb-3">Assets</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {assetAccounts.map((a) => {
                const Icon = iconFor(a.name);
                return (
                  <Card key={a.id}>
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-rose-light text-rose-vale flex items-center justify-center">
                        <Icon size={22} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-ink-soft">{a.name}</p>
                        <p className="text-xl font-bold text-ink">{format(a.balance)}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {liabilityAccounts.length > 0 && (
            <div>
              <h3 className="font-semibold text-navy mb-3">Liabilities</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {liabilityAccounts.map((a) => {
                  const Icon = iconFor(a.name);
                  return (
                    <Card key={a.id}>
                      <CardContent className="p-5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-[#F4E2E1] text-danger flex items-center justify-center">
                          <Icon size={22} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-ink-soft">{a.name}</p>
                          <p className="text-xl font-bold text-ink">{format(a.balance)}</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}