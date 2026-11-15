"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { LocationProvider, useLocation } from "@/hooks/useLocation";
import Sidebar, { PANEL_WIDTH, RAIL_WIDTH } from "@/components/shell/Sidebar";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ThemeProvider } from "@/hooks/useTheme";
import Header from "@/components/shell/Header";
import CommandPalette from "@/components/shell/CommandPalette";
import { ChevronRight, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { breadcrumbs, pageAccess } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import { Card } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { FeedbackProvider } from "@/components/ui/Feedback";

const COLLAPSED_KEY = "biz44_sidebar_rail";

/** True at the lg breakpoint and up (where the sidebar floats beside the content). */
function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ProtectedRoute>
        <LocationProvider>
          <FeedbackProvider>
            <AppShell>{children}</AppShell>
          </FeedbackProvider>
        </LocationProvider>
      </ProtectedRoute>
    </ThemeProvider>
  );
}

/** Sidebar + header + page area, with ⌘K / Ctrl+K / "/" search. */
function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading: locationLoading } = useLocation();
  const { user } = useAuth();
  const access = pageAccess(pathname);
  const allowed = !access || !user || can(user.permissions, access.area, access.need);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // This component only mounts in the browser (after sign-in), so reading
  // the saved preference during the first render is safe.
  // Desktop sidebar: the icon rail by default, the full panel once opened.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof window === "undefined" || window.localStorage.getItem(COLLAPSED_KEY) !== "0";
    } catch {
      return true;
    }
  });

  const isDesktop = useIsDesktop();

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try { window.localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1"); } catch { /* storage unavailable */ }
      return !c;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Wait for locations so pages never fetch with a stale location.
  if (locationLoading) {
    return (
      <div className="ambient-bg flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  const crumbs = pathname === "/dashboard" ? [] : breadcrumbs(pathname);

  return (
    <div className="ambient-bg relative h-screen overflow-hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-xl focus:bg-surface focus:px-4 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>
      <Sidebar
        pathname={pathname}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onOpenSearch={() => setPaletteOpen(true)}
      />
      <motion.div
        id="main"
        className="h-screen overflow-y-auto"
        initial={false}
        animate={{ paddingLeft: isDesktop ? (collapsed ? RAIL_WIDTH + 12 : PANEL_WIDTH + 12) : 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.9 }}
      >
        <Header pathname={pathname} roomy={collapsed} onOpenMenu={() => setMobileOpen(true)} onOpenSearch={() => setPaletteOpen(true)} />
        <main className="mx-auto w-full max-w-[1480px] px-4 pb-10 pt-2 sm:px-6 lg:px-8">
          {crumbs.length > 1 && (
            <nav aria-label="Breadcrumb" className="mb-4">
              <ol className="flex flex-wrap items-center gap-1.5 text-sm">
                {crumbs.map((c, i) => {
                  const last = i === crumbs.length - 1;
                  return (
                    <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                      {i > 0 && <ChevronRight size={14} className="text-ink-faint" aria-hidden="true" />}
                      {last || !c.href ? (
                        <span className={last ? "font-medium text-ink" : "text-ink-soft"} aria-current={last ? "page" : undefined}>{c.label}</span>
                      ) : (
                        <Link href={c.href} className="text-ink-soft hover:text-ink">{c.label}</Link>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {allowed ? children : (
                <Card>
                  <EmptyState
                    icon={<Lock size={22} />}
                    title="This page isn't available for your role"
                    description="Your role does not allow this. Ask an administrator if you need access."
                    action={<ButtonLink href="/dashboard" variant="outline">Go to dashboard</ButtonLink>}
                  />
                </Card>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </motion.div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
