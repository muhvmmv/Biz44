"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import Link, { LinkProps } from "next/link";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const base =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-semibold rounded-xl transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface " +
  "disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:shrink-0";

const variants: Record<ButtonVariant, string> = {
  /** The one main action on a screen. */
  primary: "bg-charcoal text-white hover:bg-charcoal-dark",
  /** A highlighted secondary action in the brand colour. */
  secondary: "bg-brand-light text-brand-dark hover:bg-orange-100",
  /** Neutral actions next to a primary button. */
  outline: "border border-border-soft bg-surface text-ink hover:bg-ivory hover:border-border-strong",
  /** Low-emphasis actions, toolbars, icon buttons. */
  ghost: "text-ink-soft hover:bg-ivory hover:text-ink",
  /** Destructive confirmations. */
  danger: "bg-danger text-white hover:bg-red-800",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "h-10 w-10",
  "icon-sm": "h-8 w-8",
};

/** Class names for anything that should look like a button. */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const Spinner = () => (
  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, children, ...props }, ref) => (
    <button
      ref={ref}
      className={buttonClasses(variant, size, className)}
      disabled={isLoading || props.disabled}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading && <Spinner />}
      {children}
    </button>
  )
);
Button.displayName = "Button";

/** A link styled as a button (never put a <button> inside a <Link>). */
export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: LinkProps & { variant?: ButtonVariant; size?: ButtonSize; className?: string; children: React.ReactNode; title?: string }) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

export default Button;
