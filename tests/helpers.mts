// Shared helpers for the end-to-end suites.
import { sql } from "../src/lib/db";
import type { SubmissionView } from "../src/lib/submissions";

export const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
/** Suffix for this run's usernames, so concurrent or aborted runs never collide. */
export const RUN = Date.now().toString(36).slice(-5);
export const PASSWORD = "e2e-password-123";

export const LANG = { cpp: 54, c: 50, java: 62, python: 71, js: 63, go: 60, rust: 73 };

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
const failures: string[] = [];

export function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
  }
}

export function crashed(err: unknown) {
  failures.push(`crashed: ${err instanceof Error ? err.message : err}`);
  console.error(err);
}

/** Prints the summary and sets the exit code. */
export function finish() {
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"));
    process.exitCode = 1;
  }
}

/** Deletes this run's e2e_* users with their submissions and hosted rooms. */
export async function deleteTestUsers() {
  const users = await sql<{ id: number }[]>`SELECT id FROM users WHERE username LIKE ${`e2e\\_%\\_${RUN}`}`;
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await sql`DELETE FROM submissions WHERE user_id IN ${sql(ids)}`;
    await sql`DELETE FROM users WHERE id IN ${sql(ids)}`; // cascades to rooms, players, rounds, sessions
  }
}

export class Client {
  cookie = "";
  constructor(public username: string) {}

  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(APP + path, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers, ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      redirect: "manual",
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  }

  register() {
    return this.req("POST", "/api/auth/register", { username: this.username, password: PASSWORD });
  }

  submit(problem: string, languageId: number, sourceCode: string) {
    return this.req("POST", "/api/submissions", { problem, languageId, sourceCode });
  }

  async waitVerdict(id: number, timeoutMs = 90_000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const view = (await this.req("GET", `/api/submissions/${id}`)).json as SubmissionView | null;
      if (view?.verdict && view.verdict !== "pending") return view;
      await sleep(500);
    }
    throw new Error(`submission ${id} still pending after ${timeoutMs} ms`);
  }

  /** Submits to the contest and waits for the final verdict. */
  async judge(problem: string, languageId: number, code: string): Promise<SubmissionView> {
    const r = await this.submit(problem, languageId, code);
    if (r.status !== 201) throw new Error(`${this.username}: submit ${problem} returned ${r.status} ${r.text}`);
    return this.waitVerdict((r.json as { id: number }).id);
  }
}
