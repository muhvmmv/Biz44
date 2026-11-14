import {
  LayoutDashboard, Package, ShoppingCart, Receipt, Users, Wallet, Landmark,
  Calculator, Briefcase, FileText, Settings, type LucideIcon,
} from "lucide-react";

/**
 * The single navigation definition. The sidebar, header breadcrumbs and the
 * search palette all read from here, so a page is added in one place.
 * Factory-first structure: Overview / Business operations / Financial
 * management / Management.
 */
export interface NavLeaf {
  name: string;
  href: string;
  /** Extra words the search palette should match. */
  keywords?: string[];
}

export interface NavItem {
  name: string;
  icon: LucideIcon;
  href?: string;
  children?: NavLeaf[];
  keywords?: string[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    label: "Overview",
    items: [{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, keywords: ["home", "analytics"] }],
  },
  {
    label: "Business operations",
    items: [
      {
        name: "Inventory",
        icon: Package,
        children: [
          { name: "Overview", href: "/dashboard/inventory" },
          { name: "Products", href: "/dashboard/inventory/products", keywords: ["items", "raw materials", "finished goods"] },
          { name: "Stock movements", href: "/dashboard/inventory/movements", keywords: ["history"] },
          { name: "Stock check", href: "/dashboard/inventory/stock-check", keywords: ["reconcile", "count"] },
        ],
      },
      {
        name: "Purchasing",
        icon: ShoppingCart,
        children: [
          { name: "Purchases", href: "/dashboard/purchases", keywords: ["orders", "bills"] },
          { name: "Receive goods", href: "/dashboard/inventory/receive", keywords: ["receive inventory", "delivery"] },
          { name: "Suppliers", href: "/dashboard/suppliers", keywords: ["vendors"] },
          { name: "Payables", href: "/dashboard/accounting/payable", keywords: ["accounts payable", "owed", "supplier payments"] },
        ],
      },
      {
        name: "Sales",
        icon: Receipt,
        children: [
          { name: "Invoices", href: "/dashboard/invoices", keywords: ["sales", "bills"] },
          { name: "Payments received", href: "/dashboard/payments", keywords: ["customer payments"] },
          { name: "Receivables", href: "/dashboard/accounting/receivable", keywords: ["accounts receivable", "debtors", "owed"] },
        ],
      },
      { name: "Customers", href: "/dashboard/customers", icon: Users, keywords: ["clients", "buyers"] },
    ],
  },
  {
    label: "Financial management",
    items: [
      { name: "Expenses", href: "/dashboard/accounting/expenses", icon: Wallet, keywords: ["costs", "spending"] },
      { name: "Cash & Banks", href: "/dashboard/accounting/accounts", icon: Landmark, keywords: ["bank accounts", "cash management", "transfers", "owner"] },
      {
        name: "Accounting",
        icon: Calculator,
        children: [
          { name: "Overview", href: "/dashboard/accounting" },
          { name: "Journal", href: "/dashboard/accounting/journal", keywords: ["ledger", "entries"] },
          { name: "Profit & Loss", href: "/dashboard/accounting/profit-loss", keywords: ["income statement", "p&l"] },
          { name: "Balance Sheet", href: "/dashboard/accounting/balance-sheet", keywords: ["trial balance"] },
          { name: "Tax", href: "/dashboard/tax", keywords: ["vat"] },
        ],
      },
    ],
  },
  {
    label: "Management",
    items: [
      {
        name: "Employees",
        icon: Briefcase,
        children: [
          { name: "Employees", href: "/dashboard/employees", keywords: ["staff"] },
          { name: "Payroll", href: "/dashboard/payroll", keywords: ["salaries", "wages"] },
          { name: "Attendance", href: "/dashboard/attendance" },
          { name: "Leave", href: "/dashboard/leave", keywords: ["holiday", "time off"] },
        ],
      },
      { name: "Reports", href: "/dashboard/reports", icon: FileText },
      {
        name: "Settings",
        icon: Settings,
        children: [
          { name: "Company", href: "/dashboard/settings", keywords: ["currency", "business"] },
          { name: "Locations", href: "/dashboard/settings/locations", keywords: ["branches", "factory", "stores"] },
        ],
      },
    ],
  },
];

export interface NavMatch {
  section: string;
  item: NavItem;
  leaf?: NavLeaf;
  href: string;
}

/** Every navigable page, flattened. */
export function allPages(): NavMatch[] {
  const out: NavMatch[] = [];
  for (const section of NAV) {
    for (const item of section.items) {
      if (item.href) out.push({ section: section.label, item, href: item.href });
      for (const leaf of item.children ?? []) out.push({ section: section.label, item, leaf, href: leaf.href });
    }
  }
  return out;
}

/**
 * The nav entry for a path: exact match, otherwise the longest href that is
 * a parent path ("/dashboard" itself only matches exactly).
 */
export function matchNav(pathname: string): NavMatch | undefined {
  const pages = allPages();
  const exact = pages.find((p) => p.href === pathname);
  if (exact) return exact;
  return pages
    .filter((p) => p.href !== "/dashboard" && pathname.startsWith(`${p.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** Breadcrumb trail for a path, e.g. ["Purchasing", "Suppliers", "Details"]. */
export function breadcrumbs(pathname: string): { label: string; href?: string }[] {
  const m = matchNav(pathname);
  if (!m) {
    // Pages outside the menu (alerts, design system): use the page's own name.
    const last = pathname.split("/").filter(Boolean).pop() ?? "";
    const label = last === "notifications" ? "Needs attention" : last.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    return label ? [{ label }] : [];
  }
  const crumbs: { label: string; href?: string }[] = [];
  if (m.leaf) {
    crumbs.push({ label: m.item.name, href: m.item.children?.[0]?.href });
    crumbs.push({ label: m.leaf.name, href: m.href });
  } else {
    crumbs.push({ label: m.item.name, href: m.href });
  }
  if (pathname !== m.href) {
    const rest = pathname.slice(m.href.length + 1);
    crumbs.push({ label: rest === "new" ? "New" : "Details" });
  }
  // Drop a duplicated label like "Employees / Employees".
  return crumbs.filter((c, i) => i === 0 || c.label !== crumbs[i - 1].label);
}
