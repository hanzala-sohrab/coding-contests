import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { gameProblemCount } from "@/lib/game";
import { GameHome } from "@/components/game/game-home";

export default async function GamePage() {
  const user = await getCurrentUser();
  const intro = (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight">Fastest Finger First</h1>
      <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">
        Everyone gets the same problem at the same moment. The first correct submission wins the round and the next
        round starts right away. Most rounds won takes the game.
      </p>
    </div>
  );
  if (!user) {
    return (
      <div>
        {intro}
        <p className="text-zinc-500">
          <Link href="/login" className="underline">Sign in</Link> or <Link href="/register" className="underline">register</Link> to play.
        </p>
      </div>
    );
  }

  const [maxRounds, rooms] = await Promise.all([
    gameProblemCount(),
    sql<{ code: string; status: string; host: string; players: number }[]>`
      SELECT r.code, r.status, u.username AS host, (SELECT count(*)::int FROM game_players gp WHERE gp.room_id = r.id) AS players
      FROM game_rooms r JOIN users u ON u.id = r.host_id
      WHERE r.status <> 'finished' AND EXISTS (SELECT 1 FROM game_players p WHERE p.room_id = r.id AND p.user_id = ${user.id})
      ORDER BY r.created_at DESC LIMIT 10`,
  ]);

  return (
    <div>
      {intro}
      <GameHome maxRounds={maxRounds} />
      {rooms.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 font-semibold">Your open rooms</h2>
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {rooms.map((r) => (
              <li key={r.code}>
                <Link href={`/game/${r.code}`} className="flex items-center gap-4 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <span className="font-mono tracking-widest">{r.code}</span>
                  <span className="text-zinc-500">hosted by {r.host}</span>
                  <span className="text-zinc-500">{r.players} players</span>
                  <span className="ml-auto text-xs uppercase tracking-wide text-zinc-500">{r.status === "lobby" ? "waiting" : "in progress"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
