import {
  LayoutDashboard, Package, ShoppingCart, Factory, Receipt, Users, Wallet, Landmark,
  Calculator, Briefcase, FileText, Settings, type LucideIcon,
} from "lucide-react";
import { can, type Access, type Area, type Permissions } from "@/lib/permissions";

/**
 * The single navigation definition. The sidebar, header breadcrumbs and the
 * search palette all read from here, so a page is added in one place.
 * Factory-first structure: Overview / Business operations / Financial
 * management / Management.
 */
export interface NavLeaf {
  name: string;
  href: string;
  /** Who may see it: the area a role needs (and whether it must be able to change it). */
  area?: Area;
  need?: Access;
  /** Extra words the search palette should match. */
  keywords?: string[];
}

export interface NavItem {
  name: string;
  icon: LucideIcon;
  area?: Area;
  need?: Access;
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
          { name: "Overview", href: "/dashboard/inventory", area: "inventory" },
          { name: "Products", href: "/dashboard/inventory/products", area: "inventory", keywords: ["items", "raw materials", "finished goods"] },
          { name: "Stock movements", href: "/dashboard/inventory/movements", area: "inventory", keywords: ["history"] },
          { name: "Stock check", href: "/dashboard/inventory/stock-check", area: "inventory", keywords: ["reconcile", "count"] },
        ],
      },
      {
        name: "Purchasing",
        icon: ShoppingCart,
        children: [
          { name: "Purchases", href: "/dashboard/purchases", area: "purchasing", keywords: ["orders", "bills"] },
          { name: "Receive goods", href: "/dashboard/inventory/receive", area: "purchasing", need: "write", keywords: ["receive inventory", "delivery"] },
          { name: "Suppliers", href: "/dashboard/suppliers", area: "purchasing", keywords: ["vendors"] },
          { name: "Payables", href: "/dashboard/accounting/payable", area: "purchasing", keywords: ["accounts payable", "owed", "supplier payments"] },
        ],
      },
      {
        name: "Production",
        icon: Factory,
        children: [
          { name: "Production orders", href: "/dashboard/production", area: "inventory", keywords: ["manufacturing", "make", "batch", "run", "mo"] },
          { name: "Bills of materials", href: "/dashboard/production/boms", area: "inventory", keywords: ["bom", "recipe", "formula", "materials"] },
        ],
      },
      {
        name: "Sales",
        icon: Receipt,
        children: [
          { name: "Invoices", href: "/dashboard/invoices", area: "sales", keywords: ["sales", "bills"] },
          { name: "Payments received", href: "/dashboard/payments", area: "sales", keywords: ["customer payments"] },
          { name: "Receivables", href: "/dashboard/accounting/receivable", area: "sales", keywords: ["accounts receivable", "debtors", "owed"] },
        ],
      },
      { name: "Customers", href: "/dashboard/customers", area: "sales", icon: Users, keywords: ["clients", "buyers"] },
    ],
  },
  {
    label: "Financial management",
    items: [
      { name: "Expenses", href: "/dashboard/accounting/expenses", area: "money", icon: Wallet, keywords: ["costs", "spending"] },
      { name: "Cash & Banks", href: "/dashboard/accounting/accounts", area: "money", icon: Landmark, keywords: ["bank accounts", "cash management", "transfers", "owner"] },
      {
        name: "Accounting",
        icon: Calculator,
        children: [
          { name: "Overview", href: "/dashboard/accounting", area: "money" },
          { name: "Journal", href: "/dashboard/accounting/journal", area: "money", keywords: ["ledger", "entries"] },
          { name: "Profit & Loss", href: "/dashboard/accounting/profit-loss", area: "money", keywords: ["income statement", "p&l"] },
          { name: "Balance Sheet", href: "/dashboard/accounting/balance-sheet", area: "money", keywords: ["trial balance"] },
          { name: "Tax", href: "/dashboard/tax", area: "money", keywords: ["vat"] },
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
          { name: "Employees", href: "/dashboard/employees", area: "hr", keywords: ["staff"] },
          { name: "Payroll", href: "/dashboard/payroll", area: "payroll", keywords: ["salaries", "wages"] },
          { name: "Attendance", href: "/dashboard/attendance", area: "hr" },
          { name: "Leave", href: "/dashboard/leave", area: "hr", keywords: ["holiday", "time off"] },
        ],
      },
      { name: "Reports", href: "/dashboard/reports", area: "reports", icon: FileText },
      {
        name: "Settings",
        icon: Settings,
        children: [
          { name: "Company", href: "/dashboard/settings", area: "settings", need: "write", keywords: ["currency", "business"] },
          { name: "Locations", href: "/dashboard/settings/locations", area: "settings", need: "write", keywords: ["branches", "factory", "stores"] },
          { name: "Team", href: "/dashboard/settings/team", area: "settings", need: "write", keywords: ["users", "staff accounts", "roles", "permissions", "invite"] },
        ],
      },
    ],
  },
];

/** The navigation a user with these permissions can use: hidden leaves, and groups left empty, are dropped. */
export function visibleNav(permissions: Permissions | undefined): NavSection[] {
  return NAV.map((section) => ({
    ...section,
    items: section.items
      .filter((item) => can(permissions, item.area, item.need))
      .map((item) => (item.children ? { ...item, children: item.children.filter((c) => can(permissions, c.area, c.need)) } : item))
      .filter((item) => !item.children || item.children.length > 0),
  })).filter((section) => section.items.length > 0);
}

export interface NavMatch {
  section: string;
  item: NavItem;
  leaf?: NavLeaf;
  href: string;
}

/** Every navigable page, flattened. */
export function allPages(permissions?: Permissions): NavMatch[] {
  const out: NavMatch[] = [];
  for (const section of permissions ? visibleNav(permissions) : NAV) {
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

/**
 * What a page needs: the area of its menu entry (or of its parent page), and
 * "write" for create pages ("/new") and pages marked as changing data.
 */
export function pageAccess(pathname: string): { area: Area; need: Access } | undefined {
  const m = matchNav(pathname);
  if (!m) return undefined;
  const area = m.leaf?.area ?? m.item.area;
  if (!area) return undefined;
  const need: Access = /\/new(\/|$)/.test(pathname) ? "write" : (m.leaf?.need ?? m.item.need ?? "read");
  return { area, need };
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
