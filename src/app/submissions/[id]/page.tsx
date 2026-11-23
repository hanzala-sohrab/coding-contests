import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSubmissionView } from "@/lib/submissions";
import { SubmissionLive } from "@/components/submission-live";

export default async function SubmissionPage(props: PageProps<"/submissions/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = Number((await props.params).id);
  const sub = Number.isSafeInteger(id) && id > 0 ? await getSubmissionView(id, user) : null;
  if (!sub) notFound();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-zinc-500">
          Submission #{sub.id} by {sub.username} · {new Date(sub.createdAt).toLocaleString("en-GB")}
        </p>
        <h1 className="mt-1 text-xl font-semibold">
          {sub.gameCode ? (
            <Link href={`/game/${sub.gameCode}`} className="hover:underline">
              {sub.problem.title} · Fastest Finger First room {sub.gameCode}
            </Link>
          ) : (
            <Link href={`/problems/${sub.problem.slug}`} className="hover:underline">
              {sub.problem.label}. {sub.problem.title}
            </Link>
          )}
        </h1>
      </div>
      <SubmissionLive initial={sub} />
    </div>
  );
}
