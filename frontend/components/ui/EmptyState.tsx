import { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shown when a list has nothing to show, or failed to load (tone="error"). */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "empty",
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "empty" | "error";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center px-6 py-14", className)} role={tone === "error" ? "alert" : undefined}>
      <div
        className={cn(
          "mb-4 flex h-12 w-12 items-center justify-center rounded-2xl",
          tone === "error" ? "bg-danger-soft text-danger" : "bg-surface-muted text-ink-soft border border-border-soft"
        )}
      >
        {icon ?? (tone === "error" ? <AlertTriangle size={22} /> : <Inbox size={22} />)}
      </div>
      <p className="font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
