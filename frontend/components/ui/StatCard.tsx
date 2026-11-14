import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

type Tone = "default" | "positive" | "negative" | "warning";

const toneClass: Record<Tone, string> = {
  default: "text-ink",
  positive: "text-success",
  negative: "text-danger",
  warning: "text-warning",
};

/** A labelled figure in a card: the basic building block of summary rows. */
export default function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-ink-soft">{label}</p>
          {icon && <span className="text-ink-soft shrink-0">{icon}</span>}
        </div>
        <p className={cn("text-xl sm:text-2xl font-bold mt-1 tabular-nums break-words", toneClass[tone])}>{value}</p>
        {hint && <p className="text-xs text-ink-soft mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}
