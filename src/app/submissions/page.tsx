import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getLanguage } from "@/lib/languages";
import { listSubmissions } from "@/lib/submissions";
import { AutoRefresh } from "@/components/auto-refresh";
import { VerdictBadge } from "@/components/verdict-badge";

export default async function SubmissionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const subs = await listSubmissions(user);
  const anyPending = subs.some((s) => s.verdict === "pending");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{user.isAdmin ? "All submissions" : "My submissions"}</h1>
      {anyPending && <AutoRefresh seconds={2} />}
      {subs.length === 0 ? (
        <p className="text-zinc-500">No submissions yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">When</th>
                {user.isAdmin && <th className="px-4 py-2 font-medium">User</th>}
                <th className="px-4 py-2 font-medium">Problem</th>
                <th className="px-4 py-2 font-medium">Language</th>
                <th className="px-4 py-2 font-medium">Verdict</th>
                <th className="px-4 py-2 text-right font-medium">Time</th>
                <th className="px-4 py-2 text-right font-medium">Memory</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {subs.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="px-4 py-2"><Link href={`/submissions/${s.id}`} className="font-mono hover:underline">{s.id}</Link></td>
                  <td className="px-4 py-2 whitespace-nowrap text-zinc-500">{s.createdAt.toLocaleTimeString("en-GB")}</td>
                  {user.isAdmin && <td className="px-4 py-2">{s.username}</td>}
                  <td className="px-4 py-2"><Link href={`/problems/${s.slug}`} className="hover:underline">{s.label}. {s.title}</Link></td>
                  <td className="px-4 py-2 text-zinc-500">{getLanguage(s.languageId)?.name ?? s.languageId}</td>
                  <td className="px-4 py-2"><Link href={`/submissions/${s.id}`}><VerdictBadge verdict={s.verdict} /></Link></td>
                  <td className="px-4 py-2 text-right tabular-nums text-zinc-500">{s.time !== null ? `${s.time.toFixed(2)} s` : "–"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-zinc-500">{s.memory !== null ? `${(s.memory / 1024).toFixed(1)} MB` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
