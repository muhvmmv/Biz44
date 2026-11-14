"use client";

import { useAuth } from "./useAuth";
import { formatCurrency } from "@/lib/currency";

export function useCurrency() {
  const { user } = useAuth();
  const currency = user?.currency || "USD";
  return {
    currency,
    format: (amount: number | null | undefined) => formatCurrency(amount, currency),
  };
}