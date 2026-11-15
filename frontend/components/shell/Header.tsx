"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Menu, Search, Plus, Bell, ChevronRight, MapPin, Check, Settings, LogOut, UserRound, Users, Building2, AlertTriangle, AlertCircle, Info,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { breadcrumbs } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { useLocation } from "@/hooks/useLocation";
import { useCurrency } from "@/hooks/useCurrency";
import DropdownMenu, { MenuButton, MenuDivider, MenuLabel, MenuLink } from "@/components/ui/DropdownMenu";
import { buttonClasses } from "@/components/ui/Button";
import { QUICK_ACTIONS } from "./quickActions";
import { cn } from "@/lib/utils";

export interface Alert {
  id: string;
  severity: "danger" | "warning" | "info";
  title: string;
  detail: string;
  amount?: number;
  href: string;
  count: number;
}

export default function Header({
  pathname,
  onOpenMenu,
  onOpenSearch,
}: {
  pathname: string;
  onOpenMenu: () => void;
  onOpenSearch: () => void;
}) {
  const crumbs = breadcrumbs(pathname);
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setIsMac(/Mac|iPhone|iPad/.test(navigator.platform)), 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <header className="flex h-header shrink-0 items-center gap-3 border-b border-border-soft bg-surface/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface/75 lg:px-8">
      <button onClick={onOpenMenu} className="-ml-1 rounded-lg p-2 text-ink-soft hover:bg-ivory hover:text-ink lg:hidden" aria-label="Open menu">
        <Menu size={20} />
      </button>

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 text-sm">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={`${c.label}-${i}`} className={cn("flex min-w-0 items-center gap-1.5", !last && "hidden sm:flex")}>
                {i > 0 && <ChevronRight size={14} className="shrink-0 text-ink-faint" aria-hidden="true" />}
                {last || !c.href ? (
                  <span className={cn("truncate", last ? "font-semibold text-ink" : "text-ink-soft")} aria-current={last ? "page" : undefined}>
                    {c.label}
                  </span>
                ) : (
                  <Link href={c.href} className="truncate text-ink-soft hover:text-ink">{c.label}</Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Search */}
      <button
        onClick={onOpenSearch}
        className="hidden h-10 w-64 items-center gap-2 rounded-xl border border-border-soft bg-surface-muted px-3 text-sm text-ink-faint transition-colors hover:border-border-strong md:flex"
        aria-label="Search"
      >
        <Search size={16} />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded-md border border-border-soft bg-surface px-1.5 text-[11px] text-ink-soft">{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      <button onClick={onOpenSearch} className="rounded-lg p-2 text-ink-soft hover:bg-ivory hover:text-ink md:hidden" aria-label="Search">
        <Search size={20} />
      </button>

      <QuickCreate />
      <Notifications pathname={pathname} />
      <LocationSwitcher />
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
      triggerClassName={buttonClasses("primary", "md", "px-3 sm:px-4")}
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
function Notifications({ pathname }: { pathname: string }) {
  const { format } = useCurrency();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      apiFetch<{ success: boolean; data: Alert[] }>("/dashboard/alerts")
        .then((r) => { if (active) setAlerts(r.data); })
        .catch(() => { if (active) setAlerts([]); });
    load();
    const t = setInterval(load, 120_000);
    return () => { active = false; clearInterval(t); };
  }, [pathname]);

  const urgent = alerts?.filter((a) => a.severity !== "info").length ?? 0;

  return (
    <DropdownMenu
      triggerLabel={urgent ? `${urgent} alerts need attention` : "Alerts"}
      triggerClassName="relative rounded-xl p-2.5 text-ink-soft transition-colors hover:bg-ivory hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      trigger={
        <>
          <Bell size={19} />
          {urgent > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white ring-2 ring-surface">
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

/** Location switcher; hidden for a company with a single location. */
function LocationSwitcher() {
  const { locations, activeLocationId, activeLocation, setActiveLocation } = useLocation();
  if (locations.length <= 1) return null;
  const label = activeLocationId === "all" ? "All locations" : activeLocation?.name ?? "Select location";

  return (
    <DropdownMenu
      triggerLabel={`Location: ${label}`}
      triggerClassName="hidden h-10 items-center gap-2 rounded-xl border border-border-soft bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:flex"
      trigger={<><MapPin size={15} className="text-brand" /><span className="max-w-[9rem] truncate">{label}</span></>}
    >
      {(close) => (
        <>
          <MenuLabel>Show data for</MenuLabel>
          <MenuButton onClick={() => { setActiveLocation("all"); close(); window.location.reload(); }}>
            <Building2 size={15} /> <span className="flex-1">All locations</span>
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
          <MenuDivider />
          <MenuLink href="/dashboard/settings/locations" onSelect={close}><Settings size={15} /> Manage locations</MenuLink>
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
      triggerClassName="flex h-10 w-10 items-center justify-center rounded-full bg-charcoal text-xs font-bold text-white transition-colors hover:bg-charcoal-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
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
