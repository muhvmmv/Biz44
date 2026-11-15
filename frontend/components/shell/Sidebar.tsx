"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { NavItem, matchNav, visibleNav } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface SidebarProps {
  pathname: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

/**
 * Grouped navigation. Desktop: full width or a collapsed icon rail.
 * Phones and tablets: a drawer opened from the header.
 */
export default function Sidebar({ pathname, collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const active = matchNav(pathname);
  // The group holding the current page is open unless the user closed it;
  // other groups are closed unless the user opened them.
  const { user } = useAuth();
  const nav = visibleNav(user?.permissions);
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const isOpen = (name: string) => (active?.item.name === name ? !closed.has(name) : opened.has(name));

  const toggleGroup = (name: string) => {
    const flip = (set: Set<string>) => {
      const next = new Set(set);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    };
    if (collapsed) {
      // In the rail, a group expands the sidebar and opens.
      onToggleCollapsed();
      setOpened((s) => new Set(s).add(name));
      setClosed((s) => { const n = new Set(s); n.delete(name); return n; });
      return;
    }
    if (active?.item.name === name) setClosed(flip);
    else setOpened(flip);
  };

  // The rail only applies on desktop; the mobile drawer is always full width.
  const rail = collapsed && !mobileOpen;

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] lg:hidden" onClick={onCloseMobile} aria-hidden="true" />
      )}
      <aside
        aria-label="Main navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border-soft bg-surface transition-[transform,width] duration-200 ease-out",
          "lg:static lg:z-auto lg:translate-x-0",
          mobileOpen ? "translate-x-0 w-sidebar shadow-pop" : "-translate-x-full",
          rail ? "lg:w-sidebar-collapsed" : "lg:w-sidebar"
        )}
      >
        {/* Brand */}
        <div className={cn("flex h-header shrink-0 items-center border-b border-border-soft", rail ? "justify-center px-2" : "justify-between px-5")}>
          <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onCloseMobile} aria-label="Biz44 home">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-sm font-extrabold text-white shadow-raised">B</span>
            {!rail && <span className="text-lg font-bold tracking-tight text-ink">Biz44</span>}
          </Link>
          <button onClick={onCloseMobile} className="rounded-lg p-1.5 text-ink-soft hover:bg-ivory hover:text-ink lg:hidden" aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className={cn("flex-1 overflow-y-auto py-4", rail ? "px-2" : "px-3")}>
          {nav.map((section, si) => (
            <div key={section.label} className={cn(si > 0 && "mt-5")}>
              {rail ? (
                si > 0 && <div className="mx-3 mb-3 h-px bg-border-soft" aria-hidden="true" />
              ) : (
                <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{section.label}</p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.name}>
                    <NavEntry
                      item={item}
                      rail={rail}
                      isOpen={isOpen(item.name)}
                      activeHref={active?.href}
                      activeItem={active?.item.name}
                      onToggle={() => toggleGroup(item.name)}
                      onNavigate={onCloseMobile}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Collapse control (desktop) */}
        <div className="hidden shrink-0 border-t border-border-soft p-3 lg:block">
          <button
            onClick={onToggleCollapsed}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-ivory hover:text-ink",
              rail && "justify-center px-0"
            )}
            aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
            title={rail ? "Expand sidebar" : "Collapse sidebar"}
          >
            {rail ? <PanelLeftOpen size={18} /> : <><PanelLeftClose size={18} /> Collapse</>}
          </button>
        </div>
      </aside>
    </>
  );
}

const rowBase =
  "group relative flex w-full items-center gap-3 rounded-xl text-sm font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

function NavEntry({
  item, rail, isOpen, activeHref, activeItem, onToggle, onNavigate,
}: {
  item: NavItem;
  rail: boolean;
  isOpen: boolean;
  activeHref?: string;
  activeItem?: string;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const containsActive = activeItem === item.name;

  if (!item.children) {
    const isActive = activeHref === item.href;
    return (
      <Link
        href={item.href!}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        title={rail ? item.name : undefined}
        className={cn(
          rowBase,
          rail ? "h-10 justify-center" : "h-10 px-3",
          isActive ? "bg-brand-light text-brand-dark" : "text-ink-soft hover:bg-ivory hover:text-ink"
        )}
      >
        {isActive && !rail && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-brand" aria-hidden="true" />}
        <Icon size={18} className={cn(isActive ? "text-brand" : "text-ink-soft group-hover:text-ink")} />
        {!rail && <span className="truncate">{item.name}</span>}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={rail ? undefined : isOpen}
        title={rail ? item.name : undefined}
        className={cn(
          rowBase,
          rail ? "h-10 justify-center" : "h-10 px-3",
          containsActive ? "text-ink" : "text-ink-soft hover:bg-ivory hover:text-ink",
          rail && containsActive && "bg-brand-light"
        )}
      >
        <Icon size={18} className={cn(containsActive ? "text-brand" : "text-ink-soft group-hover:text-ink")} />
        {!rail && (
          <>
            <span className="flex-1 truncate text-left">{item.name}</span>
            <ChevronDown size={15} className={cn("text-ink-soft transition-transform", isOpen && "rotate-180")} />
          </>
        )}
      </button>
      {!rail && isOpen && (
        <ul className="mb-1 ml-[21px] mt-0.5 space-y-0.5 border-l border-border-soft pl-3">
          {item.children.map((leaf) => {
            const isActive = activeHref === leaf.href;
            return (
              <li key={leaf.href}>
                <Link
                  href={leaf.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative block rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                    isActive ? "bg-brand-light font-medium text-brand-dark" : "text-ink-soft hover:bg-ivory hover:text-ink"
                  )}
                >
                  {isActive && <span className="absolute -left-[13px] top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand" aria-hidden="true" />}
                  {leaf.name}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
