"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const GOTO_MAP: Record<string, string> = {
  o: "/",
  s: "/серия",
  a: "/actions",
  i: "/inbox",
};

export function GotoShortcuts() {
  const router = useRouter();
  const в ожиданииG = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (в ожиданииG.current) {
        в ожиданииG.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);
        const dest = GOTO_MAP[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          router.push(dest);
        }
        return;
      }

      if (e.key === "g") {
        в ожиданииG.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          в ожиданииG.current = false;
        }, 500);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [router]);

  return null;
}
