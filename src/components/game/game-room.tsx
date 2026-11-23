"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { GameProblem, GameState } from "@/lib/game-state";
import { VERDICT_LABELS } from "@/lib/verdicts";
import { CodeWorkspace } from "../code-workspace";
import { VerdictBadge } from "../verdict-badge";

type Live = GameState & { serverNow: string };

const btn = "rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50";
const primary = `${btn} bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300`;
const secondary = `${btn} border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`;

/** Wall-clock time, ticking. Null until mounted so server and client render the same markup. */
function useClock(intervalMs = 250): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}

function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function action(code: string, name: string) {
  const res = await fetch(`/api/game/${code}/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (!res.ok) return (await res.json().catch(() => null))?.error ?? "Something went wrong";
  return null;
}

export function GameRoom({ initial }: { initial: Live }) {
  const [state, setState] = useState<Live>(initial);
  const [offset, setOffset] = useState(() => Date.parse(initial.serverNow) - Date.now());
  const [connected, setConnected] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const clock = useClock();
  const now = clock === null ? null : clock + offset; // server time
  const code = state.code;

  useEffect(() => {
    const es = new EventSource(`/api/game/${code}/events`);
    es.onmessage = (e) => {
      const next = JSON.parse(e.data) as Live;
      setOffset(Date.parse(next.serverNow) - Date.now());
      setState(next);
      setConnected(true);
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [code]);

  async function run(name: string) {
    setActionError(await action(code, name));
  }

  const { phase, round } = state;
  const remaining = now !== null && round ? Date.parse(round.endsAt) - now : null;
  const untilStart = now !== null && round ? Date.parse(round.startsAt) - now : null;
  const untilNext = now !== null && state.nextRoundStartsAt ? Date.parse(state.nextRoundStartsAt) - now : null;

  return (
    // Break out of the site's narrow column: problem, editor and sidebar need the room.
    <div className="relative left-1/2 w-[min(88rem,calc(100vw-2rem))] -translate-x-1/2 space-y-6">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Fastest Finger First</p>
          <p className="font-mono text-2xl font-semibold tracking-[0.2em]">{code}</p>
        </div>
        {phase !== "lobby" && round && (
          <p className="text-sm text-zinc-500">
            Round <span className="font-semibold text-zinc-900 dark:text-zinc-100">{round.number}</span> of {state.totalRounds}
          </p>
        )}
        {phase === "playing" && remaining !== null && (
          <p className={`font-mono text-2xl tabular-nums ${remaining < 30_000 ? "text-red-600 dark:text-red-400" : ""}`} aria-label="Time left">
            {mmss(remaining)}
          </p>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!connected && <span className="text-xs text-amber-600 dark:text-amber-400">Reconnecting…</span>}
          {state.isHost && phase === "lobby" && (
            <button className={primary} onClick={() => run("start")}>Start game</button>
          )}
          {state.isHost && (phase === "playing" || phase === "judging" || phase === "countdown") && (
            <button className={secondary} onClick={() => run("skip")}>Skip round</button>
          )}
          {state.isHost && state.status !== "finished" && (
            <button className={secondary} onClick={() => confirm("End the game for everyone?") && run("end")}>End game</button>
          )}
          {!state.isPlayer && state.status !== "finished" && (
            <button className={primary} onClick={() => run("join")}>Join game</button>
          )}
        </div>
      </header>
      {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <section className="min-w-0">
          {phase === "lobby" && <Lobby state={state} />}

          {phase === "countdown" && round && (
            <BigMessage title={`Round ${round.number}`} subtitle={`starts in ${untilStart === null ? "…" : Math.max(0, Math.ceil(untilStart / 1000))}`} />
          )}

          {(phase === "playing" || phase === "judging") && round?.problem && (
            <div className="space-y-6">
              {phase === "judging" && (
                <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  Time&apos;s up. Judging the last submissions…
                </p>
              )}
              <div className="grid gap-8 xl:grid-cols-2">
                <ProblemView problem={round.problem} />
                <div className="space-y-5">
                  {state.isPlayer ? (
                    <CodeWorkspace
                      key={round.number}
                      disabled={phase !== "playing"}
                      disabledReason="Submissions are closed."
                      onSubmit={async (languageId, sourceCode) => {
                        const res = await fetch(`/api/game/${code}/submit`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ languageId, sourceCode }),
                        });
                        if (res.ok) return null;
                        return (await res.json().catch(() => null))?.error ?? "Submission failed";
                      }}
                    />
                  ) : (
                    <p className="text-sm text-zinc-500">You are watching. Join to play from the next submission on.</p>
                  )}
                  <MyAttempts state={state} />
                </div>
              </div>
            </div>
          )}

          {phase === "intermission" && round && (
            <div className="space-y-6">
              <RoundResult state={state} />
              <p className="text-center text-zinc-500">
                Round {round.number + 1} starts in{" "}
                <span className="font-mono tabular-nums">{untilNext === null ? "…" : Math.max(0, Math.ceil(untilNext / 1000))}</span>
              </p>
            </div>
          )}

          {phase === "finished" && <FinalStandings state={state} />}
        </section>

        <aside className="space-y-6">
          <Scoreboard state={state} />
          {phase !== "lobby" && <Feed state={state} />}
          <History state={state} />
        </aside>
      </div>
    </div>
  );
}

function BigMessage({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-zinc-200 p-10 text-center dark:border-zinc-800">
      <p className="text-4xl font-semibold tracking-tight">{title}</p>
      {subtitle && <p className="mt-3 text-xl text-zinc-500 tabular-nums">{subtitle}</p>}
    </div>
  );
}

function Lobby({ state }: { state: Live }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setOrigin(window.location.origin), 0);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
      <p>
        {state.totalRounds} round{state.totalRounds === 1 ? "" : "s"}, {Math.round(state.roundSeconds / 60)} minutes each.
      </p>
      <p className="text-sm text-zinc-500">
        Players join with code <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">{state.code}</span>
        {origin && (
          <>
            {" "}at <span className="font-mono">{origin}/game/{state.code}</span>
          </>
        )}
        .
      </p>
      <p className="text-sm text-zinc-500">
        {state.isHost ? "Start when everyone has joined." : `Waiting for ${state.host} to start the game…`}
      </p>
    </div>
  );
}

function ProblemView({ problem }: { problem: GameProblem }) {
  return (
    <article className="min-w-0">
      <h2 className="text-2xl font-semibold tracking-tight">{problem.title}</h2>
      <p className="mt-1 flex gap-4 text-sm text-zinc-500">
        <span>Time limit: {problem.timeLimit} s</span>
        <span>Memory limit: {Math.round(problem.memoryLimit / 1024)} MB</span>
      </p>
      <div className="statement mt-4">
        <Markdown remarkPlugins={[remarkGfm]}>{problem.statement}</Markdown>
      </div>
      {problem.samples.map((s, i) => (
        <div key={i} className="mt-5 grid gap-3 sm:grid-cols-2">
          {[["Input", s.input], ["Output", s.output]].map(([title, body]) => (
            <div key={title}>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</p>
              <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 text-[13px] dark:bg-zinc-900">{body}</pre>
            </div>
          ))}
        </div>
      ))}
    </article>
  );
}

function MyAttempts({ state }: { state: Live }) {
  if (state.mySubmissions.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Your attempts</h3>
      <ul className="space-y-1.5 text-sm">
        {state.mySubmissions.map((s) => (
          <li key={s.id} className="flex items-center gap-3">
            <Link href={`/submissions/${s.id}`} target="_blank" className="font-mono text-zinc-500 hover:underline">#{s.id}</Link>
            <VerdictBadge verdict={s.verdict} failedTest={s.failedTest} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoundResult({ state }: { state: Live }) {
  const last = state.history.at(-1);
  if (!last) return null;
  return (
    <BigMessage
      title={last.winner ? `🏆 ${last.winner}` : last.status === "skipped" ? "Round skipped" : "Nobody solved it"}
      subtitle={
        last.winner
          ? `solved “${last.title}” in ${mmss((last.solveSeconds ?? 0) * 1000)}`
          : `The problem was “${last.title}”`
      }
    />
  );
}

function FinalStandings({ state }: { state: Live }) {
  const top = state.players[0];
  const tied = state.players.filter((p) => p.wins === top?.wins);
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="space-y-6">
      <BigMessage
        title="Game over"
        subtitle={!top || top.wins === 0 ? "Nobody won a round" : tied.length > 1 ? `Tie: ${tied.map((p) => p.username).join(", ")}` : `${top.username} wins!`}
      />
      <ol className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {state.players.map((p, i) => (
          <li key={p.username} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-6 text-center">{medals[i] && p.wins > 0 ? medals[i] : i + 1}</span>
            <span className="font-medium">{p.username}</span>
            <span className="ml-auto tabular-nums text-zinc-500">{p.wins} won</span>
          </li>
        ))}
      </ol>
      <Link href="/game" className="inline-block text-sm underline">Play again</Link>
    </div>
  );
}

function Scoreboard({ state }: { state: Live }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Players ({state.players.length})</h3>
      <ul className="space-y-1 text-sm">
        {state.players.map((p) => (
          <li key={p.username} className="flex items-center gap-2">
            <span className="truncate">{p.username}</span>
            {p.isHost && <span className="rounded bg-zinc-100 px-1.5 text-[10px] uppercase text-zinc-500 dark:bg-zinc-800">host</span>}
            <span className="ml-auto font-mono tabular-nums">{"★".repeat(Math.min(p.wins, 5))}{p.wins > 5 ? `+${p.wins - 5}` : ""}{p.wins === 0 ? "–" : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Feed({ state }: { state: Live }) {
  if (state.feed.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Live</h3>
      <ul className="space-y-1 text-xs">
        {state.feed.map((f, i) => (
          <li key={i} className="flex gap-2">
            <span className="truncate font-medium">{f.username}</span>
            <span className={`ml-auto shrink-0 ${f.verdict === "AC" ? "text-emerald-600 dark:text-emerald-400" : f.verdict === "pending" ? "text-zinc-500" : "text-red-600 dark:text-red-400"}`}>
              {f.verdict === "pending" ? "submitted" : VERDICT_LABELS[f.verdict]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function History({ state }: { state: Live }) {
  if (state.history.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Rounds</h3>
      <ol className="space-y-1 text-xs">
        {state.history.map((h) => (
          <li key={h.number} className="flex gap-2">
            <span className="w-4 shrink-0 text-zinc-500">{h.number}</span>
            <span className="truncate">{h.title}</span>
            <span className="ml-auto shrink-0 text-zinc-500">
              {h.winner ? `${h.winner} · ${mmss((h.solveSeconds ?? 0) * 1000)}` : h.status === "skipped" ? "skipped" : "unsolved"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
