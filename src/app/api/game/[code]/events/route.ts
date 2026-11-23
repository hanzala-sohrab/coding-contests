import { getCurrentUser } from "@/lib/auth";
import { getGameState } from "@/lib/game-state";
import { jsonError } from "@/lib/http";

const TICK_MS = 400;
const HEARTBEAT_MS = 15_000;

/**
 * Server-sent events: pushes the room state whenever it changes. Each event
 * carries `serverNow` so clients can correct for clock skew in countdowns.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/game/[code]/events">) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Sign in to play");
  const code = (await ctx.params).code;
  if (!(await getGameState(code, user.id))) return jsonError(404, "No such room");

  const encoder = new TextEncoder();
  let closed = false;
  req.signal.addEventListener("abort", () => (closed = true));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      let last = "";
      let lastSent = 0;
      while (!closed) {
        try {
          const state = await getGameState(code, user.id);
          if (!state) {
            send("event: gone\ndata: {}\n\n");
            break;
          }
          const json = JSON.stringify(state);
          if (json !== last) {
            last = json;
            lastSent = Date.now();
            send(`data: ${JSON.stringify({ ...state, serverNow: new Date().toISOString() })}\n\n`);
          } else if (Date.now() - lastSent > HEARTBEAT_MS) {
            lastSent = Date.now();
            send(": ping\n\n");
          }
        } catch (err) {
          console.error("[game] events:", err instanceof Error ? err.message : err);
        }
        await new Promise((r) => setTimeout(r, TICK_MS));
      }
      try {
        controller.close();
      } catch {}
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
