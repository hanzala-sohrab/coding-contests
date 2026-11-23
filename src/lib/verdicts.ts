// Shared by server and client code: no imports allowed here.
export type Verdict = "pending" | "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE" | "IE";

export const VERDICT_LABELS: Record<Verdict, string> = {
  pending: "Judging…",
  AC: "Accepted",
  WA: "Wrong Answer",
  TLE: "Time Limit Exceeded",
  MLE: "Memory Limit Exceeded",
  RE: "Runtime Error",
  CE: "Compilation Error",
  IE: "Internal Error",
};
