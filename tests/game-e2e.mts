// End-to-end checks for Fastest Finger First against a running app + Judge0.
//   npm run test:e2e
import { sql } from "../src/lib/db";
import type { GameState } from "../src/lib/game-state";
import { APP, check, Client, crashed, deleteTestUsers, finish, LANG, RUN, sleep } from "./helpers.mjs";

type Live = GameState & { serverNow: string };

// Reference Python solutions for every problem in problems-game/, keyed by title.
const SOLUTIONS: Record<string, string> = {
  "Reverse Words": `print(" ".join(input().split()[::-1]))`,
  "Count Vowels": `s = input()\nprint(sum(c in "aeiouAEIOU" for c in s))`,
  "Missing Number": `import sys\nd = sys.stdin.read().split()\nn = int(d[0])\nprint(n * (n + 1) // 2 - sum(map(int, d[1:])))`,
  "Second Largest": `import sys\nd = sys.stdin.read().split()\nv = sorted(set(map(int, d[1:])), reverse=True)\nprint(v[1] if len(v) > 1 else -1)`,
  "Longest Run of Ones": `print(max(len(x) for x in input().split("0")))`,
  "Array GCD": `import sys, math\nfrom functools import reduce\nd = sys.stdin.read().split()\nprint(reduce(math.gcd, map(int, d[1:])))`,
  "Sum of Multiples": `n = int(input())\nprint(sum(x for x in range(n) if x % 3 == 0 or x % 5 == 0))`,
  Palindrome: `s = input().strip()\nprint("YES" if s == s[::-1] else "NO")`,
};
const WRONG = `print(0)`;
/** Burns ~2 s of CPU per test before answering, so it is judged after a fast solution. */
const slow = (solution: string) => `import time\nt = time.time()\nwhile time.time() - t < 2: pass\n${solution}`;

const state = async (c: Client, code: string) => (await c.req("GET", `/api/game/${code}/state`)).json as Live;

async function waitFor(c: Client, code: string, what: string, pred: (s: Live) => boolean, timeoutMs = 60_000): Promise<Live> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const s = await state(c, code);
    if (pred(s)) return s;
    await sleep(200);
  }
  throw new Error(`timed out waiting for: ${what}`);
}

const playing = (n: number) => (s: Live) => s.phase === "playing" && s.round?.number === n;
const decided = (n: number) => (s: Live) => s.history.some((h) => h.number === n);
const solutionFor = (s: Live) => {
  const sol = SOLUTIONS[s.round!.problem!.title];
  if (!sol) throw new Error(`No reference solution for "${s.round!.problem!.title}"`);
  return sol;
};
const submit = (c: Client, code: string, sourceCode: string) =>
  c.req("POST", `/api/game/${code}/submit`, { languageId: LANG.python, sourceCode });

const host = new Client(`e2e_host_${RUN}`);
const p1 = new Client(`e2e_p1_${RUN}`);
const p2 = new Client(`e2e_p2_${RUN}`);
const outsider = new Client(`e2e_out_${RUN}`);

try {
  for (const c of [host, p1, p2, outsider]) {
    const r = await c.register();
    if (r.status !== 201) throw new Error(`register ${c.username}: ${r.status} ${r.text}`);
  }

  console.log("\nRooms");
  check("anonymous users cannot create rooms", (await new Client("anon").req("POST", "/api/game/rooms", { rounds: 1, roundSeconds: 60 })).status === 401);
  check("more rounds than problems is rejected", (await host.req("POST", "/api/game/rooms", { rounds: 50, roundSeconds: 60 })).status === 400);
  const created = await host.req("POST", "/api/game/rooms", { rounds: 3, roundSeconds: 60 });
  const code = (created.json as { code: string }).code;
  check("host creates a room with a 6-character code", created.status === 201 && /^[A-Z2-9]{6}$/.test(code), created.json);
  check("joining an unknown room fails", (await p1.req("POST", "/api/game/ZZZZZZ/join", {})).status === 404);
  check("players join", (await p1.req("POST", `/api/game/${code}/join`, {})).status === 200 && (await p2.req("POST", `/api/game/${code}/join`, {})).status === 200);
  const lobby = await state(p1, code);
  check("lobby lists host + 2 players", lobby.phase === "lobby" && lobby.players.length === 3, lobby.players);
  check("only the host can start", (await p1.req("POST", `/api/game/${code}/start`, {})).status === 403);
  check("submitting before the game starts fails", (await submit(p1, code, WRONG)).status === 409);

  console.log("\nRound 1: first correct submission wins");
  check("host starts the game", (await host.req("POST", `/api/game/${code}/start`, {})).status === 200);
  check("starting twice fails", (await host.req("POST", `/api/game/${code}/start`, {})).status === 409);
  const cd = await state(p1, code);
  check("countdown hides the problem", cd.phase === "countdown" && cd.round?.problem === null, { phase: cd.phase, problem: cd.round?.problem });
  check("submitting during the countdown fails", (await submit(p1, code, WRONG)).status === 409);

  let s = await waitFor(p1, code, "round 1 to start", playing(1));
  check("problem is revealed when the round starts", !!s.round?.problem?.statement && s.round.problem.samples.length > 0);
  check("state never includes hidden tests", !JSON.stringify(s).includes('"expected_output"'));
  check("non-players cannot submit", (await submit(outsider, code, solutionFor(s))).status === 403);
  check("p1 wrong answer accepted for judging", (await submit(p1, code, WRONG)).status === 201);
  check("p1 is rate limited within a round", (await submit(p1, code, WRONG)).status === 429);
  check("p2 correct answer accepted for judging", (await submit(p2, code, solutionFor(s))).status === 201);
  s = await waitFor(p1, code, "round 1 to be decided", decided(1));
  check("p2 wins round 1", s.history[0]?.winner === p2.username, s.history);
  check("solve time is recorded", (s.history[0]?.solveSeconds ?? 0) > 0, s.history[0]);
  check("round result is shown before the next round", s.phase === "intermission" && !!s.nextRoundStartsAt, { phase: s.phase });
  check("p1 sees their wrong answer", s.mySubmissions.some((m) => m.verdict === "WA"), s.mySubmissions);

  console.log("\nRound 2: earliest submission wins, not earliest verdict");
  s = await waitFor(p1, code, "round 2 to start", playing(2));
  const sol2 = solutionFor(s);
  const slowRes = await submit(p1, code, slow(sol2));
  await sleep(300);
  const fastRes = await submit(p2, code, sol2);
  check("both submissions accepted for judging", slowRes.status === 201 && fastRes.status === 201);
  s = await waitFor(p1, code, "round 2 to be decided", decided(2), 90_000);
  const [slowSub] = await sql<{ judged_at: Date }[]>`SELECT judged_at FROM submissions WHERE id = ${(slowRes.json as { id: number }).id}`;
  const [fastSub] = await sql<{ judged_at: Date }[]>`SELECT judged_at FROM submissions WHERE id = ${(fastRes.json as { id: number }).id}`;
  check("the later, faster solution got its verdict first", fastSub.judged_at < slowSub.judged_at, { fast: fastSub.judged_at, slow: slowSub.judged_at });
  check("p1 wins round 2 with the earlier submission", s.history[1]?.winner === p1.username, s.history);

  console.log("\nRound 3: host skips, game ends");
  s = await waitFor(p1, code, "round 3 to start", playing(3));
  check("only the host can skip", (await p1.req("POST", `/api/game/${code}/skip`, {})).status === 403);
  check("host skips the round", (await host.req("POST", `/api/game/${code}/skip`, {})).status === 200);
  s = await state(p1, code);
  check("game is finished after the last round", s.phase === "finished" && s.history[2]?.status === "skipped", { phase: s.phase, history: s.history });
  check("final standings: p1 1, p2 1, host 0", JSON.stringify(s.players.map((p) => [p.username, p.wins]).sort()) ===
    JSON.stringify([[host.username, 0], [p1.username, 1], [p2.username, 1]].sort()), s.players);
  check("no submissions after the game", (await submit(p1, code, WRONG)).status === 409);

  console.log("\nTimer");
  const timed = ((await host.req("POST", "/api/game/rooms", { rounds: 1, roundSeconds: 10 })).json as { code: string }).code;
  await p1.req("POST", `/api/game/${timed}/join`, {});
  await host.req("POST", `/api/game/${timed}/start`, {});
  s = await waitFor(p1, timed, "timed round to start", playing(1));
  const solT = solutionFor(s);
  const endsAt = Date.parse(s.round!.endsAt) - (Date.parse(s.serverNow) - Date.now());
  await sleep(Math.max(0, endsAt - Date.now() - 1500));
  check("a slow correct answer 1.5 s before the deadline is accepted", (await submit(p1, timed, slow(solT))).status === 201);
  await sleep(Math.max(0, endsAt - Date.now() + 300));
  check("submissions after the deadline are rejected", (await submit(host, timed, solT)).status === 409);
  const judging = await state(p1, timed);
  check("after the deadline the round waits for in-time submissions", judging.phase === "judging", judging.phase);
  s = await waitFor(p1, timed, "timed round to be decided", decided(1), 60_000);
  check("an in-time submission judged after the deadline still wins", s.history[0]?.winner === p1.username, s.history);

  const quiet = ((await host.req("POST", "/api/game/rooms", { rounds: 1, roundSeconds: 10 })).json as { code: string }).code;
  await host.req("POST", `/api/game/${quiet}/start`, {});
  s = await waitFor(host, quiet, "unsolved round to expire", decided(1), 30_000);
  check("an unsolved round expires and the game ends", s.history[0]?.status === "expired" && s.history[0]?.winner === null && s.phase === "finished", { history: s.history, phase: s.phase });

  console.log("\nHost controls");
  const ended = ((await host.req("POST", "/api/game/rooms", { rounds: 2, roundSeconds: 60 })).json as { code: string }).code;
  await p1.req("POST", `/api/game/${ended}/join`, {});
  check("only the host can end the game", (await p1.req("POST", `/api/game/${ended}/end`, {})).status === 403);
  check("host ends the game", (await host.req("POST", `/api/game/${ended}/end`, {})).status === 200 && (await state(p1, ended)).phase === "finished");
  check("finished games cannot be joined", (await p2.req("POST", `/api/game/${ended}/join`, {})).status === 409);

  console.log("\nLive updates and isolation");
  const ac = new AbortController();
  const res = await fetch(`${APP}/api/game/${code}/events`, { headers: { Cookie: p1.cookie }, signal: ac.signal });
  const reader = res.body!.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  ac.abort();
  check("event stream sends the room state", res.headers.get("content-type")?.startsWith("text/event-stream") === true && first.startsWith("data: ") && first.includes(code), first.slice(0, 80));
  check("game problems are not exposed on contest pages", (await p1.req("GET", "/problems/palindrome")).status === 404);
  const board = (await p1.req("GET", "/api/leaderboard")).json as { rows: { username: string }[] };
  check("game submissions do not count on the contest leaderboard", !board.rows.some((r) => r.username.endsWith(`_${RUN}`)));
} catch (err) {
  crashed(err);
} finally {
  await deleteTestUsers();
  await sql.end();
}

finish();
