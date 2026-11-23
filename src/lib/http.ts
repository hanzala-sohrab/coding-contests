import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";

export const jsonError = (status: number, error: string) => NextResponse.json({ error }, { status });

/**
 * Parses a JSON body against a schema. Requiring application/json also blocks
 * cross-site form posts (they cannot set this content type without CORS).
 */
export async function parseJson<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: NextResponse }> {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return { error: jsonError(415, "Expected application/json") };
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: jsonError(400, "Invalid JSON") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { error: jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input") };
  return { data: parsed.data };
}
