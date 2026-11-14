import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "brand";

const variants: Record<BadgeVariant, string> = {
  default: "bg-charcoal-light text-ink",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  brand: "bg-brand-light text-brand-dark",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Show a small dot before the label. */
  dot?: boolean;
}

export default function Badge({ className, variant = "default", dot, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
        variants[variant],
        className
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** One label and colour per document status, used everywhere. */
const STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Draft", variant: "default" },
  unpaid: { label: "Unpaid", variant: "warning" },
  partially_paid: { label: "Partly paid", variant: "info" },
  paid: { label: "Paid", variant: "success" },
  overdue: { label: "Overdue", variant: "danger" },
  cancelled: { label: "Cancelled", variant: "default" },
  pending: { label: "Pending", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "danger" },
  active: { label: "Active", variant: "success" },
  inactive: { label: "Inactive", variant: "default" },
  in_stock: { label: "In stock", variant: "success" },
  low_stock: { label: "Low stock", variant: "warning" },
  out_of_stock: { label: "Out of stock", variant: "danger" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? { label: status.replace(/_/g, " "), variant: "default" as BadgeVariant };
  return (
    <Badge variant={s.variant} dot className={className}>
      {s.label}
    </Badge>
  );
}
