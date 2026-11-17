/** Everyday "create" actions, shown in the header's New menu and in search. */
import type { Area } from "@/lib/permissions";

/** factoryOnly: hidden while a store branch is selected. */
export const QUICK_ACTIONS: { label: string; href: string; area: Area; keywords?: string[]; factoryOnly?: boolean }[] = [
  { label: "New invoice", href: "/dashboard/invoices/new", area: "sales", keywords: ["sell", "sale", "bill"] },
  { label: "New production order", href: "/dashboard/production/new", area: "inventory", keywords: ["make", "manufacture", "produce"], factoryOnly: true },
  { label: "Move stock", href: "/dashboard/inventory/transfers?new=1", area: "inventory", keywords: ["transfer", "branch", "store"] },
  { label: "Receive goods", href: "/dashboard/inventory/receive", area: "purchasing", keywords: ["purchase", "delivery", "stock in"], factoryOnly: true },
  { label: "Record expense", href: "/dashboard/accounting/expenses?new=1", area: "money", keywords: ["spend", "cost"] },
  { label: "Add customer", href: "/dashboard/customers?new=1", area: "sales", keywords: ["client"] },
  { label: "Add product", href: "/dashboard/inventory/products?new=1", area: "inventory", keywords: ["item"] },
];
