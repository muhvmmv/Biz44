"use client";

import { ReactNode, useEffect, useId } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Buttons row; rendered right-aligned under the body. */
  footer?: ReactNode;
  className?: string;
}

/**
 * Modal dialog: dimmed backdrop, closes on Escape or backdrop click,
 * full-width on phones. Use for short forms and confirmations.
 */
export default function Dialog({ open, onClose, title, description, children, footer, className }: DialogProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "bg-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-pop border border-border-soft max-h-[90vh] overflow-y-auto",
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-border-soft">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {title}
            </h2>
            {description && <div className="text-sm text-ink-soft mt-1">{description}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 -m-1 rounded-lg text-ink-soft hover:text-ink hover:bg-ivory"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-6 pb-5">{footer}</div>}
      </div>
    </div>
  );
}
