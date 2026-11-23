export async function register() {
  // Run the judge poller only in the Node.js server, never during `next build`.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { startPoller } = await import("./lib/judging");
  startPoller();
}
