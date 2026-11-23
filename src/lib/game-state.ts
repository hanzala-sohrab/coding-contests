import { sql } from "./db";
import type { Verdict } from "./verdicts";

export type GamePhase =
  | "lobby" // waiting for the host to start
  | "countdown" // round created, problem not revealed yet
  | "playing" // round open for submissions
  | "judging" // time is up, waiting for in-time submissions to be judged
  | "intermission" // round decided, next round starting soon
  | "finished";

export type GameProblem = {
  title: string;
  statement: string;
  timeLimit: number;
  memoryLimit: number;
  samples: { input: string; output: string }[];
};

export type GameState = {
  code: string;
  host: string;
  isHost: boolean;
  isPlayer: boolean;
  status: "lobby" | "playing" | "finished";
  phase: GamePhase;
  totalRounds: number;
  roundSeconds: number;
  players: { username: string; wins: number; isHost: boolean }[];
  round: {
    number: number;
    startsAt: string;
    endsAt: string;
    status: "running" | "won" | "expired" | "skipped";
    problem: GameProblem | null; // null until the round starts
  } | null;
  /** Upcoming round, during the intermission. */
  nextRoundStartsAt: string | null;
  history: { number: number; title: string; status: string; winner: string | null; solveSeconds: number | null }[];
  mySubmissions: { id: number; verdict: Verdict; failedTest: number | null; createdAt: string }[];
  feed: { username: string; verdict: Verdict; at: string }[];
};

/** Everything a viewer needs to render a room. Contains no hidden test data. */
export async function getGameState(code: string, viewerId: number): Promise<GameState | null> {
  const [room] = await sql<
    { id: number; code: string; host_id: number; host: string; status: GameState["status"]; total_rounds: number; round_seconds: number; current_round: number }[]
  >`
    SELECT r.id, r.code, r.host_id, u.username AS host, r.status, r.total_rounds, r.round_seconds, r.current_round
    FROM game_rooms r JOIN users u ON u.id = r.host_id WHERE r.code = ${code.toUpperCase()}`;
  if (!room) return null;

  const [players, rounds, now] = await Promise.all([
    sql<{ user_id: number; username: string; wins: number }[]>`
      SELECT p.user_id, u.username,
             (SELECT count(*)::int FROM game_rounds r WHERE r.room_id = ${room.id} AND r.winner_id = p.user_id) AS wins
      FROM game_players p JOIN users u ON u.id = p.user_id
      WHERE p.room_id = ${room.id}
      ORDER BY wins DESC, p.joined_at`,
    sql<
      { id: number; number: number; problem_id: number; title: string; starts_at: Date; ends_at: Date; status: string; winner: string | null; solve_seconds: number | null }[]
    >`
      SELECT r.id, r.number, r.problem_id, p.title, r.starts_at, r.ends_at, r.status, w.username AS winner,
             extract(epoch FROM (s.created_at - r.starts_at))::float AS solve_seconds
      FROM game_rounds r
      JOIN problems p ON p.id = r.problem_id
      LEFT JOIN users w ON w.id = r.winner_id
      LEFT JOIN submissions s ON s.id = r.winning_submission_id
      WHERE r.room_id = ${room.id}
      ORDER BY r.number`,
    sql<{ now: Date }[]>`SELECT now()`.then((r) => r[0].now.getTime()),
  ]);

  const current = rounds.find((r) => r.number === room.current_round) ?? null;
  const lastFinished = [...rounds].reverse().find((r) => r.status !== "running") ?? null;

  // During an intermission the "current" round is already the next one (in
  // countdown); show the round that just ended and when the next one starts.
  let phase: GamePhase;
  let shown = current;
  let nextRoundStartsAt: string | null = null;
  if (room.status === "lobby") phase = "lobby";
  else if (room.status === "finished") {
    phase = "finished";
    shown = lastFinished;
  } else if (!current) phase = "countdown";
  else if (now < current.starts_at.getTime()) {
    if (current.number > 1 && lastFinished && lastFinished.number === current.number - 1) {
      phase = "intermission";
      shown = lastFinished;
      nextRoundStartsAt = current.starts_at.toISOString();
    } else phase = "countdown";
  } else if (now < current.ends_at.getTime()) phase = "playing";
  else phase = "judging";

  let problem: GameProblem | null = null;
  if (shown && now >= shown.starts_at.getTime()) {
    const [p] = await sql<{ title: string; statement: string; time_limit: number; memory_limit: number }[]>`
      SELECT title, statement, time_limit, memory_limit FROM problems WHERE id = ${shown.problem_id}`;
    const samples = await sql<{ input: string; output: string }[]>`
      SELECT input, expected_output AS output FROM test_cases WHERE problem_id = ${shown.problem_id} AND is_sample ORDER BY position`;
    problem = { title: p.title, statement: p.statement, timeLimit: p.time_limit, memoryLimit: p.memory_limit, samples: [...samples] };
  }

  const activeRound = phase === "playing" || phase === "judging" ? current : phase === "intermission" ? lastFinished : null;
  const [mine, feed] = activeRound
    ? await Promise.all([
        sql<{ id: number; verdict: Verdict; failed_test: number | null; created_at: Date }[]>`
          SELECT id, verdict, failed_test, created_at FROM submissions
          WHERE game_round_id = ${activeRound.id} AND user_id = ${viewerId} ORDER BY id DESC`,
        sql<{ username: string; verdict: Verdict; created_at: Date }[]>`
          SELECT u.username, s.verdict, s.created_at FROM submissions s JOIN users u ON u.id = s.user_id
          WHERE s.game_round_id = ${activeRound.id} ORDER BY s.id DESC LIMIT 12`,
      ])
    : [[], []];

  return {
    code: room.code,
    host: room.host,
    isHost: room.host_id === viewerId,
    isPlayer: players.some((p) => p.user_id === viewerId),
    status: room.status,
    phase,
    totalRounds: room.total_rounds,
    roundSeconds: room.round_seconds,
    players: players.map((p) => ({ username: p.username, wins: p.wins, isHost: p.user_id === room.host_id })),
    round: shown
      ? {
          number: shown.number,
          startsAt: shown.starts_at.toISOString(),
          endsAt: shown.ends_at.toISOString(),
          status: shown.status as "running" | "won" | "expired" | "skipped",
          problem,
        }
      : null,
    nextRoundStartsAt,
    history: rounds
      .filter((r) => r.status !== "running")
      .map((r) => ({ number: r.number, title: r.title, status: r.status, winner: r.winner, solveSeconds: r.solve_seconds })),
    mySubmissions: mine.map((s) => ({ id: s.id, verdict: s.verdict, failedTest: s.failed_test, createdAt: s.created_at.toISOString() })),
    feed: feed.map((f) => ({ username: f.username, verdict: f.verdict, at: f.created_at.toISOString() })),
  };
}
