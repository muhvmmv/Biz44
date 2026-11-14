"use client";

import { ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Button that opens a floating panel. Closes on outside click, Escape, or
 * when an item is chosen. Arrow keys move between items with role="menuitem".
 */
export default function DropdownMenu({
  trigger,
  triggerLabel,
  triggerClassName,
  children,
  align = "right",
  width = "w-56",
  panelClassName,
}: {
  trigger: ReactNode;
  /** Accessible name when the trigger is icon-only. */
  triggerLabel?: string;
  triggerClassName?: string;
  /** Panel contents; a function receives `close`. */
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right";
  width?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        if (items.length === 0) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next].focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={triggerLabel}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={id}
          ref={panelRef}
          role="menu"
          className={cn(
            "absolute top-full z-50 mt-2 rounded-2xl border border-border-soft bg-surface p-1.5 shadow-pop",
            align === "right" ? "right-0" : "left-0",
            width,
            panelClassName
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

const itemClasses =
  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-ink transition-colors " +
  "hover:bg-ivory focus:bg-ivory focus:outline-none [&_svg]:text-ink-soft";

/** A menu row that navigates. */
export function MenuLink({ href, children, onSelect, className }: { href: string; children: ReactNode; onSelect?: () => void; className?: string }) {
  return (
    <Link href={href} role="menuitem" onClick={onSelect} className={cn(itemClasses, className)}>
      {children}
    </Link>
  );
}

/** A menu row that runs an action. */
export function MenuButton({ onClick, children, className, danger }: { onClick: () => void; children: ReactNode; className?: string; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={cn(itemClasses, danger && "text-danger [&_svg]:text-danger", className)}>
      {children}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{children}</p>;
}

export function MenuDivider() {
  return <div className="my-1.5 h-px bg-border-soft" role="separator" />;
}
