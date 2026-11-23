"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function format(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const hms = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  return d > 0 ? `${d}d ${hms}` : hms;
}

/** Counts down to `target` and refreshes the page when it is reached. */
export function Countdown({ target, label }: { target: string; label: string }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const end = new Date(target).getTime();
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= end) {
        clearInterval(id);
        router.refresh();
      }
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [target, router]);

  return (
    <span className="tabular-nums">
      {label} {now === null ? "…" : format(new Date(target).getTime() - now)}
    </span>
  );
}
