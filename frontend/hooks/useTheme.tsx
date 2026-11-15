"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "biz44_theme";

interface ThemeApi {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

/** The saved choice, else the system setting. */
function initialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* storage unavailable */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Light / dark theme for the app (inside /dashboard). Sets
 * <html data-theme>, remembers the choice, and fades colours on switch.
 * The attribute is removed when leaving the app, so the public pages keep
 * their own look.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => { delete document.documentElement.dataset.theme; };
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    const root = document.documentElement;
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 400);
    try { window.localStorage.setItem(KEY, t); } catch { /* storage unavailable */ }
    setThemeState(t);
  }, []);

  const api = useMemo<ThemeApi>(() => ({ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }), [theme, setTheme]);
  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  return ctx ?? { theme: "light", setTheme: () => {}, toggle: () => {} };
}

/** Colours for charts (SVG attributes can't read CSS variables reliably). */
export function useChartColors() {
  const { theme } = useTheme();
  // Neutral chrome (grid, axes); distinct series colours so charts read at a glance.
  return theme === "dark"
    ? {
        grid: "#26262D", axis: "#8E8E96", label: "#C4C4CC", tooltipBg: "#1B1B20", tooltipBorder: "#2E2E36",
        brand: "#60A5FA", strong: "#F4F4F5", mid: "#9A9AA2", muted: "#46464D",
        blue: "#60A5FA", red: "#F87171", green: "#4ADE80", amber: "#FBBF24", teal: "#2DD4BF", violet: "#A78BFA",
        palette: ["#60A5FA", "#F87171", "#F4F4F5", "#4ADE80", "#FBBF24", "#A78BFA", "#2DD4BF", "#71717A"],
      }
    : {
        grid: "#ECECEF", axis: "#8E8E96", label: "#55555C", tooltipBg: "#FFFFFF", tooltipBorder: "#E6E6EA",
        brand: "#2563EB", strong: "#1C1C1F", mid: "#7A7A82", muted: "#D4D4DA",
        blue: "#2563EB", red: "#DC2626", green: "#16A34A", amber: "#D97706", teal: "#0D9488", violet: "#7C3AED",
        palette: ["#2563EB", "#DC2626", "#1C1C1F", "#16A34A", "#D97706", "#7C3AED", "#0D9488", "#A1A1AA"],
      };
}
