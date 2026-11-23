import { NextResponse } from "next/server";
import { z } from "zod";
import { createRoom } from "@/lib/game";
import { withPlayer } from "@/lib/game-http";
import { parseJson } from "@/lib/http";

const Body = z.object({
  rounds: z.number().int().min(1).max(50),
  roundSeconds: z.number().int().min(10).max(3600),
});

export async function POST(req: Request) {
  return withPlayer(async (user) => {
    const parsed = await parseJson(req, Body);
    if ("error" in parsed) return parsed.error;
    const code = await createRoom(user.id, parsed.data.rounds, parsed.data.roundSeconds);
    return NextResponse.json({ code }, { status: 201 });
  });
}
