import { NextResponse } from "next/server";
import { getContest, listProblems } from "@/lib/contest";
import { jsonError } from "@/lib/http";
import { computeLeaderboard } from "@/lib/scoring";

export async function GET() {
  const contest = await getContest();
  if (!contest) return jsonError(404, "No contest is configured");
  const problems = await listProblems();
  const rows = await computeLeaderboard(contest, problems);
  return NextResponse.json(
    { problems: problems.map(({ id, label, points }) => ({ id, label, points })), rows },
    { headers: { "Cache-Control": "no-store" } },
  );
}
