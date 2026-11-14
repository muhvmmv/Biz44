"use client";

import { useState, useRef, useEffect } from "react";
import { MapPin, ChevronDown, Check, Plus } from "lucide-react";
import Link from "next/link";
import { useLocation } from "@/hooks/useLocation";

export default function LocationSelector() {
  const { locations, activeLocationId, activeLocation, setActiveLocation, loading } = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (loading) {
    return <div className="h-9 w-40 rounded-lg bg-charcoal-light animate-pulse" />;
  }


  const label = activeLocationId === "all" ? "All Branches" : activeLocation?.name || "Select location";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ivory border border-border-soft text-sm text-ink hover:border-brand transition"
      >
        <MapPin size={14} className="text-brand-dark" />
        <span className="font-medium">{label}</span>
        <ChevronDown size={14} className="text-ink-soft" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-border-soft rounded-lg shadow-lg py-1 z-50">
          <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-soft">
            Switch Location
          </div>

          <button
            onClick={() => { setActiveLocation("all"); setOpen(false); window.location.reload();}}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-ivory ${
              activeLocationId === "all" ? "text-brand-dark font-medium" : "text-ink"
            }`}
          >
            <span>All Branches</span>
            {activeLocationId === "all" && <Check size={14} />}
          </button>

          {locations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => { setActiveLocation(loc.id); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-ivory ${
                activeLocationId === loc.id ? "text-brand-dark font-medium" : "text-ink"
              }`}
            >
              <div className="text-left">
                <div>{loc.name}</div>
                {loc.city && <div className="text-xs text-ink-soft">{loc.city}</div>}
              </div>
              {activeLocationId === loc.id && <Check size={14} />}
            </button>
          ))}

          <div className="border-t border-border-soft mt-1 pt-1">
            <Link
              href="/dashboard/settings/locations"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-ink-soft hover:bg-ivory hover:text-brand-dark"
            >
              <Plus size={14} /> Manage Branches
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}