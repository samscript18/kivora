"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export function ViewportPortal({ children, lockScroll = false }: { children: React.ReactNode; lockScroll?: boolean }) {
  const mounted = useSyncExternalStore(() => () => undefined, () => true, () => false);

  useEffect(() => {
    if (!lockScroll) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [lockScroll]);

  return mounted ? createPortal(children, document.body) : null;
}
