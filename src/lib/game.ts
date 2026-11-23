// Fastest Finger First: rooms play a series of rounds; the first player to
// solve the round's problem wins it and the next round starts.
//
// "First" means earliest *submitted*, not earliest judged: a Python solution
// submitted before a C++ one may finish judging later. A round is decided only
// once every submission made before the earliest accepted one has a verdict.
import { randomInt } from "node:crypto";
import type postgres from "postgres";
import { sql } from "./db";

type Tx = postgres.TransactionSql;

/** Countdown before the first round. */
export const FIRST_ROUND_DELAY_SECONDS = 3;
/** Winner banner plus countdown between rounds. Set to 0 to jump straight to the next round. */
export const NEXT_ROUND_DELAY_SECONDS = 5;
/** Minimum gap between one player's submissions within a round. */
export const GAME_COOLDOWN_SECONDS = 3;

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

export type RoomRow = {
  id: number;
  code: string;
  host_id: number;
  status: "lobby" | "playing" | "finished";
  total_rounds: number;
  round_seconds: number;
  current_round: number;
};

export class GameError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function gameProblemCount(): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM problems WHERE pool = 'game'`;
  return n;
}

export async function findRoom(code: string): Promise<RoomRow | null> {
  const [room] = await sql<RoomRow[]>`SELECT * FROM game_rooms WHERE code = ${code.toUpperCase()}`;
  return room ?? null;
}

async function lockRoom(tx: Tx, code: string): Promise<RoomRow | null> {
  const [room] = await tx<RoomRow[]>`SELECT * FROM game_rooms WHERE code = ${code.toUpperCase()} FOR UPDATE`;
  return room ?? null;
}

export async function createRoom(hostId: number, totalRounds: number, roundSeconds: number): Promise<string> {
  const available = await gameProblemCount();
  if (available === 0) throw new GameError(409, "There are no game problems. Add some to problems-game/ and run npm run problems:sync.");
  if (totalRounds > available) throw new GameError(400, `Only ${available} game problems are available`);

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    const rows = await sql<{ id: number }[]>`
      INSERT INTO game_rooms (code, host_id, total_rounds, round_seconds)
      VALUES (${code}, ${hostId}, ${totalRounds}, ${roundSeconds})
      ON CONFLICT (code) DO NOTHING RETURNING id`;
    if (rows.length) {
      await sql`INSERT INTO game_players (room_id, user_id) VALUES (${rows[0].id}, ${hostId})`;
      return code;
    }
  }
  throw new Error("Could not allocate a room code");
}

export async function joinRoom(code: string, userId: number): Promise<void> {
  const room = await findRoom(code);
  if (!room) throw new GameError(404, "No such room");
  if (room.status === "finished") throw new GameError(409, "This game is over");
  await sql`INSERT INTO game_players (room_id, user_id) VALUES (${room.id}, ${userId}) ON CONFLICT DO NOTHING`;
}

/** Creates round `number` with a fresh random problem, or finishes the game if none are left. */
async function startRound(tx: Tx, room: RoomRow, number: number, delaySeconds: number): Promise<void> {
  const [problem] = await tx<{ id: number }[]>`
    SELECT id FROM problems p
    WHERE pool = 'game' AND NOT EXISTS (SELECT 1 FROM game_rounds r WHERE r.room_id = ${room.id} AND r.problem_id = p.id)
    ORDER BY random() LIMIT 1`;
  if (!problem || number > room.total_rounds) {
    await tx`UPDATE game_rooms SET status = 'finished', finished_at = now() WHERE id = ${room.id}`;
    return;
  }
  await tx`
    INSERT INTO game_rounds (room_id, number, problem_id, starts_at, ends_at)
    VALUES (${room.id}, ${number}, ${problem.id},
            now() + make_interval(secs => ${delaySeconds}),
            now() + make_interval(secs => ${delaySeconds + room.round_seconds}))`;
  await tx`UPDATE game_rooms SET current_round = ${number} WHERE id = ${room.id}`;
}

async function advance(tx: Tx, room: RoomRow, finishedNumber: number): Promise<void> {
  if (finishedNumber >= room.total_rounds) {
    await tx`UPDATE game_rooms SET status = 'finished', finished_at = now() WHERE id = ${room.id}`;
  } else {
    await startRound(tx, room, finishedNumber + 1, NEXT_ROUND_DELAY_SECONDS);
  }
}

export async function startGame(code: string, userId: number): Promise<void> {
  await sql.begin(async (tx) => {
    const room = await lockRoom(tx, code);
    if (!room) throw new GameError(404, "No such room");
    if (room.host_id !== userId) throw new GameError(403, "Only the host can start the game");
    if (room.status !== "lobby") throw new GameError(409, "The game has already started");
    await tx`UPDATE game_rooms SET status = 'playing' WHERE id = ${room.id}`;
    await startRound(tx, { ...room, status: "playing" }, 1, FIRST_ROUND_DELAY_SECONDS);
  });
}

/** Host action: end the current round with no winner and move on. */
export async function skipRound(code: string, userId: number): Promise<void> {
  await sql.begin(async (tx) => {
    const room = await lockRoom(tx, code);
    if (!room) throw new GameError(404, "No such room");
    if (room.host_id !== userId) throw new GameError(403, "Only the host can skip a round");
    if (room.status !== "playing") throw new GameError(409, "The game is not running");
    const skipped = await tx`
      UPDATE game_rounds SET status = 'skipped', finished_at = now()
      WHERE room_id = ${room.id} AND number = ${room.current_round} AND status = 'running'
      RETURNING id`;
    if (skipped.length === 0) throw new GameError(409, "The round is already over");
    await advance(tx, room, room.current_round);
  });
}

/** Host action: stop the game now. */
export async function endGame(code: string, userId: number): Promise<void> {
  await sql.begin(async (tx) => {
    const room = await lockRoom(tx, code);
    if (!room) throw new GameError(404, "No such room");
    if (room.host_id !== userId) throw new GameError(403, "Only the host can end the game");
    if (room.status === "finished") return;
    await tx`UPDATE game_rounds SET status = 'skipped', finished_at = now() WHERE room_id = ${room.id} AND status = 'running'`;
    await tx`UPDATE game_rooms SET status = 'finished', finished_at = now() WHERE id = ${room.id}`;
  });
}

/** The round a player may submit to right now, or an error explaining why not. */
export async function openRoundFor(code: string, userId: number) {
  const room = await findRoom(code);
  if (!room) throw new GameError(404, "No such room");
  const [player] = await sql`SELECT 1 FROM game_players WHERE room_id = ${room.id} AND user_id = ${userId}`;
  if (!player) throw new GameError(403, "Join the room to play");
  if (room.status !== "playing") throw new GameError(409, room.status === "lobby" ? "The game has not started" : "The game is over");

  const [round] = await sql<{ id: number; problem_id: number; status: string; started: boolean; open: boolean }[]>`
    SELECT id, problem_id, status, now() >= starts_at AS started, now() < ends_at AS open
    FROM game_rounds WHERE room_id = ${room.id} AND number = ${room.current_round}`;
  if (!round || round.status !== "running") throw new GameError(409, "This round is over");
  if (!round.started) throw new GameError(409, "The round has not started yet");
  if (!round.open) throw new GameError(409, "Time is up for this round");

  const [recent] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM submissions
    WHERE game_round_id = ${round.id} AND user_id = ${userId}
      AND created_at > now() - make_interval(secs => ${GAME_COOLDOWN_SECONDS})`;
  if (recent.n > 0) throw new GameError(429, `Wait ${GAME_COOLDOWN_SECONDS} seconds between submissions`);
  return { roundId: round.id, problemId: round.problem_id };
}

/**
 * Decides running rounds whose outcome is known, then advances their rooms.
 * Idempotent; safe to call often and from several processes.
 */
export async function gameTick(): Promise<void> {
  const running = await sql<{ id: number }[]>`SELECT id FROM game_rounds WHERE status = 'running'`;
  for (const { id } of running) await resolveRound(id);
}

async function resolveRound(roundId: number): Promise<void> {
  await sql.begin(async (tx) => {
    // Lock order is always room, then round (as in skipRound/endGame) to avoid deadlocks.
    const [ref] = await tx<{ room_id: number }[]>`SELECT room_id FROM game_rounds WHERE id = ${roundId}`;
    if (!ref) return;
    const [room] = await tx<RoomRow[]>`SELECT * FROM game_rooms WHERE id = ${ref.room_id} FOR UPDATE`;
    const [round] = await tx<{ id: number; number: number; status: string; expired: boolean }[]>`
      SELECT id, number, status, now() >= ends_at AS expired FROM game_rounds WHERE id = ${roundId} FOR UPDATE`;
    if (!round || round.status !== "running") return;

    const subs = await tx<{ id: number; user_id: number; verdict: string }[]>`
      SELECT id, user_id, verdict FROM submissions WHERE game_round_id = ${roundId} ORDER BY created_at, id`;

    // Walk submissions in the order they were made. A pending one could still
    // be the winner, so nothing after it can be decided yet.
    let winner: { id: number; user_id: number } | null = null;
    let undecided = false;
    for (const s of subs) {
      if (s.verdict === "pending") {
        undecided = true;
        break;
      }
      if (s.verdict === "AC") {
        winner = s;
        break;
      }
    }

    let finished = false;
    if (winner) {
      await tx`UPDATE game_rounds SET status = 'won', winner_id = ${winner.user_id},
               winning_submission_id = ${winner.id}, finished_at = now() WHERE id = ${roundId}`;
      finished = true;
    } else if (round.expired && !undecided) {
      await tx`UPDATE game_rounds SET status = 'expired', finished_at = now() WHERE id = ${roundId}`;
      finished = true;
    }
    if (!finished) return;
    if (room.status === "playing" && room.current_round === round.number) await advance(tx, room, round.number);
  });
}
