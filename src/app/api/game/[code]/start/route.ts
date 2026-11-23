import { startGame } from "@/lib/game";
import { ok, withPlayer } from "@/lib/game-http";
import { jsonError } from "@/lib/http";

export async function POST(req: Request, ctx: RouteContext<"/api/game/[code]/start">) {
  // Same CSRF guard as JSON routes: cross-site forms cannot send this content type.
  if (!req.headers.get("content-type")?.includes("application/json")) return jsonError(415, "Expected application/json");
  const { code } = await ctx.params;
  return withPlayer(async (user) => {
    await startGame(code, user.id);
    return ok();
  });
}
