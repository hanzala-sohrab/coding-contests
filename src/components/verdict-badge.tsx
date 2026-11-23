import { VERDICT_LABELS, type Verdict } from "@/lib/verdicts";

const STYLES: Record<Verdict, string> = {
  pending: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  AC: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  WA: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  TLE: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  MLE: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  RE: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  CE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  IE: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200",
};

export function VerdictBadge({ verdict, failedTest }: { verdict: Verdict; failedTest?: number | null }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STYLES[verdict]}`}>
      {VERDICT_LABELS[verdict]}
      {failedTest ? ` on test ${failedTest}` : ""}
    </span>
  );
}
