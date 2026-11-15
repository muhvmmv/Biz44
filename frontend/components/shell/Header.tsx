"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Menu, Search, Plus, Bell, ChevronDown, MapPin, Check, Settings, LogOut, UserRound, Users, Building2, AlertTriangle, AlertCircle, Info, Factory, ShoppingBag,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useAlerts } from "@/hooks/useAlerts";
import { useAuth } from "@/hooks/useAuth";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { useLocation } from "@/hooks/useLocation";
import { useCurrency } from "@/hooks/useCurrency";
import DropdownMenu, { MenuButton, MenuDivider, MenuLabel, MenuLink } from "@/components/ui/DropdownMenu";
import { buttonClasses } from "@/components/ui/Button";
import { QUICK_ACTIONS } from "./quickActions";
import { cn } from "@/lib/utils";

export type { Alert } from "@/hooks/useAlerts";

export default function Header({
  onOpenMenu,
  onOpenSearch,
  roomy = true,
}: {
  pathname: string;
  /** False while the full sidebar panel is open (less width for labels). */
  roomy?: boolean;
  onOpenMenu: () => void;
  onOpenSearch: () => void;
}) {
  const { user } = useAuth();
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setIsMac(/Mac|iPhone|iPad/.test(navigator.platform)), 0);
    return () => clearTimeout(t);
  }, []);
  const canProduce = can(user?.permissions, "inventory", "write");
  const canSell = can(user?.permissions, "sales", "write");

  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center gap-2 bg-ivory/70 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-ivory/55 sm:gap-3 sm:px-6 lg:px-8">
      <button onClick={onOpenMenu} className="-ml-1 rounded-xl p-2 text-ink-soft hover:bg-surface hover:text-ink lg:hidden" aria-label="Open menu">
        <Menu size={20} />
      </button>

      {/* Search */}
      <button
        onClick={onOpenSearch}
        className="hidden h-11 w-full max-w-xs items-center gap-2 rounded-full border border-border-soft bg-surface/80 px-4 text-sm text-ink-faint shadow-card transition-all hover:border-brand/40 hover:shadow-raised md:flex xl:max-w-sm"
        aria-label="Search"
      >
        <Search size={16} />
        <span className="flex-1 text-left">Search invoices, customers, products…</span>
        <kbd className="rounded-md border border-border-soft bg-surface-muted px-1.5 text-[11px] text-ink-soft">{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      <button onClick={onOpenSearch} className="rounded-xl p-2 text-ink-soft hover:bg-surface hover:text-ink md:hidden" aria-label="Search">
        <Search size={20} />
      </button>

      <div className="flex-1" />

      {canProduce && (
        <Link
          href="/dashboard/production/new"
          aria-label="New production order"
          title="New production order"
          className={cn("hidden h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border-soft bg-surface/80 px-2.5 text-sm font-semibold text-ink shadow-card transition-all hover:-translate-y-0.5 hover:shadow-raised lg:flex", roomy ? "xl:px-4" : "2xl:px-4")}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-violet-400 to-purple-600 text-white"><Factory size={13} /></span>
          <span className={cn("hidden", roomy ? "xl:inline" : "2xl:inline")}>Production order</span>
        </Link>
      )}
      <CompanySwitcher />
      {canSell && (
        <Link
          href="/dashboard/invoices/new"
          className="group relative flex h-11 shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap rounded-full bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600 px-5 text-sm font-extrabold tracking-wide text-white shadow-[0_8px_20px_-6px_rgb(240_90_40/0.6)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-6px_rgb(240_90_40/0.7)]"
        >
          <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent transition-transform duration-700 group-hover:translate-x-full" aria-hidden="true" />
          <ShoppingBag size={16} />
          SELL
        </Link>
      )}
      <QuickCreate />
      <Notifications />
      <UserMenu />
    </header>
  );
}

function QuickCreate() {
  const { user } = useAuth();
  const actions = QUICK_ACTIONS.filter((a) => can(user?.permissions, a.area, "write"));
  if (actions.length === 0) return null;
  return (
    <DropdownMenu
      triggerLabel="Create new"
      triggerClassName={cn(buttonClasses("primary", "md", "h-11 rounded-full px-3 sm:px-4"), "shadow-card")}
      trigger={<><Plus size={16} /><span className="hidden sm:inline">New</span></>}
      width="w-52"
    >
      {(close) => (
        <>
          <MenuLabel>Create</MenuLabel>
          {actions.map((a) => (
            <MenuLink key={a.href} href={a.href} onSelect={close}>
              <Plus size={15} /> {a.label}
            </MenuLink>
          ))}
        </>
      )}
    </DropdownMenu>
  );
}

const SEVERITY = {
  danger: { icon: AlertCircle, cls: "text-danger bg-danger-soft" },
  warning: { icon: AlertTriangle, cls: "text-warning bg-warning-soft" },
  info: { icon: Info, cls: "text-info bg-info-soft" },
};

/** Live alerts from the database; refreshed on navigation and every 2 minutes. */
function Notifications() {
  const { format } = useCurrency();
  const pathname = usePathname();
  const alerts = useAlerts(pathname);

  const urgent = alerts?.filter((a) => a.severity !== "info").length ?? 0;

  return (
    <DropdownMenu
      triggerLabel={urgent ? `${urgent} alerts need attention` : "Alerts"}
      triggerClassName="relative flex h-11 w-11 items-center justify-center rounded-full border border-border-soft bg-surface/80 text-ink-soft shadow-card transition-all hover:-translate-y-0.5 hover:text-ink hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      trigger={
        <>
          <Bell size={19} />
          {urgent > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white ring-2 ring-surface">
              {urgent}
            </span>
          )}
        </>
      }
      width="w-[22rem] max-w-[calc(100vw-2rem)]"
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between px-3 pb-1 pt-2">
            <p className="text-sm font-semibold text-ink">Needs attention</p>
            <Link href="/dashboard/notifications" onClick={close} className="text-xs font-medium text-brand-dark hover:underline">View all</Link>
          </div>
          {alerts === null ? (
            <p className="px-3 py-6 text-center text-sm text-ink-soft">Checking…</p>
          ) : alerts.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-soft">All clear — nothing needs attention.</p>
          ) : (
            alerts.map((a) => {
              const S = SEVERITY[a.severity];
              return (
                <MenuLink key={a.id} href={a.href} onSelect={close} className="items-start py-2.5">
                  <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", S.cls)}>
                    <S.icon size={15} className="!text-current" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{a.title}</span>
                    <span className="block text-xs text-ink-soft">
                      {a.amount !== undefined ? `${format(a.amount)} ${a.detail}` : a.detail}
                    </span>
                  </span>
                </MenuLink>
              );
            })
          )}
        </>
      )}
    </DropdownMenu>
  );
}

/** The company (bold) and the branch whose data is shown, switchable when there are several. */
function CompanySwitcher() {
  const { user } = useAuth();
  const { locations, activeLocationId, activeLocation, setActiveLocation } = useLocation();
  const branch = activeLocationId === "all" ? (locations.length > 1 ? "All branches" : locations[0]?.name ?? "Main branch") : activeLocation?.name ?? "Select branch";
  const company = user?.companyName || "Your company";
  const content = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-[11px] font-bold text-white">
        {company.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
      </span>
      <span className="hidden min-w-0 text-left leading-tight sm:block">
        <span className="block max-w-[11rem] truncate text-sm font-bold text-ink">{company}</span>
        <span className="flex items-center gap-1 text-xs text-ink-soft"><MapPin size={11} className="text-brand" /><span className="max-w-[9rem] truncate">{branch}</span></span>
      </span>
      {locations.length > 1 && <ChevronDown size={15} className="hidden text-ink-faint sm:block" />}
    </>
  );
  const cls = "flex h-11 items-center gap-2.5 rounded-full border border-border-soft bg-surface/80 py-1 pl-1.5 pr-1.5 shadow-card transition-all sm:pr-4";
  if (locations.length <= 1) return <div className={cls}>{content}</div>;

  return (
    <DropdownMenu
      triggerLabel={`${company}, ${branch}`}
      triggerClassName={cn(cls, "hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand")}
      trigger={content}
      width="w-64"
    >
      {(close) => (
        <>
          <MenuLabel>Show data for</MenuLabel>
          <MenuButton onClick={() => { setActiveLocation("all"); close(); window.location.reload(); }}>
            <Building2 size={15} /> <span className="flex-1">All branches</span>
            {activeLocationId === "all" && <Check size={15} className="!text-brand" />}
          </MenuButton>
          {locations.map((l) => (
            <MenuButton key={l.id} onClick={() => { setActiveLocation(l.id); close(); }}>
              <MapPin size={15} />
              <span className="flex-1 min-w-0">
                <span className="block truncate">{l.name}</span>
                {l.city && <span className="block text-xs text-ink-soft">{l.city}</span>}
              </span>
              {activeLocationId === l.id && <Check size={15} className="!text-brand" />}
            </MenuButton>
          ))}
          {user?.role === "admin" && (
            <>
              <MenuDivider />
              <MenuLink href="/dashboard/settings/locations" onSelect={close}><Settings size={15} /> Manage branches</MenuLink>
            </>
          )}
        </>
      )}
    </DropdownMenu>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.toUpperCase();
  return (
    <DropdownMenu
      triggerLabel="Account menu"
      triggerClassName="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-xs font-bold text-white shadow-card transition-colors hover:bg-charcoal-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      trigger={initials || "?"}
      width="w-60"
    >
      {(close) => (
        <>
          <div className="px-3 pb-2 pt-2">
            <p className="truncate text-sm font-semibold text-ink">{user?.firstName} {user?.lastName}</p>
            <p className="truncate text-xs text-ink-soft">{user?.email}</p>
            {user?.role && <p className="mt-0.5 text-xs font-medium text-brand-dark">{ROLE_LABELS[user.role] ?? user.role}</p>}
          </div>
          <MenuDivider />
          <MenuLink href="/dashboard/profile" onSelect={close}><UserRound size={15} /> Your profile</MenuLink>
          {user?.role === "admin" && <MenuLink href="/dashboard/settings" onSelect={close}><Settings size={15} /> Company settings</MenuLink>}
          {user?.role === "admin" && <MenuLink href="/dashboard/settings/team" onSelect={close}><Users size={15} /> Team</MenuLink>}
          {user?.role === "admin" && <MenuLink href="/dashboard/settings/locations" onSelect={close}><MapPin size={15} /> Locations</MenuLink>}
          <MenuDivider />
          <MenuButton onClick={() => { close(); logout(); }} danger><LogOut size={15} /> Sign out</MenuButton>
        </>
      )}
    </DropdownMenu>
  );
}
