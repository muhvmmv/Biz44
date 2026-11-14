import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "brand";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export default function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "bg-navy-light text-navy",
    success: "bg-[#E6F0EA] text-success",
    warning: "bg-[#F7EEDC] text-warning",
    danger: "bg-[#F4E2E1] text-danger",
    info: "bg-[#E3EBF1] text-info",
    brand: "bg-rose-light text-rose-vale",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}