# Coding Contest

A self-hosted programming contest: problems with hidden tests, live judging through
[Judge0](https://github.com/judge0/judge0), and an ICPC-style leaderboard. Everything runs
on your machine.

```
Browser ──▶ Next.js app (:3000) ──▶ Postgres (:5434, docker compose)
                    │
                    └──▶ Judge0 API (127.0.0.1:2358) ──▶ isolate sandbox
```

Hidden test data never leaves the server: the browser talks only to the Next.js app, and only
the app talks to Judge0.

## Prerequisites

- Node.js 20+ and Docker
- Judge0 running on `127.0.0.1:2358`. On cgroup v2-only hosts (recent Ubuntu/Fedora, systemd ≥ 258)
  the official image does not work; use the `cgroup-v2` branch of
  [hanzala-sohrab/judge0](https://github.com/hanzala-sohrab/judge0/tree/cgroup-v2):

  ```sh
  git clone -b cgroup-v2 https://github.com/hanzala-sohrab/judge0.git && cd judge0
  # set REDIS_PASSWORD and POSTGRES_PASSWORD in judge0.conf
  docker compose up -d --build
  curl http://127.0.0.1:2358/isolate   # should print "The process isolator 2.7"
  ```

## Run it

```sh
cp .env.example .env
npm install
npm run setup        # starts Postgres, creates tables, imports problems/ and problems-game/
npm run build && npm start
```

Open http://localhost:3000. Register the username listed in `ADMIN_USERNAMES` (default `admin`)
to get an admin account. Admins can see problems before the start, submit at any time without
a cooldown, see all submissions, and are not ranked.

The code editor is [Monaco](https://microsoft.github.io/monaco-editor/), served from this app
(`npm install`, `dev` and `build` copy it into `public/monaco/`), so it works without internet
access. Ctrl/⌘ + Enter submits.

The server listens on all interfaces, so contestants on your network can join at
`http://<your-ip>:3000`. Judge0 and Postgres stay bound to localhost.

## Writing problems

```
problems/
  contest.json                 { "title", "startsAt", "endsAt", "penaltyMinutes" }
  <slug>/
    problem.json               { "label": "A", "title", "timeLimit": 1, "memoryLimit": 262144, "points": 100 }
    statement.md               Markdown (GitHub-flavoured)
    tests/
      sample-1.in / .out       shown on the problem page, judged first
      01.in / 01.out ...       hidden
```

- `timeLimit` is in seconds (max 15), `memoryLimit` in KB (max 512000).
- Java, Python and JavaScript get 2×, 3× and 2× the time limit (`src/lib/languages.ts`).
- Output is compared after trimming trailing whitespace on each line and at the end.
- Program output is capped at 4 MB.

Run `npm run problems:sync` after any change. Re-syncing is safe during a contest: problems are
updated in place and past submissions are kept (they are not rejudged).

## Fastest Finger First

A live game mode at `/game`. Anyone signed in can host: pick the number of rounds and the time per
round, then share the 6-character room code. Players join with the code, and the host presses Start.

- Every round shows all players the same random problem from `problems-game/` at the same moment.
  The first correct submission wins the round; after a 5-second winner banner the next round starts.
- "First" means **earliest submitted**, not earliest judged. A round is decided only when every
  submission made before the earliest accepted one has its verdict, so a fast C++ solution cannot
  beat a Python solution that was submitted earlier but takes longer to judge.
- When the timer runs out, no new submissions are taken, but those already in still count. If none
  is accepted, nobody scores. The host can skip a round or end the game at any time.
- Most rounds won takes the game. Game submissions never affect the contest leaderboard.

Game problems use the same folder format as contest problems, without `label` and `points`. Run
`npm run problems:sync` after changing them. Rooms update live over server-sent events. The
intermission length and per-player cooldown are constants at the top of `src/lib/game.ts`.

## Contest rules

- **Verdict** is that of the first failing test, in order (samples first): `WA`, `TLE`, `MLE`,
  `RE`, `CE`, or `AC` if all pass.
- **Ranking**: total points, then penalty, then the time of the last accepted submission.
  Penalty for each solved problem = minutes from the contest start to the first AC +
  `penaltyMinutes` × rejected attempts before it. Compilation errors and judge errors are free.
- One submission per 10 seconds per contestant, max 64 KB of source.

## Languages

C++17, C, Java 13 (class must be `Main`), Python 3.8, JavaScript (Node 12), Go 1.13 and Rust 1.40,
the versions bundled with Judge0 CE 1.13. Add or remove them in `src/lib/languages.ts` using IDs
from `curl http://127.0.0.1:2358/languages`.

## Checks

```sh
npm run typecheck && npm run lint
npm run test:e2e     # contest + game suites; need the app (npm start) and Judge0 running
```

The end-to-end suite submits real solutions in every language and checks verdicts, limits,
privacy, the contest window and leaderboard math. It creates `e2e_*` users and deletes them,
and their submissions, when it finishes.
