import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getGameState } from "@/lib/game-state";
import { jsonError } from "@/lib/http";

export async function GET(_req: Request, ctx: RouteContext<"/api/game/[code]/state">) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Sign in to play");
  const state = await getGameState((await ctx.params).code, user.id);
  if (!state) return jsonError(404, "No such room");
  return NextResponse.json({ ...state, serverNow: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
