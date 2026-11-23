import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getContest, phaseOf } from "@/lib/contest";
import { sql } from "@/lib/db";
import { jsonError, parseJson } from "@/lib/http";
import { createSubmission } from "@/lib/judging";
import { getLanguage } from "@/lib/languages";

const MAX_SOURCE_BYTES = 64 * 1024;
const COOLDOWN_SECONDS = 10;

const Body = z.object({
  problem: z.string().max(100),
  languageId: z.number().int(),
  sourceCode: z.string().min(1, "Source code is empty"),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Sign in to submit");

  const parsed = await parseJson(req, Body);
  if ("error" in parsed) return parsed.error;
  const { problem: slug, languageId, sourceCode } = parsed.data;

  if (Buffer.byteLength(sourceCode, "utf8") > MAX_SOURCE_BYTES) return jsonError(413, "Source code is larger than 64 KB");
  if (!getLanguage(languageId)) return jsonError(400, "Unsupported language");

  const contest = await getContest();
  if (!user.isAdmin) {
    if (!contest) return jsonError(403, "No contest is configured");
    const phase = phaseOf(contest);
    if (phase === "before") return jsonError(403, "The contest has not started yet");
    if (phase === "ended") return jsonError(403, "The contest is over");

    const [recent] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM submissions
      WHERE user_id = ${user.id} AND game_round_id IS NULL AND created_at > now() - make_interval(secs => ${COOLDOWN_SECONDS})`;
    if (recent.n > 0) return jsonError(429, `Please wait ${COOLDOWN_SECONDS} seconds between submissions`);
  }

  const [problem] = await sql<{ id: number }[]>`SELECT id FROM problems WHERE slug = ${slug} AND pool = 'contest'`;
  if (!problem) return jsonError(404, "Unknown problem");

  const id = await createSubmission({ userId: user.id, problemId: problem.id, languageId, sourceCode });
  return NextResponse.json({ id }, { status: 201 });
}
