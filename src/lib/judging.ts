import { sql } from "./db";
import { createRuns, getRuns, STATUS } from "./judge0";
import { getLanguage } from "./languages";
import type { Verdict } from "./verdicts";

const FINISHED = (statusId: number | null) =>
  statusId !== null && statusId !== STATUS.IN_QUEUE && statusId !== STATUS.PROCESSING;

function verdictFor(statusId: number, memory: number | null, memoryLimit: number): Verdict {
  switch (statusId) {
    case STATUS.ACCEPTED:
      return "AC";
    case STATUS.WRONG_ANSWER:
      return "WA";
    case STATUS.TIME_LIMIT:
      return "TLE";
    case STATUS.COMPILATION_ERROR:
      return "CE";
    case STATUS.INTERNAL_ERROR:
      return "IE";
    default:
      // Judge0 reports memory-limit kills as runtime errors (SIGKILL); the
      // cgroup peak sits at the limit when that happens.
      return memory !== null && memory >= memoryLimit ? "MLE" : "RE";
  }
}

/**
 * Stores a submission and queues one Judge0 run per test case.
 * Returns the new submission id. Judge0 failures mark it as IE.
 */
export async function createSubmission(args: {
  userId: number;
  problemId: number;
  languageId: number;
  sourceCode: string;
}): Promise<number> {
  const language = getLanguage(args.languageId);
  if (!language) throw new Error("Unsupported language");

  const [problem] = await sql<{ time_limit: number; memory_limit: number }[]>`
    SELECT time_limit, memory_limit FROM problems WHERE id = ${args.problemId}`;
  const tests = await sql<{ position: number; input: string; expected_output: string }[]>`
    SELECT position, input, expected_output FROM test_cases WHERE problem_id = ${args.problemId} ORDER BY position`;
  if (!problem || tests.length === 0) throw new Error("Problem has no test cases");

  const [{ id }] = await sql<{ id: number }[]>`
    INSERT INTO submissions (user_id, problem_id, language_id, source_code)
    VALUES (${args.userId}, ${args.problemId}, ${args.languageId}, ${args.sourceCode})
    RETURNING id`;
  await sql`INSERT INTO submission_tests ${sql(tests.map((t) => ({ submission_id: id, position: t.position })))}`;

  try {
    const tokens = await createRuns(
      tests.map((t) => ({
        languageId: args.languageId,
        sourceCode: args.sourceCode,
        stdin: t.input,
        expectedOutput: t.expected_output,
        cpuTimeLimit: problem.time_limit * language.timeFactor,
        memoryLimit: problem.memory_limit,
      })),
    );
    await sql.begin(async (tx) => {
      for (let i = 0; i < tests.length; i++) {
        await tx`UPDATE submission_tests SET judge0_token = ${tokens[i]}
                 WHERE submission_id = ${id} AND position = ${tests[i].position}`;
      }
    });
  } catch (err) {
    console.error(`[judging] submission ${id}: could not queue runs`, err);
    await sql`UPDATE submissions SET verdict = 'IE', judged_at = now(),
              message = 'The judge is unavailable. Please try again.' WHERE id = ${id}`;
  }
  return id;
}

/** Pulls results for pending runs from Judge0 and finalizes finished submissions. */
export async function pollOnce(): Promise<number> {
  const pending = await sql<{ submission_id: number; position: number; judge0_token: string }[]>`
    SELECT st.submission_id, st.position, st.judge0_token
    FROM submission_tests st JOIN submissions s ON s.id = st.submission_id
    WHERE s.verdict = 'pending' AND st.judge0_token IS NOT NULL
      AND (st.status_id IS NULL OR st.status_id IN (${STATUS.IN_QUEUE}, ${STATUS.PROCESSING}))
    ORDER BY st.submission_id, st.position
    LIMIT 200`;
  if (pending.length === 0) return 0;

  const results = new Map((await getRuns(pending.map((p) => p.judge0_token))).map((r) => [r.token, r]));
  const touched = new Set<number>();
  for (const p of pending) {
    const r = results.get(p.judge0_token);
    if (!r || !FINISHED(r.statusId)) continue;
    await sql`UPDATE submission_tests
              SET status_id = ${r.statusId}, time = ${r.time}, memory = ${r.memory}, compile_output = ${r.compileOutput}
              WHERE submission_id = ${p.submission_id} AND position = ${p.position}`;
    touched.add(p.submission_id);
  }
  for (const id of touched) await finalizeIfDone(id);
  return touched.size;
}

async function finalizeIfDone(submissionId: number): Promise<void> {
  const rows = await sql<
    { position: number; status_id: number | null; time: number | null; memory: number | null; compile_output: string | null; memory_limit: number }[]
  >`
    SELECT st.position, st.status_id, st.time, st.memory, st.compile_output, p.memory_limit
    FROM submission_tests st
    JOIN submissions s ON s.id = st.submission_id
    JOIN problems p ON p.id = s.problem_id
    WHERE st.submission_id = ${submissionId}
    ORDER BY st.position`;
  if (rows.length === 0 || !rows.every((r) => FINISHED(r.status_id))) return;

  // The verdict is that of the first failing test, in test order.
  const failing = rows.find((r) => r.status_id !== STATUS.ACCEPTED);
  const verdict: Verdict = failing ? verdictFor(failing.status_id!, failing.memory, failing.memory_limit) : "AC";
  const maxTime = Math.max(...rows.map((r) => r.time ?? 0));
  const maxMemory = Math.max(...rows.map((r) => r.memory ?? 0));

  await sql`UPDATE submissions SET
      verdict = ${verdict},
      failed_test = ${failing && verdict !== "CE" ? rows.indexOf(failing) + 1 : null},
      compile_output = ${verdict === "CE" ? failing!.compile_output : null},
      time = ${verdict === "CE" ? null : maxTime},
      memory = ${verdict === "CE" ? null : maxMemory},
      judged_at = now()
    WHERE id = ${submissionId} AND verdict = 'pending'`;
}

/** Starts the background poller once per server process (survives dev hot reloads). */
export function startPoller(intervalMs = 1000): void {
  const g = globalThis as { __contestPollerStarted?: boolean };
  if (g.__contestPollerStarted) return;
  g.__contestPollerStarted = true;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await pollOnce();
    } catch (err) {
      console.error("[judging] poll failed:", err instanceof Error ? err.message : err);
    } finally {
      busy = false;
    }
  }, intervalMs);
  timer.unref();
  console.log("[judging] poller started");
}
