"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useCurrency } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";

export interface PaymentAccount {
  id: string;
  name: string;
  balance: number;
}

interface PaymentAccountSelectProps {
  value: string;
  onChange: (accountId: string) => void;
  className?: string;
  id?: string;
  /** Show each account's current balance next to its name. */
  showBalance?: boolean;
}

/**
 * Picks the cash or bank account money is paid from / received into.
 * Loads the company's accounts and selects the first one ("Bank Account"
 * or "Cash", alphabetically) when nothing is chosen yet.
 */
export default function PaymentAccountSelect({
  value,
  onChange,
  className,
  id,
  showBalance = true,
}: PaymentAccountSelectProps) {
  const { format } = useCurrency();
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: PaymentAccount[] }>("/accounting/payment-accounts")
      .then((res) => {
        if (!active) return;
        setAccounts(res.data);
        if (!value && res.data.length > 0) {
          const cash = res.data.find((a) => a.name === "Cash");
          onChange((cash || res.data[0]).id);
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load accounts");
      });
    return () => {
      active = false;
    };
    // Load once; `value`/`onChange` only seed the default selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={accounts.length === 0}
      className={cn(
        "w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60",
        className
      )}
    >
      {accounts.length === 0 && <option value="">Loading accounts…</option>}
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
          {showBalance ? ` (${format(a.balance)})` : ""}
        </option>
      ))}
    </select>
  );
}
