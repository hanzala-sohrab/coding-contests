import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { cache } from "react";
import { sql } from "./db";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const COOKIE = "contest_session";
const SESSION_DAYS = 7;

export type User = { id: number; username: string; isAdmin: boolean };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function startSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${sha256(token)}, ${userId}, ${expires})`;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    expires,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${sha256(token)}`;
  jar.delete(COOKIE);
}

/** The signed-in user for this request, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await sql<{ id: number; username: string; is_admin: boolean }[]>`
    SELECT u.id, u.username, u.is_admin
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${sha256(token)} AND s.expires_at > now()`;
  return row ? { id: row.id, username: row.username, isAdmin: row.is_admin } : null;
});

export function isAdminUsername(username: string): boolean {
  return (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(username.toLowerCase());
}
