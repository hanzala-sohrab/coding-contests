import "server-only";
import type { User } from "./auth";
import { sql } from "./db";
import { STATUS } from "./judge0";
import { getLanguage } from "./languages";
import type { Verdict } from "./verdicts";

export type TestView = { position: number; state: "pending" | "passed" | "failed"; time: number | null; memory: number | null };

export type SubmissionView = {
  id: number;
  username: string;
  problem: { slug: string; label: string; title: string };
  /** Room code when this submission was made in a Fastest Finger First game. */
  gameCode: string | null;
  language: string;
  verdict: Verdict;
  failedTest: number | null;
  compileOutput: string | null;
  message: string | null;
  time: number | null;
  memory: number | null;
  createdAt: string;
  sourceCode: string;
  tests: TestView[];
};

/** A submission as its author (or an admin) may see it. Hidden test data is never included. */
export async function getSubmissionView(id: number, viewer: User): Promise<SubmissionView | null> {
  const [s] = await sql<
    {
      id: number; user_id: number; username: string; slug: string; label: string; title: string; language_id: number;
      verdict: Verdict; failed_test: number | null; compile_output: string | null; message: string | null;
      time: number | null; memory: number | null; created_at: Date; source_code: string; game_code: string | null;
    }[]
  >`
    SELECT s.id, s.user_id, u.username, p.slug, p.label, p.title, s.language_id, s.verdict, s.failed_test,
           s.compile_output, s.message, s.time, s.memory, s.created_at, s.source_code, gr.code AS game_code
    FROM submissions s JOIN users u ON u.id = s.user_id JOIN problems p ON p.id = s.problem_id
    LEFT JOIN game_rounds rd ON rd.id = s.game_round_id LEFT JOIN game_rooms gr ON gr.id = rd.room_id
    WHERE s.id = ${id}`;
  if (!s || (s.user_id !== viewer.id && !viewer.isAdmin)) return null;

  const tests = await sql<{ position: number; status_id: number | null; time: number | null; memory: number | null }[]>`
    SELECT position, status_id, time, memory FROM submission_tests WHERE submission_id = ${id} ORDER BY position`;

  return {
    id: s.id,
    username: s.username,
    problem: { slug: s.slug, label: s.label, title: s.title },
    gameCode: s.game_code,
    language: getLanguage(s.language_id)?.name ?? `#${s.language_id}`,
    verdict: s.verdict,
    failedTest: s.failed_test,
    compileOutput: s.compile_output,
    message: s.message,
    time: s.time,
    memory: s.memory,
    createdAt: s.created_at.toISOString(),
    sourceCode: s.source_code,
    tests: tests.map((t) => ({
      position: t.position,
      state:
        t.status_id === null || t.status_id === STATUS.IN_QUEUE || t.status_id === STATUS.PROCESSING
          ? "pending"
          : t.status_id === STATUS.ACCEPTED
            ? "passed"
            : "failed",
      time: t.time,
      memory: t.memory,
    })),
  };
}

export type SubmissionRow = {
  id: number;
  username: string;
  label: string;
  slug: string;
  title: string;
  languageId: number;
  verdict: Verdict;
  time: number | null;
  memory: number | null;
  createdAt: Date;
};

/** Latest submissions visible to the viewer: their own, or everyone's for admins. */
export async function listSubmissions(viewer: User, limit = 100): Promise<SubmissionRow[]> {
  return sql<SubmissionRow[]>`
    SELECT s.id, u.username, p.label, p.slug, p.title, s.language_id AS "languageId", s.verdict,
           s.time, s.memory, s.created_at AS "createdAt"
    FROM submissions s JOIN users u ON u.id = s.user_id JOIN problems p ON p.id = s.problem_id
    WHERE s.game_round_id IS NULL AND (${viewer.isAdmin} OR s.user_id = ${viewer.id})
    ORDER BY s.id DESC LIMIT ${limit}`;
}
