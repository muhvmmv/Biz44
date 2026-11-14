/** Everyday "create" actions, shown in the header's New menu and in search. */
export const QUICK_ACTIONS: { label: string; href: string; keywords?: string[] }[] = [
  { label: "New invoice", href: "/dashboard/invoices/new", keywords: ["sell", "sale", "bill"] },
  { label: "Receive goods", href: "/dashboard/inventory/receive", keywords: ["purchase", "delivery", "stock in"] },
  { label: "Record expense", href: "/dashboard/accounting/expenses?new=1", keywords: ["spend", "cost"] },
  { label: "Add customer", href: "/dashboard/customers?new=1", keywords: ["client"] },
  { label: "Add product", href: "/dashboard/inventory/products?new=1", keywords: ["item"] },
];
