"use client";

import { useEffect, useRef } from "react";

export function RouteDialogBehavior({ focusTargetHrefPart }: { focusTargetHrefPart: string }) {
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const activeElement = document.activeElement;
    triggerRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
      ? activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      document.querySelector<HTMLAnchorElement>("[data-route-dialog-close]")?.click();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      const trigger = triggerRef.current;
      requestAnimationFrame(() => {
        if (trigger?.isConnected) {
          trigger.focus();
          return;
        }
        document.querySelector<HTMLElement>(`a[href*="${focusTargetHrefPart}"]`)?.focus();
      });
    };
  }, [focusTargetHrefPart]);

  return null;
}
