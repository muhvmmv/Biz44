"use client";

import {
  createContext, useContext, useState, useEffect, useCallback, ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "./useAuth";

export interface Location {
  id: string;
  name: string;
  city: string | null;
  status: string;
  /** "factory" makes products; "store" receives stock and sells. */
  kind?: "factory" | "store";
}

interface LocationContextType {
  locations: Location[];
  activeLocationId: string;
  activeLocation: Location | null;
  setActiveLocation: (id: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
  /**
   * Whether manufacturing (production, raw materials, purchasing) applies to
   * what is on screen: the selected branch is a factory, or "all branches"
   * includes at least one factory.
   */
  manufacturing: boolean;
}

const STORAGE_KEY = "biz44_active_location";
const LocationContext = createContext<LocationContextType | undefined>(undefined);

export function LocationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [activeLocationId, setActiveLocationIdState] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const loadLocations = useCallback(async () => {
    const res = await apiFetch<{ success: boolean; data: Location[] }>("/locations");
    setLocations(res.data);

    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const valid = res.data.some((l) => l.id === stored);

    let nextActive = "all";
    if (stored === "all") {
      nextActive = "all";
    } else if (stored && valid) {
      nextActive = stored;
    } else if (res.data.length === 1) {
      nextActive = res.data[0].id;
    }

    setActiveLocationIdState(nextActive);
    
    // Sync localStorage in case the stored ID was invalid (e.g. old account or deleted branch)
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, nextActive);
    }
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      if (!user) {
        if (!active) return;
        setLocations([]);
        setLoading(false);
        if (typeof window !== "undefined") {
          localStorage.removeItem(STORAGE_KEY);
        }
        return;
      }
      try {
        await loadLocations();
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [user, loadLocations]);

  const setActiveLocation = useCallback((id: string) => {
    setActiveLocationIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
      window.dispatchEvent(new CustomEvent("biz44:location-changed", { detail: id }));
    }
  }, []);

  const activeLocation =
    activeLocationId === "all"
      ? null
      : locations.find((l) => l.id === activeLocationId) || null;

  const manufacturing = activeLocation
    ? activeLocation.kind !== "store"
    : locations.length === 0 || locations.some((l) => l.kind !== "store");

  return (
    <LocationContext.Provider
      value={{
        locations,
        activeLocationId,
        activeLocation,
        setActiveLocation,
        refresh: loadLocations,
        loading,
        manufacturing,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used within LocationProvider");
  return ctx;
}