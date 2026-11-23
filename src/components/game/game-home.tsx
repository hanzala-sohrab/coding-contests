"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const field = "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const button = "rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";
const MINUTE_OPTIONS = [2, 3, 5, 10, 15, 20, 30];

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: await res.json().catch(() => null) };
}

export function GameHome({ maxRounds }: { maxRounds: number }) {
  const router = useRouter();
  const [rounds, setRounds] = useState(Math.min(5, maxRounds));
  const [minutes, setMinutes] = useState(5);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, data } = await post("/api/game/rooms", { rounds, roundSeconds: minutes * 60 });
    if (ok) return router.push(`/game/${data.code}`);
    setError(data?.error ?? "Could not create a room");
    setBusy(false);
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    setBusy(true);
    setError(null);
    const { ok, data } = await post(`/api/game/${encodeURIComponent(c)}/join`, {});
    if (ok) return router.push(`/game/${c}`);
    setError(data?.error ?? "Could not join");
    setBusy(false);
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form onSubmit={create} className="space-y-4 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="font-semibold">Host a game</h2>
        <div className="flex flex-wrap gap-4">
          <label className="space-y-1.5">
            <span className="block text-sm text-zinc-600 dark:text-zinc-400">Rounds</span>
            <input
              type="number"
              name="rounds"
              min={1}
              max={maxRounds}
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
              className={`${field} w-24`}
            />
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm text-zinc-600 dark:text-zinc-400">Time per round</span>
            <select name="minutes" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={field}>
              {MINUTE_OPTIONS.map((m) => (
                <option key={m} value={m}>{m} minutes</option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-zinc-500">{maxRounds} problems in the pool. Each round uses a different random one.</p>
        <button disabled={busy || maxRounds === 0} className={button}>Create room</button>
      </form>

      <form onSubmit={join} className="space-y-4 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="font-semibold">Join a game</h2>
        <label className="block space-y-1.5">
          <span className="block text-sm text-zinc-600 dark:text-zinc-400">Room code</span>
          <input
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC234"
            maxLength={6}
            autoComplete="off"
            className={`${field} w-40 font-mono tracking-widest uppercase`}
          />
        </label>
        <button disabled={busy || code.trim().length !== 6} className={button}>Join</button>
      </form>

      {error && <p className="text-sm text-red-600 md:col-span-2 dark:text-red-400">{error}</p>}
    </div>
  );
}
