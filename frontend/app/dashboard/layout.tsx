"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { LocationProvider, useLocation } from "@/hooks/useLocation";
import Sidebar from "@/components/shell/Sidebar";
import Header from "@/components/shell/Header";
import CommandPalette from "@/components/shell/CommandPalette";
import { Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { pageAccess } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import { Card } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { FeedbackProvider } from "@/components/ui/Feedback";

const COLLAPSED_KEY = "biz44_sidebar_collapsed";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <LocationProvider>
        <FeedbackProvider>
          <AppShell>{children}</AppShell>
        </FeedbackProvider>
      </LocationProvider>
    </ProtectedRoute>
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
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

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
      <div className="flex min-h-screen items-center justify-center bg-ivory" role="status" aria-label="Loading">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-ivory">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-xl focus:bg-surface focus:px-4 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>
      <Sidebar
        pathname={pathname}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header pathname={pathname} onOpenMenu={() => setMobileOpen(true)} onOpenSearch={() => setPaletteOpen(true)} />
        <main id="main" className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
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
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
