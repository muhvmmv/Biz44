"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

/**
 * A number that counts up from 0 on first show, and from the old value to
 * the new one when it changes (e.g. a different period). Respects the
 * user's reduced-motion setting.
 */
export default function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString(),
  duration = 1.4,
  delay = 0,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const formatRef = useRef(format);
  useEffect(() => { formatRef.current = format; });
  const from = useRef(0);
  const [display, setDisplay] = useState(() => format(reduce ? value : 0));

  useEffect(() => {
    const controls = animate(from.current, value, {
      duration: reduce ? 0 : duration,
      delay: reduce ? 0 : delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(formatRef.current(v)),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, duration, delay, reduce]);

  return <span className={className ?? "tabular-nums"}>{display}</span>;
}
