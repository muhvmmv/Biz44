import { forwardRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, useId, cloneElement, isValidElement } from "react";
import { cn } from "@/lib/utils";

/** Shared look for every text-like control: 40px tall, rounded, orange focus ring. */
export const controlClasses =
  "w-full rounded-xl border border-border-soft bg-surface px-3 text-sm text-ink placeholder:text-ink-faint " +
  "transition-colors hover:border-border-strong focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/25 " +
  "disabled:bg-surface-muted disabled:text-ink-soft disabled:cursor-not-allowed " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(controlClasses, "h-10", className)} {...props} />
);
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(controlClasses, "h-10 pr-8", className)} {...props}>
      {children}
    </select>
  )
);
Select.displayName = "Select";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn(controlClasses, "py-2 min-h-20", className)} {...props} />
  )
);
Textarea.displayName = "Textarea";

/**
 * Label + control + hint/error. Wires the label and messages to the control
 * for screen readers. Pass exactly one control element as the child.
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: (children.props as { id?: string }).id ?? id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        required: required || (children.props as { required?: boolean }).required,
      })
    : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={(isValidElement(children) && (children.props as { id?: string }).id) || id} className="block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-danger ml-0.5" aria-hidden="true">*</span>}
      </label>
      {control}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-soft">{hint}</p>
      ) : null}
    </div>
  );
}
