"use client";

import { InputHTMLAttributes, forwardRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { controlClasses } from "./Input";

interface NumericInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> {
  value: number | undefined;
  onChange: (value: number) => void;
  allowDecimals?: boolean;
  min?: number;
  max?: number;
}

/**
 * Numeric input that:
 *   - Shows an empty field instead of "0" so users can type freely
 *   - Only accepts digits (and a single decimal point if allowDecimals)
 *   - Cleans up on blur
 *   - Reports a numeric value to the parent via onChange
 */
const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  (
    {
      value,
      onChange,
      allowDecimals = true,
      min,
      max,
      className,
      placeholder,
      ...props
    },
    ref
  ) => {
    const [display, setDisplay] = useState<string>(
      value === undefined || value === 0 ? "" : String(value)
    );

    // Sync when parent value changes from outside (form reset, edit prefill, etc.)
    useEffect(() => {
      const next = value === undefined || value === 0 ? "" : String(value);
      setDisplay(next);
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let v = e.target.value;

      if (allowDecimals) {
        v = v.replace(/[^0-9.]/g, "");
        const parts = v.split(".");
        if (parts.length > 2) {
          v = parts[0] + "." + parts.slice(1).join("");
        }
      } else {
        v = v.replace(/[^0-9]/g, "");
      }

      setDisplay(v);

      if (v === "" || v === ".") {
        onChange(0);
      } else {
        const num = Number(v);
        if (!isNaN(num)) onChange(num);
      }
    };

    const handleBlur = () => {
      if (display === "" || display === ".") {
        setDisplay("");
        onChange(0);
        return;
      }

      let num = Number(display);
      if (isNaN(num)) {
        setDisplay("");
        onChange(0);
        return;
      }

      if (min !== undefined && num < min) num = min;
      if (max !== undefined && num > max) num = max;

      setDisplay(String(num));
      onChange(num);
    };

    return (
      <input
        ref={ref}
        type="text"
        inputMode={allowDecimals ? "decimal" : "numeric"}
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder ?? "0"}
        className={cn(controlClasses, "h-10 tabular-nums", className)}
        {...props}
      />
    );
  }
);

NumericInput.displayName = "NumericInput";
export default NumericInput;