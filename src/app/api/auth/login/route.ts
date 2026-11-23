import { NextResponse } from "next/server";
import { z } from "zod";
import { startSession, verifyPassword } from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError, parseJson } from "@/lib/http";

const Body = z.object({ username: z.string().max(20), password: z.string().max(200) });

export async function POST(req: Request) {
  const parsed = await parseJson(req, Body);
  if ("error" in parsed) return parsed.error;
  const { username, password } = parsed.data;

  const [user] = await sql<{ id: number; password_hash: string }[]>`
    SELECT id, password_hash FROM users WHERE lower(username) = lower(${username})`;
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return jsonError(401, "Wrong username or password");
  }
  await startSession(user.id);
  return NextResponse.json({ ok: true });
}
