"use client";

import { useEffect, useState } from "react";

/**
 * Returns a `version` number that increments every time the active location changes.
 * Include it in your `useEffect` dependency array to re-fetch.
 */
export function useLocationVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const handler = () => setVersion((v) => v + 1);
    window.addEventListener("biz44:location-changed", handler);
    return () => window.removeEventListener("biz44:location-changed", handler);
  }, []);
  return version;
}