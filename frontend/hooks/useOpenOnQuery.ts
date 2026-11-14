"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Run `onOpen` when the URL has ?<param>=1 (used by the header's "New" menu,
 * e.g. /dashboard/customers?new=1), then remove the parameter so a refresh
 * or the back button doesn't reopen it.
 */
export function useOpenOnQuery(param: string, onOpen: () => void) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const cb = useRef(onOpen);
  useEffect(() => {
    cb.current = onOpen;
  });

  useEffect(() => {
    if (searchParams.get(param) !== "1") return;
    const t = setTimeout(() => {
      cb.current();
      router.replace(pathname, { scroll: false });
    }, 0);
    return () => clearTimeout(t);
  }, [searchParams, param, pathname, router]);
}
