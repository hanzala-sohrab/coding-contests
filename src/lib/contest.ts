import { sql } from "./db";

export type Contest = {
  title: string;
  startsAt: Date;
  endsAt: Date;
  penaltyMinutes: number;
};

export type Phase = "before" | "running" | "ended";

export async function getContest(): Promise<Contest | null> {
  const [row] = await sql<{ title: string; starts_at: Date; ends_at: Date; penalty_minutes: number }[]>`
    SELECT title, starts_at, ends_at, penalty_minutes FROM contest WHERE id = 1`;
  return row
    ? { title: row.title, startsAt: row.starts_at, endsAt: row.ends_at, penaltyMinutes: row.penalty_minutes }
    : null;
}

export function phaseOf(contest: Contest, now = new Date()): Phase {
  if (now < contest.startsAt) return "before";
  if (now >= contest.endsAt) return "ended";
  return "running";
}

export type ProblemSummary = {
  id: number;
  slug: string;
  label: string;
  title: string;
  points: number;
};

export async function listProblems(): Promise<ProblemSummary[]> {
  return sql<ProblemSummary[]>`SELECT id, slug, label, title, points FROM problems WHERE pool = 'contest' ORDER BY label`;
}

export type Problem = ProblemSummary & {
  statement: string;
  timeLimit: number;
  memoryLimit: number;
  samples: { input: string; output: string }[];
};

export async function getProblem(slug: string): Promise<Problem | null> {
  const [p] = await sql<
    { id: number; slug: string; label: string; title: string; points: number; statement: string; time_limit: number; memory_limit: number }[]
  >`SELECT id, slug, label, title, points, statement, time_limit, memory_limit FROM problems WHERE slug = ${slug} AND pool = 'contest'`;
  if (!p) return null;
  const samples = await sql<{ input: string; output: string }[]>`
    SELECT input, expected_output AS output FROM test_cases
    WHERE problem_id = ${p.id} AND is_sample ORDER BY position`;
  return {
    id: p.id,
    slug: p.slug,
    label: p.label,
    title: p.title,
    points: p.points,
    statement: p.statement,
    timeLimit: p.time_limit,
    memoryLimit: p.memory_limit,
    samples: [...samples],
  };
}

/** Whether this viewer may see problem statements right now. */
export function canViewProblems(contest: Contest | null, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  return contest !== null && phaseOf(contest) !== "before";
}
