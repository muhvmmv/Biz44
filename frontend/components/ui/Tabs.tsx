"use client";

import { cn } from "@/lib/utils";

/** Pill-style segmented control for switching views or filters. */
export default function Tabs<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="tablist" className={cn("inline-flex max-w-full overflow-x-auto rounded-full border border-border-soft bg-surface p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm",
              active ? "bg-charcoal text-white" : "text-ink-soft hover:text-ink"
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-white/20" : "bg-charcoal-light")}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
