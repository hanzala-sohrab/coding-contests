import { sql } from "./db";
import type { Contest, ProblemSummary } from "./contest";

// ICPC-style ranking with per-problem points:
//   1. higher total points
//   2. lower penalty = sum over solved problems of
//        (minutes from contest start to first AC) + penaltyMinutes × (rejected attempts before it)
//   3. earlier last accepted submission
// Compilation errors, internal errors and pending submissions never count as attempts.
// Only submissions made during the contest window count. Admins are not ranked.

export type Cell = {
  solved: boolean;
  attempts: number; // rejected attempts (before the first AC if solved)
  solvedAtMinute: number | null;
  firstSolve: boolean;
};

export type Row = {
  rank: number;
  userId: number;
  username: string;
  points: number;
  solved: number;
  penalty: number;
  cells: Record<number, Cell>; // by problem id
};

export async function computeLeaderboard(contest: Contest, problems: ProblemSummary[]): Promise<Row[]> {
  const subs = await sql<{ user_id: number; username: string; problem_id: number; verdict: string; created_at: Date }[]>`
    SELECT s.user_id, u.username, s.problem_id, s.verdict, s.created_at
    FROM submissions s JOIN users u ON u.id = s.user_id
    WHERE NOT u.is_admin AND s.game_round_id IS NULL
      AND s.verdict NOT IN ('pending', 'CE', 'IE')
      AND s.created_at >= ${contest.startsAt} AND s.created_at < ${contest.endsAt}
    ORDER BY s.created_at, s.id`;

  const pointsOf = new Map(problems.map((p) => [p.id, p.points]));
  const rows = new Map<number, Row>();
  const lastAc = new Map<number, number>(); // user id -> time of latest counted AC (ms)
  const firstSolver = new Map<number, number>(); // problem id -> user id of the first AC

  for (const s of subs) {
    if (!pointsOf.has(s.problem_id)) continue;
    let row = rows.get(s.user_id);
    if (!row) {
      row = { rank: 0, userId: s.user_id, username: s.username, points: 0, solved: 0, penalty: 0, cells: {} };
      rows.set(s.user_id, row);
    }
    const cell = (row.cells[s.problem_id] ??= { solved: false, attempts: 0, solvedAtMinute: null, firstSolve: false });
    if (cell.solved) continue;

    if (s.verdict === "AC") {
      const at = s.created_at.getTime();
      const minute = Math.floor((at - contest.startsAt.getTime()) / 60000);
      cell.solved = true;
      cell.solvedAtMinute = minute;
      row.solved += 1;
      row.points += pointsOf.get(s.problem_id)!;
      row.penalty += minute + contest.penaltyMinutes * cell.attempts;
      lastAc.set(s.user_id, Math.max(lastAc.get(s.user_id) ?? 0, at));
      if (!firstSolver.has(s.problem_id)) {
        firstSolver.set(s.problem_id, s.user_id);
        cell.firstSolve = true;
      }
    } else {
      cell.attempts += 1;
    }
  }

  const sorted = [...rows.values()].sort(
    (a, b) => b.points - a.points || a.penalty - b.penalty || (lastAc.get(a.userId) ?? 0) - (lastAc.get(b.userId) ?? 0) || a.username.localeCompare(b.username),
  );
  let rank = 0;
  sorted.forEach((row, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.points !== row.points || prev.penalty !== row.penalty) rank = i + 1;
    row.rank = rank;
  });
  return sorted;
}
