"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue,
} from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Moon, Search, Sun } from "lucide-react";
import { NavItem, NavLeaf, matchNav, visibleNav } from "@/lib/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "@/hooks/useLocation";
import { useTheme } from "@/hooks/useTheme";
import { navBadges, useAlerts } from "@/hooks/useAlerts";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface SidebarProps {
  pathname: string;
  /** Desktop: true = the floating icon rail, false = the full panel. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenSearch: () => void;
}

const spring = { type: "spring" as const, stiffness: 320, damping: 32, mass: 0.9 };
export const RAIL_WIDTH = 76;
export const PANEL_WIDTH = 284;

/**
 * Floating glass sidebar.
 *  - Rail: colourful app-icon tiles that magnify under the pointer (dock
 *    style), with a name tooltip and badge; a group's pages pop out beside it.
 *  - Panel: the arrow opens the full sidebar with sections, search, badges,
 *    the theme switch and the account card.
 *  - Phones/tablets: the panel slides in as a drawer.
 */
export default function Sidebar({ pathname, collapsed, onToggleCollapsed, mobileOpen, onCloseMobile, onOpenSearch }: SidebarProps) {
  const { user } = useAuth();
  const { manufacturing } = useLocation();
  const nav = visibleNav(user?.permissions, manufacturing);
  const active = matchNav(pathname);
  const badges = navBadges(useAlerts(pathname));

  return (
    <>
      {/* Desktop */}
      <motion.aside
        aria-label="Main navigation"
        initial={false}
        animate={{ width: collapsed ? RAIL_WIDTH : PANEL_WIDTH }}
        transition={spring}
        className="fixed bottom-3 left-3 top-3 z-40 hidden flex-col lg:flex"
      >
        {collapsed ? (
          <Rail nav={nav} active={active} badges={badges} onExpand={onToggleCollapsed} onOpenSearch={onOpenSearch} />
        ) : (
          <Panel nav={nav} active={active} badges={badges} onCollapse={onToggleCollapsed} onOpenSearch={onOpenSearch} onNavigate={() => {}} />
        )}
      </motion.aside>

      {/* Phones and tablets */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              aria-hidden="true"
            />
            <motion.aside
              key="drawer"
              aria-label="Main navigation"
              className="fixed bottom-3 left-3 top-3 z-50 flex w-[min(284px,calc(100vw-24px))] flex-col lg:hidden"
              initial={{ x: -320, opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0.6 }}
              transition={spring}
            >
              <Panel nav={nav} active={active} badges={badges} onCollapse={onCloseMobile} onOpenSearch={() => { onCloseMobile(); onOpenSearch(); }} onNavigate={onCloseMobile} mobile />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

type Active = ReturnType<typeof matchNav>;

function LogoTile({ size = 44 }: { size?: number }) {
  return (
    <span
      className="app-icon flex shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-orange-400 via-orange-500 to-orange-700 font-extrabold tracking-tight text-white"
      style={{ width: size, height: size, fontSize: size * 0.32 }}
      aria-hidden="true"
    >
      B44
    </span>
  );
}


// =====================================================================
// Rail
// =====================================================================
interface Pop { kind: "tooltip" | "menu"; key: string; top: number; label: string; badge?: number; leaves?: NavLeaf[]; tint?: string; Icon?: NavItem["icon"] }

function Rail({ nav, active, badges, onExpand, onOpenSearch }: {
  nav: ReturnType<typeof visibleNav>; active: Active; badges: Record<string, number>; onExpand: () => void; onOpenSearch: () => void;
}) {
  const router = useRouter();
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  const mouseY = useMotionValue(Infinity);
  const [pop, setPop] = useState<Pop | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  // Close an open pop-out menu on outside click or Escape.
  useEffect(() => {
    if (pop?.kind !== "menu") return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-rail-pop]") && !t.closest("[data-rail-icon]")) setPop(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPop(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [pop?.kind]);

  const show = (p: Pop) => setPop((cur) => (cur?.kind === "menu" && p.kind === "tooltip" ? cur : p));
  const hideTooltip = () => setPop((cur) => (cur?.kind === "tooltip" ? null : cur));
  const rect = (el: HTMLElement) => el.getBoundingClientRect();

  return (
    <div ref={railRef} className="relative flex h-full flex-col justify-between gap-3">
      {/* Cluster 1: brand + search */}
      <div className="glass relative flex flex-col items-center gap-3 rounded-[26px] py-3.5">
      <Link href="/dashboard" aria-label="Biz44 home" className="relative">
        <LogoTile />
      </Link>
      <motion.button
        type="button"
        onClick={onExpand}
        aria-label="Open sidebar"
        whileHover={{ scale: 1.12 }}
        whileTap={{ scale: 0.92 }}
        className="glass-strong absolute -right-3 top-5 flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:text-ink"
      >
        <ChevronRight size={15} />
      </motion.button>

      <button
        type="button"
        onClick={onOpenSearch}
        data-rail-icon
        aria-label="Search"
        onMouseEnter={(e) => show({ kind: "tooltip", key: "search", top: rect(e.currentTarget).top + rect(e.currentTarget).height / 2, label: "Search  ⌘K" })}
        onMouseLeave={hideTooltip}
        className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-border-soft bg-surface/80 text-ink-soft shadow-card transition-colors hover:text-ink"
      >
        <Search size={18} />
      </button>
      </div>

      {/* Cluster 2: pages */}
      <div className="glass flex min-h-0 flex-col rounded-[28px]">
      <nav
        className="no-scrollbar flex w-full min-h-0 flex-col items-center gap-1.5 overflow-y-auto overflow-x-hidden px-2 py-3"
        onMouseMove={(e) => mouseY.set(e.clientY)}
        onMouseLeave={() => { mouseY.set(Infinity); hideTooltip(); }}
      >
        {nav.map((section, si) => (
          <div key={section.label} className="flex flex-col items-center gap-1.5">
            {si > 0 && <div className="my-1.5 h-px w-6 bg-border-soft" aria-hidden="true" />}
            {section.items.map((item) => {
              const isActive = active?.item.name === item.name;
              const badge = badges[item.name] ?? 0;
              return (
                <DockIcon
                  key={item.name}
                  item={item}
                  mouseY={mouseY}
                  active={isActive}
                  badge={badge}
                  open={pop?.kind === "menu" && pop.key === item.name}
                  onHover={(el) => show({ kind: "tooltip", key: item.name, top: rect(el).top + rect(el).height / 2, label: item.name, badge })}
                  onLeave={hideTooltip}
                  onClick={(el) => {
                    if (item.children) {
                      setPop((cur) => (cur?.kind === "menu" && cur.key === item.name ? null : {
                        kind: "menu", key: item.name, top: rect(el).top, label: item.name, leaves: item.children, Icon: item.icon,
                      }));
                    } else if (item.href) {
                      setPop(null);
                      router.push(item.href);
                    }
                  }}
                />
              );
            })}
          </div>
        ))}
      </nav>
      </div>

      {/* Cluster 3: theme + sign out */}
      <div className="glass flex flex-col items-center gap-2.5 rounded-[26px] py-3.5">
        <button
          type="button"
          onClick={toggle}
          data-rail-icon
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onMouseEnter={(e) => show({ kind: "tooltip", key: "theme", top: rect(e.currentTarget).top + rect(e.currentTarget).height / 2, label: theme === "dark" ? "Light mode" : "Dark mode" })}
          onMouseLeave={hideTooltip}
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[13px] border border-border-soft bg-surface text-ink shadow-card transition-colors hover:bg-surface-muted"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={theme} initial={{ rotate: -90, scale: 0.4, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} exit={{ rotate: 90, scale: 0.4, opacity: 0 }} transition={{ duration: 0.25 }}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </motion.span>
          </AnimatePresence>
        </button>
        <button
          type="button"
          data-rail-icon
          aria-label="Sign out"
          onClick={() => logout()}
          onMouseEnter={(e) => show({ kind: "tooltip", key: "logout", top: rect(e.currentTarget).top + rect(e.currentTarget).height / 2, label: "Sign out" })}
          onMouseLeave={hideTooltip}
          className="flex h-10 w-10 items-center justify-center rounded-[13px] border border-border-soft bg-surface text-ink-soft shadow-card transition-colors hover:bg-danger-soft hover:text-danger"
        >
          <LogOut size={18} />
        </button>
      </div>

      {/* Tooltips and pop-out menus (fixed, so the scrolling list doesn't clip them) */}
      <AnimatePresence>
        {pop?.kind === "tooltip" && (
          <motion.div
            key={`tip-${pop.key}`}
            initial={{ opacity: 0, x: -6, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -6, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className="glass-strong pointer-events-none fixed z-[60] flex -translate-y-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-ink"
            style={{ top: pop.top, left: RAIL_WIDTH + 22 }}
            role="tooltip"
          >
            {pop.label}
            {!!pop.badge && <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{pop.badge} new</span>}
          </motion.div>
        )}
        {pop?.kind === "menu" && pop.leaves && (
          <motion.div
            key={`menu-${pop.key}`}
            data-rail-pop
            className="fixed z-[60] flex flex-col items-start gap-2"
            style={{ top: Math.max(12, Math.min(pop.top - 6, window.innerHeight - pop.leaves.length * 52 - 12)), left: RAIL_WIDTH + 24 }}
            initial="hidden"
            animate="show"
            exit="hidden"
            variants={{ show: { transition: { staggerChildren: 0.045 } }, hidden: { transition: { staggerChildren: 0.03, staggerDirection: -1 } } }}
          >
            {pop.leaves.map((leaf, i) => {
              const isActive = active?.href === leaf.href;
              const Icon = pop.Icon!;
              return (
                <motion.div
                  key={leaf.href}
                  variants={{
                    hidden: { opacity: 0, x: -14, scale: 0.9, rotate: -2 },
                    show: { opacity: 1, x: i % 2 ? 6 : 0, scale: 1, rotate: i % 2 ? 1.5 : -1, transition: spring },
                  }}
                >
                  <Link
                    href={leaf.href}
                    onClick={() => setPop(null)}
                    className={cn(
                      "glass-strong flex items-center gap-3 rounded-2xl py-2 pl-2 pr-5 text-sm font-semibold text-ink transition-transform hover:-translate-y-0.5 hover:rotate-0",
                      isActive && "ring-2 ring-charcoal/70"
                    )}
                  >
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-[10px]", isActive ? "bg-charcoal text-ivory" : "border border-border-soft bg-surface text-ink")}>
                      <Icon size={15} />
                    </span>
                    {leaf.name}
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A rail tile that grows as the pointer gets close (like a dock). */
function DockIcon({ item, mouseY, active, badge, open, onHover, onLeave, onClick }: {
  item: NavItem; mouseY: MotionValue<number>; active: boolean; badge: number; open: boolean;
  onHover: (el: HTMLElement) => void; onLeave: () => void; onClick: (el: HTMLElement) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const distance = useTransform(mouseY, (y) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? y - (r.top + r.height / 2) : Infinity;
  });
  const sizeRaw = useTransform(distance, [-110, 0, 110], [44, reduce ? 44 : 56, 44]);
  const size = useSpring(sizeRaw, { stiffness: 380, damping: 26, mass: 0.2 });
  const iconSize = useTransform(size, [44, 56], [19, 24]);
  const Icon = item.icon;

  const handle = useCallback(() => ref.current && onClick(ref.current), [onClick]);

  return (
    <div className="relative flex w-full items-center justify-center">
      {/* Active marker */}
      <AnimatePresence>
        {active && (
          <motion.span
            layoutId="rail-active"
            className="absolute left-0 h-1.5 w-1.5 rounded-full bg-ink"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
      <motion.button
        ref={ref}
        type="button"
        data-rail-icon
        aria-label={item.name}
        aria-current={active ? "page" : undefined}
        aria-expanded={item.children ? open : undefined}
        onClick={handle}
        onMouseEnter={(e) => onHover(e.currentTarget)}
        onMouseLeave={onLeave}
        onFocus={(e) => onHover(e.currentTarget)}
        onBlur={onLeave}
        whileTap={{ scale: 0.9 }}
        style={{ width: size, height: size }}
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-[14px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
          active || open
            ? "bg-charcoal text-ivory shadow-raised"
            : "border border-border-soft bg-surface text-ink-soft shadow-card hover:text-ink"
        )}
      >
        <motion.span style={{ width: iconSize, height: iconSize }} className="flex items-center justify-center">
          <Icon className="h-full w-full" strokeWidth={1.9} />
        </motion.span>
        <AnimatePresence>
          {badge > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 18 }}
              className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow ring-2 ring-white/80"
            >
              {badge > 99 ? "99+" : badge}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

// =====================================================================
// Panel (expanded)
// =====================================================================
function Panel({ nav, active, badges, onCollapse, onOpenSearch, onNavigate, mobile }: {
  nav: ReturnType<typeof visibleNav>; active: Active; badges: Record<string, number>;
  onCollapse: () => void; onOpenSearch: () => void; onNavigate: () => void; mobile?: boolean;
}) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState<Set<string>>(() => new Set(active?.leaf ? [active.item.name] : []));
  const cluster = mobile ? "glass-strong" : "glass";
  const toggleGroup = (name: string) => setOpen((s) => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n; });

  return (
    <motion.div
      className="relative flex h-full min-w-0 flex-col justify-between gap-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: mobile ? 0 : 0.08, duration: 0.2 } }}
    >
      {/* Cluster 1: workspace + search */}
      <div className={cn(cluster, "relative rounded-[26px] pb-3")}>
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <Link href="/dashboard" onClick={onNavigate} aria-label="Biz44 home"><LogoTile size={42} /></Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold leading-tight text-ink">{user?.companyName || "Biz44"}</p>
          <p className="truncate text-xs text-ink-soft">Biz44 workspace</p>
        </div>
        {user?.role && (
          <span className="rounded-full bg-charcoal px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ivory">
            {user.role === "admin" ? "Admin" : ROLE_LABELS[user.role] ?? user.role}
          </span>
        )}
      </div>
      <motion.button
        type="button"
        onClick={onCollapse}
        aria-label={mobile ? "Close menu" : "Collapse sidebar"}
        whileHover={{ scale: 1.12 }}
        whileTap={{ scale: 0.92 }}
        className="glass-strong absolute -right-3 top-5 flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:text-ink"
      >
        <ChevronLeft size={15} />
      </motion.button>

      <div className="px-3">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-10 w-full items-center gap-2 rounded-2xl border border-border-soft bg-surface/70 px-3 text-sm text-ink-faint shadow-card transition-colors hover:border-border-strong"
        >
          <Search size={16} />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded-md bg-surface-muted px-1.5 text-[11px] text-ink-soft">⌘K</kbd>
        </button>
      </div>
      </div>

      {/* Cluster 2: pages */}
      <div className={cn(cluster, "flex min-h-0 flex-col rounded-[28px]")}>
      <nav className="no-scrollbar min-h-0 overflow-y-auto px-3 pb-3 pt-1">
        {nav.map((section) => (
          <div key={section.label} className="mt-3">
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{section.label}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const containsActive = active?.item.name === item.name;
                const isOpen = open.has(item.name);
                const badge = badges[item.name] ?? 0;
                const Icon = item.icon;
                const row = (
                  <>
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] transition-colors", containsActive ? "bg-charcoal text-ivory" : "border border-border-soft bg-surface text-ink-soft")}>
                      <Icon size={16} strokeWidth={1.9} />
                    </span>
                    <span className="flex-1 truncate text-left">{item.name}</span>
                    {badge > 0 && <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{badge}</span>}
                    {item.children && <ChevronDown size={15} className={cn("text-ink-faint transition-transform duration-200", isOpen && "rotate-180")} />}
                  </>
                );
                const rowClass = cn(
                  "relative flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-sm font-semibold transition-colors",
                  containsActive ? "text-ink" : "text-ink-soft hover:text-ink"
                );
                return (
                  <li key={item.name}>
                    {item.children ? (
                      <button type="button" onClick={() => toggleGroup(item.name)} aria-expanded={isOpen} className={cn(rowClass, "hover:bg-surface/60")}>
                        {containsActive && !isOpen && <ActiveBg />}
                        <span className="relative flex w-full items-center gap-3">{row}</span>
                      </button>
                    ) : (
                      <Link href={item.href!} onClick={onNavigate} aria-current={containsActive ? "page" : undefined} className={cn(rowClass, "hover:bg-surface/60")}>
                        {containsActive && <ActiveBg />}
                        <span className="relative flex w-full items-center gap-3">{row}</span>
                      </Link>
                    )}
                    <AnimatePresence initial={false}>
                      {item.children && isOpen && (
                        <motion.ul
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                          className="overflow-hidden"
                        >
                          {item.children.map((leaf) => {
                            const isActive = active?.href === leaf.href;
                            return (
                              <li key={leaf.href}>
                                <Link
                                  href={leaf.href}
                                  onClick={onNavigate}
                                  aria-current={isActive ? "page" : undefined}
                                  className={cn(
                                    "relative ml-[26px] flex items-center gap-2.5 rounded-xl py-1.5 pl-4 pr-2 text-[13px] transition-colors",
                                    isActive ? "font-semibold text-ink" : "text-ink-soft hover:text-ink"
                                  )}
                                >
                                  {isActive && <ActiveBg />}
                                  <span className={cn("relative h-1.5 w-1.5 rounded-full", isActive ? "bg-charcoal" : "bg-border-strong")} aria-hidden="true" />
                                  <span className="relative">{leaf.name}</span>
                                </Link>
                              </li>
                            );
                          })}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      </div>

      {/* Cluster 3: dark mode + sign out */}
      <div className={cn(cluster, "space-y-1 rounded-[26px] p-2")}>
        <div className="flex items-center gap-3 rounded-2xl px-2 py-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-border-soft bg-surface text-ink-soft">
            {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
          </span>
          <span className="flex-1 text-sm font-semibold text-ink">Dark mode</span>
          <Switch on={theme === "dark"} onChange={(on) => setTheme(on ? "dark" : "light")} label="Dark mode" />
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="group flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition-colors hover:bg-danger-soft"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-border-soft bg-surface text-ink-soft group-hover:text-danger">
            <LogOut size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink group-hover:text-danger">Sign out</span>
            <span className="block truncate text-xs text-ink-soft">{user?.email}</span>
          </span>
        </button>
      </div>
    </motion.div>
  );
}

/** The soft highlight behind the current page, sliding between rows. */
function ActiveBg() {
  return (
    <motion.span
      layoutId="panel-active"
      transition={spring}
      className="absolute inset-0 rounded-2xl bg-surface shadow-raised ring-1 ring-border-soft/60"
      aria-hidden="true"
    />
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative flex h-6 w-11 items-center rounded-full p-0.5 transition-colors", on ? "bg-charcoal justify-end" : "bg-border-strong justify-start")}
    >
      <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 32 }} className="h-5 w-5 rounded-full bg-ivory shadow" />
    </button>
  );
}
