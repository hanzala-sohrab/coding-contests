import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, isAdminUsername, startSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { jsonError, parseJson } from "@/lib/http";

const Body = z.object({
  username: z.string().regex(/^[A-Za-z0-9_]{3,20}$/, "Username must be 3–20 letters, digits or underscores"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function POST(req: Request) {
  const parsed = await parseJson(req, Body);
  if ("error" in parsed) return parsed.error;
  const { username, password } = parsed.data;

  const rows = await sql<{ id: number }[]>`
    INSERT INTO users (username, password_hash, is_admin)
    VALUES (${username}, ${await hashPassword(password)}, ${isAdminUsername(username)})
    ON CONFLICT DO NOTHING RETURNING id`;
  if (rows.length === 0) return jsonError(409, "That username is taken");

  await startSession(rows[0].id);
  return NextResponse.json({ ok: true }, { status: 201 });
}
