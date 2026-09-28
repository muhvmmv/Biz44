"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calculator,
  Users,
  Briefcase,
  Package,
  Receipt,
  Wallet,
  FileText,
  Settings,
  Truck,
  ScrollText,
  Menu,
  X,
  LogOut,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

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
    ],
  },
  { name: "Suppliers", href: "/dashboard/suppliers", icon: Truck },
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
      { name: "Transactions", href: "/dashboard/accounting/transactions" },
      { name: "Expenses", href: "/dashboard/accounting/expenses" },
      { name: "Accounts Receivable", href: "/dashboard/accounting/receivable" },
      { name: "Cash & Banks", href: "/dashboard/accounting/accounts" },
      { name: "Profit & Loss", href: "/dashboard/accounting/profit-loss" },
    ],
  },
  { name: "Reports", href: "/dashboard/reports", icon: FileText },
  { name: "Tax", href: "/dashboard/tax", icon: ScrollText },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <DashboardInner>{children}</DashboardInner>
    </ProtectedRoute>
  );
}

function DashboardInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>("Inventory");
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const toggleGroup = (name: string) => {
    setExpanded((prev) => (prev === name ? null : name));
  };

  const isGroupActive = (item: NavItem) =>
    item.children?.some((c) => pathname === c.href) ?? false;

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-neutral-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between px-6 border-b border-neutral-200">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-bold text-xl text-neutral-900"
          >
            <span className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center text-white text-xs font-extrabold">
              B
            </span>
            Biz44
          </Link>
          <button
            className="lg:hidden p-1 text-neutral-500 hover:text-neutral-700"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;

            // Group with children
            if (item.children) {
              const isExpanded = expanded === item.name;
              const isChildActive = isGroupActive(item);

              return (
                <div key={item.name}>
                  <button
                    onClick={() => toggleGroup(item.name)}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isChildActive
                        ? "text-brand-700 bg-brand-50"
                        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                    }`}
                  >
                    <Icon size={18} />
                    <span className="flex-1 text-left">{item.name}</span>
                    {isExpanded ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="mt-1 ml-4 pl-4 border-l border-neutral-200 space-y-1">
                      {item.children.map((child) => {
                        const isActive = pathname === child.href;
                        return (
                          <Link
                            key={child.name}
                            href={child.href}
                            onClick={() => setSidebarOpen(false)}
                            className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                              isActive
                                ? "bg-brand-50 text-brand-700 font-medium"
                                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
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

            // Simple link
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href!}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                <Icon size={18} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User area at bottom of sidebar */}
        <div className="border-t border-neutral-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm">
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-neutral-500 truncate">{user?.email}</p>
            </div>
            <button
              onClick={() => logout()}
              className="p-1.5 text-neutral-400 hover:text-red-500 transition-colors"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-neutral-200 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
          <button
            className="lg:hidden p-2 text-neutral-600 hover:text-neutral-900"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>

          <div className="flex items-center gap-4 ml-auto">
            <Link
              href="/dashboard/settings"
              className="h-8 w-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-bold hover:bg-brand-700 transition-colors"
              title="Settings"
            >
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </Link>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}