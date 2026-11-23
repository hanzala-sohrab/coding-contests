import { NextResponse } from "next/server";
import { z } from "zod";
import { openRoundFor } from "@/lib/game";
import { withPlayer } from "@/lib/game-http";
import { jsonError, parseJson } from "@/lib/http";
import { createSubmission } from "@/lib/judging";
import { getLanguage } from "@/lib/languages";

const MAX_SOURCE_BYTES = 64 * 1024;

const Body = z.object({
  languageId: z.number().int(),
  sourceCode: z.string().min(1, "Source code is empty"),
});

export async function POST(req: Request, ctx: RouteContext<"/api/game/[code]/submit">) {
  const { code } = await ctx.params;
  return withPlayer(async (user) => {
    const parsed = await parseJson(req, Body);
    if ("error" in parsed) return parsed.error;
    const { languageId, sourceCode } = parsed.data;
    if (Buffer.byteLength(sourceCode, "utf8") > MAX_SOURCE_BYTES) return jsonError(413, "Source code is larger than 64 KB");
    if (!getLanguage(languageId)) return jsonError(400, "Unsupported language");

    const { roundId, problemId } = await openRoundFor(code, user.id);
    const id = await createSubmission({ userId: user.id, problemId, languageId, sourceCode, gameRoundId: roundId });
    return NextResponse.json({ id }, { status: 201 });
  });
}
