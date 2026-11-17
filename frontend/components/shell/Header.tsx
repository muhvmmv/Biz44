"use client";

import Link from "next/link";
import {
  Menu, Plus, Bell, ChevronDown, MapPin, Check, Settings, LogOut, UserRound, Users, Building2, AlertTriangle, AlertCircle, Info, Factory, ShoppingBag, PackagePlus, Store,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useAlerts } from "@/hooks/useAlerts";
import { useAuth } from "@/hooks/useAuth";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { useLocation } from "@/hooks/useLocation";
import { useCurrency } from "@/hooks/useCurrency";
import DropdownMenu, { MenuButton, MenuDivider, MenuLabel, MenuLink } from "@/components/ui/DropdownMenu";
import { QUICK_ACTIONS } from "./quickActions";
import { cn } from "@/lib/utils";

export type { Alert } from "@/hooks/useAlerts";

export default function Header({
  onOpenMenu,
  roomy = true,
}: {
  pathname: string;
  /** False while the full sidebar panel is open (less width for labels). */
  roomy?: boolean;
  onOpenMenu: () => void;
  /** Kept for callers; search now lives in the sidebar. */
  onOpenSearch?: () => void;
}) {
  const { user } = useAuth();
  const canProduce = can(user?.permissions, "inventory", "write");
  // At a store the first button receives stock from a factory instead.
  const { manufacturing } = useLocation();
  const canSell = can(user?.permissions, "sales", "write");

  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center gap-2 bg-ivory/70 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-ivory/55 sm:gap-3 sm:px-6 lg:px-8">
      {/* Left: menu (phones and tablets). Search lives in the sidebar (and ⌘K / Ctrl K). */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button onClick={onOpenMenu} className="-ml-1 shrink-0 rounded-xl p-2 text-ink-soft hover:bg-surface hover:text-ink lg:hidden" aria-label="Open menu">
          <Menu size={20} />
        </button>
      </div>

      {/* Centre: production order · company · sell, as one cluster */}
      <div className="flex shrink-0 items-center gap-1 rounded-full border border-border-soft bg-surface/85 p-1 shadow-card">
        {canProduce && (
          <Link
            href={manufacturing ? "/dashboard/production/new" : "/dashboard/inventory/transfers?new=1"}
            aria-label={manufacturing ? "New production order" : "Receive stock from a factory"}
            title={manufacturing ? "New production order" : "Receive stock from a factory"}
            className={cn(
              "group relative flex h-10 w-10 shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full text-sm font-bold lg:w-36 bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600 text-white shadow-[0_6px_16px_-6px_rgb(240_90_40/0.65)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_22px_-6px_rgb(240_90_40/0.75)]",
              roomy ? "xl:w-40" : "2xl:w-40"
            )}
          >
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" aria-hidden="true" />
            {manufacturing ? <Factory size={16} className="shrink-0" /> : <PackagePlus size={16} className="shrink-0" />}
            <span className="hidden lg:inline">{manufacturing ? (roomy ? "Production order" : "Production") : (roomy ? "Receive stock" : "Receive")}</span>
          </Link>
        )}
        <CompanySwitcher roomy={roomy} />
        {canSell && (
          <Link
            href="/dashboard/invoices/new"
            className={cn(
              "group relative flex h-10 w-10 shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full text-sm font-extrabold tracking-wide sm:w-auto sm:px-4 lg:w-36 lg:px-0 bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600 text-white shadow-[0_6px_16px_-6px_rgb(240_90_40/0.65)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_22px_-6px_rgb(240_90_40/0.75)]",
              roomy ? "xl:w-40" : "2xl:w-40"
            )}
          >
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" aria-hidden="true" />
            <ShoppingBag size={16} className="shrink-0" />
            <span className="sr-only sm:not-sr-only">SELL</span>
          </Link>
        )}
      </div>

      {/* Right: create, alerts, account */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
        <div className="hidden sm:block"><QuickCreate /></div>
        <Notifications />
        <UserMenu />
      </div>
    </header>
  );
}

function QuickCreate() {
  const { user } = useAuth();
  const { manufacturing } = useLocation();
  const actions = QUICK_ACTIONS.filter((a) => can(user?.permissions, a.area, "write") && (manufacturing || !a.factoryOnly));
  if (actions.length === 0) return null;
  return (
    <DropdownMenu
      triggerLabel="Create new"
      triggerClassName="flex h-11 items-center gap-1.5 rounded-full border border-border-soft bg-surface/80 px-3 text-sm font-semibold text-ink shadow-card transition-all hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:px-4"
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
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-surface">
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
            <Link href="/dashboard/notifications" onClick={close} className="text-xs font-medium text-ink-soft hover:text-ink hover:underline">View all</Link>
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
function CompanySwitcher({ roomy = true }: { roomy?: boolean }) {
  const { user } = useAuth();
  const { locations, activeLocationId, activeLocation, setActiveLocation } = useLocation();
  const branch = activeLocationId === "all" ? (locations.length > 1 ? "All branches" : locations[0]?.name ?? "Main branch") : activeLocation?.name ?? "Select branch";
  const company = user?.companyName || "Your company";
  const content = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-[11px] font-bold text-white">
        {company.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
      </span>
      <span className="hidden min-w-0 flex-1 text-center leading-tight sm:block">
        <span className="block truncate text-sm font-bold text-ink">{company}</span>
        <span className="flex items-center justify-center gap-1 text-xs text-ink-soft"><MapPin size={11} className="shrink-0" /><span className="truncate">{branch}{activeLocation?.kind === "store" ? " · store" : ""}</span></span>
      </span>
      {/* Same width as the initials on the left, so the name sits in the centre. */}
      <span className="hidden w-8 shrink-0 items-center justify-center text-ink-faint sm:flex" aria-hidden="true">
        {locations.length > 1 && <ChevronDown size={15} />}
      </span>
    </>
  );
  const cls = cn(
    "flex h-10 items-center gap-2.5 rounded-full py-1 pl-1 pr-1 sm:w-56 lg:w-64",
    roomy ? "xl:w-80" : "2xl:w-80"
  );
  if (locations.length <= 1) return <div className={cls}>{content}</div>;

  return (
    <DropdownMenu
      triggerLabel={`${company}, ${branch}`}
      triggerClassName={cn(cls, "transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand")}
      trigger={content}
      width="w-64"
    >
      {(close) => (
        <>
          <MenuLabel>Show data for</MenuLabel>
          <MenuButton onClick={() => { setActiveLocation("all"); close(); window.location.reload(); }}>
            <Building2 size={15} /> <span className="flex-1">All branches</span>
            {activeLocationId === "all" && <Check size={15} className="!text-ink" />}
          </MenuButton>
          {locations.map((l) => (
            <MenuButton key={l.id} onClick={() => { setActiveLocation(l.id); close(); }}>
              {l.kind === "store" ? <Store size={15} /> : <Factory size={15} />}
              <span className="flex-1 min-w-0">
                <span className="block truncate">{l.name}</span>
                <span className="block text-xs text-ink-soft">{l.kind === "store" ? "Store" : "Factory"}{l.city ? ` · ${l.city}` : ""}</span>
              </span>
              {activeLocationId === l.id && <Check size={15} className="!text-ink" />}
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
            {user?.role && <p className="mt-0.5 text-xs font-medium text-ink-soft">{ROLE_LABELS[user.role] ?? user.role}</p>}
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
