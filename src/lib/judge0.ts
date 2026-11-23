// Minimal Judge0 CE client. Always uses base64: compiler output often contains
// non-ASCII (e.g. GCC's quotes), which Judge0 refuses to return otherwise.

const JUDGE0_URL = (process.env.JUDGE0_URL ?? "http://127.0.0.1:2358").replace(/\/$/, "");

// Judge0 defaults (judge0.conf): MAX_SUBMISSION_BATCH_SIZE=20,
// MAX_CPU_TIME_LIMIT=15, MAX_WALL_TIME_LIMIT=20, MAX_MEMORY_LIMIT=512000,
// MAX_MAX_FILE_SIZE=4096.
export const BATCH_SIZE = 20;
const MAX_CPU = 15;
const MAX_WALL = 20;
const MAX_MEMORY = 512000;
// Caps stdout size. Judge0 defaults to 1024 KB, which large outputs exceed.
const MAX_OUTPUT_KB = 4096;

export const STATUS = {
  IN_QUEUE: 1,
  PROCESSING: 2,
  ACCEPTED: 3,
  WRONG_ANSWER: 4,
  TIME_LIMIT: 5,
  COMPILATION_ERROR: 6,
  INTERNAL_ERROR: 13,
} as const;

export type RunRequest = {
  languageId: number;
  sourceCode: string;
  stdin: string;
  expectedOutput: string;
  cpuTimeLimit: number; // seconds
  memoryLimit: number; // KB
};

export type RunResult = {
  token: string;
  statusId: number;
  time: number | null;
  memory: number | null;
  compileOutput: string | null;
};

const enc = (s: string) => Buffer.from(s, "utf8").toString("base64");
const dec = (s: string | null | undefined) =>
  s == null ? null : Buffer.from(s, "base64").toString("utf8");

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function request(path: string, init?: RequestInit) {
  const res = await fetch(JUDGE0_URL + path, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Judge0 ${init?.method ?? "GET"} ${path.split("?")[0]} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Queues runs and returns one token per run, in order. */
export async function createRuns(runs: RunRequest[]): Promise<string[]> {
  const tokens: string[] = [];
  for (const part of chunk(runs, BATCH_SIZE)) {
    const body = {
      submissions: part.map((r) => {
        const cpu = Math.min(r.cpuTimeLimit, MAX_CPU);
        return {
          language_id: r.languageId,
          source_code: enc(r.sourceCode),
          stdin: enc(r.stdin),
          expected_output: enc(r.expectedOutput),
          cpu_time_limit: cpu,
          wall_time_limit: Math.min(cpu * 3 + 2, MAX_WALL),
          memory_limit: Math.min(r.memoryLimit, MAX_MEMORY),
          max_file_size: MAX_OUTPUT_KB,
        };
      }),
    };
    const data = (await request("/submissions/batch?base64_encoded=true", {
      method: "POST",
      body: JSON.stringify(body),
    })) as Array<{ token?: string } & Record<string, unknown>>;
    for (const item of data) {
      if (!item.token) throw new Error(`Judge0 rejected a run: ${JSON.stringify(item)}`);
      tokens.push(item.token);
    }
  }
  return tokens;
}

/** Fetches current state of the given runs. */
export async function getRuns(tokens: string[]): Promise<RunResult[]> {
  const out: RunResult[] = [];
  for (const part of chunk(tokens, BATCH_SIZE)) {
    const data = (await request(
      `/submissions/batch?tokens=${part.join(",")}&base64_encoded=true&fields=token,status_id,time,memory,compile_output`,
    )) as {
      submissions: Array<{
        token: string;
        status_id: number;
        time: string | null;
        memory: number | null;
        compile_output: string | null;
      } | null>;
    };
    for (const s of data.submissions) {
      if (!s) continue;
      out.push({
        token: s.token,
        statusId: s.status_id,
        time: s.time == null ? null : Number(s.time),
        memory: s.memory,
        compileOutput: dec(s.compile_output),
      });
    }
  }
  return out;
}

export async function judge0Healthy(): Promise<boolean> {
  try {
    await request("/about");
    return true;
  } catch {
    return false;
  }
}
