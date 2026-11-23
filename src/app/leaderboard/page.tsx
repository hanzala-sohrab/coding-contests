import { getContest, listProblems, phaseOf } from "@/lib/contest";
import { computeLeaderboard } from "@/lib/scoring";
import { getCurrentUser } from "@/lib/auth";
import { AutoRefresh } from "@/components/auto-refresh";

export default async function LeaderboardPage() {
  const [contest, user] = await Promise.all([getContest(), getCurrentUser()]);
  if (!contest) return <p className="text-zinc-500">No contest is configured yet.</p>;
  const problems = await listProblems();
  const rows = await computeLeaderboard(contest, problems);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Leaderboard</h1>
        <p className="text-xs text-zinc-500">
          Ranked by points, then penalty (minutes to solve + {contest.penaltyMinutes} per rejected attempt)
        </p>
      </div>
      {phaseOf(contest) === "running" && <AutoRefresh seconds={10} />}
      {rows.length === 0 ? (
        <p className="text-zinc-500">No accepted or rejected submissions yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="w-14 px-3 py-2 text-left font-medium">Rank</th>
                <th className="px-3 py-2 text-left font-medium">User</th>
                <th className="px-3 py-2 text-right font-medium">Points</th>
                <th className="px-3 py-2 text-right font-medium">Penalty</th>
                {problems.map((p) => (
                  <th key={p.id} className="w-20 px-3 py-2 text-center font-mono font-medium" title={`${p.title} (${p.points} pts)`}>
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {rows.map((r) => (
                <tr key={r.userId} className={r.userId === user?.id ? "bg-sky-50 dark:bg-sky-950/30" : undefined}>
                  <td className="px-3 py-2 tabular-nums">{r.rank}</td>
                  <td className="px-3 py-2 font-medium">{r.username}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.points}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{r.penalty}</td>
                  {problems.map((p) => {
                    const c = r.cells[p.id];
                    if (!c) return <td key={p.id} />;
                    return (
                      <td
                        key={p.id}
                        className={`px-3 py-2 text-center tabular-nums ${
                          c.solved
                            ? c.firstSolve
                              ? "bg-emerald-600 text-white"
                              : "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                            : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
                        }`}
                        title={c.firstSolve ? "First to solve" : undefined}
                      >
                        <div className="font-medium">{c.solved ? `+${c.attempts || ""}` : `−${c.attempts}`}</div>
                        {c.solved && <div className="text-[11px] opacity-75">{c.solvedAtMinute}m</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
