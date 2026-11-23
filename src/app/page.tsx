import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { canViewProblems, getContest, listProblems, phaseOf } from "@/lib/contest";
import { sql } from "@/lib/db";
import { Countdown } from "@/components/countdown";

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default async function Home() {
  const [user, contest] = await Promise.all([getCurrentUser(), getContest()]);
  if (!contest) {
    return <p className="text-zinc-500">No contest is configured yet. Run <code>npm run problems:sync</code>.</p>;
  }
  const phase = phaseOf(contest);
  const visible = canViewProblems(contest, user?.isAdmin ?? false);

  const problems = visible ? await listProblems() : [];
  const solvers = new Map(
    (
      await sql<{ problem_id: number; n: number }[]>`
        SELECT s.problem_id, count(DISTINCT s.user_id)::int AS n
        FROM submissions s JOIN users u ON u.id = s.user_id
        WHERE s.verdict = 'AC' AND NOT u.is_admin AND s.game_round_id IS NULL GROUP BY s.problem_id`
    ).map((r) => [r.problem_id, r.n]),
  );
  const mine = new Map(
    user
      ? (
          await sql<{ problem_id: number; solved: boolean }[]>`
            SELECT problem_id, bool_or(verdict = 'AC') AS solved FROM submissions
            WHERE user_id = ${user.id} AND game_round_id IS NULL GROUP BY problem_id`
        ).map((r) => [r.problem_id, r.solved])
      : [],
  );

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">{contest.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {dateFmt.format(contest.startsAt)} – {dateFmt.format(contest.endsAt)}
        </p>
        <p className="mt-3 text-sm">
          {phase === "before" && <Countdown target={contest.startsAt.toISOString()} label="Starts in" />}
          {phase === "running" && (
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <Countdown target={contest.endsAt.toISOString()} label="Running · ends in" />
            </span>
          )}
          {phase === "ended" && <span className="text-zinc-500">The contest is over.</span>}
        </p>
      </section>

      {!visible ? (
        <p className="rounded-md border border-dashed border-zinc-300 p-6 text-center text-zinc-500 dark:border-zinc-700">
          Problems will appear here when the contest starts.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="w-12 px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">Problem</th>
                <th className="px-4 py-2 text-right font-medium">Points</th>
                <th className="px-4 py-2 text-right font-medium">Solved by</th>
                {user && <th className="w-28 px-4 py-2 font-medium">You</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {problems.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="px-4 py-2.5 font-mono text-zinc-500">{p.label}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/problems/${p.slug}`} className="font-medium hover:underline">{p.title}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.points}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{solvers.get(p.id) ?? 0}</td>
                  {user && (
                    <td className="px-4 py-2.5">
                      {mine.get(p.id) === true && <span className="text-emerald-600 dark:text-emerald-400">✓ Solved</span>}
                      {mine.get(p.id) === false && <span className="text-red-600 dark:text-red-400">Attempted</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
