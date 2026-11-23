"use client";

import { useEffect, useState } from "react";
import type { SubmissionView } from "@/lib/submissions";
import { VerdictBadge } from "./verdict-badge";

/** Shows a submission and polls until it has a final verdict. */
export function SubmissionLive({ initial }: { initial: SubmissionView }) {
  const [sub, setSub] = useState(initial);

  useEffect(() => {
    if (sub.verdict !== "pending") return;
    const id = setTimeout(async () => {
      const res = await fetch(`/api/submissions/${sub.id}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) setSub(await res.json());
      else setSub((s) => ({ ...s })); // retry on the next tick
    }, 1000);
    return () => clearTimeout(id);
  }, [sub]);

  const passed = sub.tests.filter((t) => t.state === "passed").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <VerdictBadge verdict={sub.verdict} failedTest={sub.failedTest} />
        {sub.verdict !== "CE" && (
          <span className="text-sm text-zinc-500">
            {passed}/{sub.tests.length} tests passed
            {sub.time !== null && ` · ${sub.time.toFixed(2)} s`}
            {sub.memory !== null && ` · ${(sub.memory / 1024).toFixed(1)} MB`}
          </span>
        )}
      </div>

      {sub.message && <p className="text-sm text-red-600 dark:text-red-400">{sub.message}</p>}

      {sub.verdict === "CE" && sub.compileOutput && (
        <div>
          <h2 className="mb-2 text-sm font-semibold">Compiler output</h2>
          <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-900">{sub.compileOutput}</pre>
        </div>
      )}

      {sub.verdict !== "CE" && (
        <div className="flex flex-wrap gap-1.5" aria-label="Test results">
          {sub.tests.map((t) => (
            <span
              key={t.position}
              title={`Test ${t.position}${t.time !== null ? ` · ${t.time.toFixed(2)} s` : ""}`}
              className={`flex h-7 w-9 items-center justify-center rounded text-xs tabular-nums ${
                t.state === "passed"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : t.state === "failed"
                    ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                    : "animate-pulse bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
              }`}
            >
              {t.position}
            </span>
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold">Source · {sub.language}</h2>
        <pre className="max-h-[32rem] overflow-auto rounded-md bg-zinc-100 p-3 text-[13px] leading-5 dark:bg-zinc-900">{sub.sourceCode}</pre>
      </div>
    </div>
  );
}
