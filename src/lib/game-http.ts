import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, type User } from "./auth";
import { GameError } from "./game";
import { jsonError } from "./http";

/** Runs a game route as the signed-in user, mapping GameError to HTTP errors. */
export async function withPlayer(fn: (user: User) => Promise<NextResponse>): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Sign in to play");
  try {
    return await fn(user);
  } catch (err) {
    if (err instanceof GameError) return jsonError(err.status, err.message);
    throw err;
  }
}

export const ok = () => NextResponse.json({ ok: true });
