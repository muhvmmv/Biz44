"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Calculator, Users, Briefcase, Package, Receipt,
  Wallet, FileText, Truck, ScrollText, Menu, X, LogOut,
  ChevronDown, ChevronRight, ShoppingCart,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { LocationProvider, useLocation } from "@/hooks/useLocation";
import LocationSelector from "@/components/dashboard/LocationSelector";

type NavItem = {
  name: string;
  href?: string;
  icon: React.ComponentType<{ size?: number }>;
  children?: { name: string; href: string }[];
};

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Customers", href: "/dashboard/customers", icon: Users },
  {
    name: "Inventory",
    icon: Package,
    children: [
      { name: "Overview", href: "/dashboard/inventory" },
      { name: "Products", href: "/dashboard/inventory/products" },
      { name: "Receive Inventory", href: "/dashboard/inventory/receive" },
      { name: "Stock Movements", href: "/dashboard/inventory/movements" },
      { name: "Stock Check", href: "/dashboard/inventory/stock-check" },
    ],
  },
  { name: "Suppliers", href: "/dashboard/suppliers", icon: Truck },
  { name: "Purchases", href: "/dashboard/purchases", icon: ShoppingCart },
  {
    name: "Employees",
    icon: Briefcase,
    children: [
      { name: "Employees", href: "/dashboard/employees" },
      { name: "Payroll", href: "/dashboard/payroll" },
      { name: "Leave", href: "/dashboard/leave" },
    ],
  },
  { name: "Invoices", href: "/dashboard/invoices", icon: Receipt },
  { name: "Payments", href: "/dashboard/payments", icon: Wallet },
  {
    name: "Accounting",
    icon: Calculator,
    children: [
      { name: "Overview", href: "/dashboard/accounting" },
      { name: "Cash & Banks", href: "/dashboard/accounting/accounts" },
      { name: "Expenses", href: "/dashboard/accounting/expenses" },
      { name: "Journal", href: "/dashboard/accounting/journal" },
      { name: "Profit & Loss", href: "/dashboard/accounting/profit-loss" },
      { name: "Balance Sheet", href: "/dashboard/accounting/balance-sheet" },
      { name: "Receivables", href: "/dashboard/accounting/receivable" },
      { name: "Payables", href: "/dashboard/accounting/payable" },
    ],
  },
  { name: "Reports", href: "/dashboard/reports", icon: FileText },
  { name: "Tax", href: "/dashboard/tax", icon: ScrollText },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <LocationProvider>
        <DashboardInner>{children}</DashboardInner>
      </LocationProvider>
    </ProtectedRoute>
  );
}

function DashboardInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  // Open the group that contains the current page.
  const [expanded, setExpanded] = useState<string | null>(
    () =>
      navigation.find((n) =>
        n.children?.some((c) => pathname === c.href || pathname.startsWith(`${c.href}/`))
      )?.name ?? null
  );
  const { user, logout } = useAuth();
  const { loading: locationLoading } = useLocation();

  const toggleGroup = (name: string) =>
    setExpanded((prev) => (prev === name ? null : name));

  // Block rendering the page until locations are verified and loaded.
  // This stops pages from firing API calls with a stale location ID.
  if (locationLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ivory">
        <div className="animate-spin h-8 w-8 border-4 border-brand border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-ivory flex overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-charcoal text-white flex flex-col transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto lg:h-screen ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between px-6 border-b border-white/10 shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl text-white">
            <span className="w-7 h-7 bg-brand rounded-lg flex items-center justify-center text-white text-xs font-extrabold">
              B
            </span>
            Biz44
          </Link>
          <button
            className="lg:hidden p-1 text-white/70 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;

            if (item.children) {
              const isExpanded = expanded === item.name;
              // The most specific child whose path matches (so /accounting/accounts/123
              // highlights "Cash & Banks", not "Overview").
              const activeChild = item.children
                .filter((c) => pathname === c.href || pathname.startsWith(`${c.href}/`))
                .sort((a, b) => b.href.length - a.href.length)[0];
              const isChildActive = !!activeChild;

              return (
                <div key={item.name}>
                  <button
                    onClick={() => toggleGroup(item.name)}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isChildActive
                        ? "bg-white/10 text-white"
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon size={18} />
                    <span className="flex-1 text-left">{item.name}</span>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  {isExpanded && (
                    <div className="mt-1 ml-4 pl-4 border-l border-white/10 space-y-1">
                      {item.children.map((child) => {
                        const isActive = activeChild?.href === child.href;
                        return (
                          <Link
                            key={child.name}
                            href={child.href}
                            onClick={() => setSidebarOpen(false)}
                            className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                              isActive
                                ? "bg-brand-light text-brand-dark font-medium"
                                : "text-white/60 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            {child.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href!}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-light text-brand-dark"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-dark text-white flex items-center justify-center font-semibold text-sm">
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-white/50 truncate">{user?.email}</p>
            </div>
            <button
              onClick={() => logout()}
              className="p-1.5 text-white/50 hover:text-brand-dark transition-colors"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-border-soft flex items-center justify-between px-4 lg:px-8 shrink-0">
          <button
            className="lg:hidden p-2 text-ink-soft hover:text-ink"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>

          <div className="flex items-center gap-4 ml-auto">
            <LocationSelector />
            <Link
              href="/dashboard/settings"
              className="h-8 w-8 rounded-full bg-charcoal text-white flex items-center justify-center text-xs font-bold hover:bg-charcoal-dark transition-colors"
              title="Settings"
            >
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}