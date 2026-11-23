import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { getSubmissionView } from "@/lib/submissions";

export async function GET(_req: Request, ctx: RouteContext<"/api/submissions/[id]">) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Sign in to view submissions");
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return jsonError(404, "Not found");

  const view = await getSubmissionView(id, user);
  // Same response for "missing" and "someone else's", so ids can't be probed.
  if (!view) return jsonError(404, "Not found");
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
