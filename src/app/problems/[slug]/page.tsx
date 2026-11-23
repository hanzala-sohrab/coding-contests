import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getCurrentUser } from "@/lib/auth";
import { canViewProblems, getContest, getProblem, phaseOf } from "@/lib/contest";
import { SubmitForm } from "@/components/submit-form";

export default async function ProblemPage(props: PageProps<"/problems/[slug]">) {
  const { slug } = await props.params;
  const [user, contest] = await Promise.all([getCurrentUser(), getContest()]);
  if (!canViewProblems(contest, user?.isAdmin ?? false)) {
    return <p className="text-zinc-500">This problem is not available until the contest starts.</p>;
  }
  const problem = await getProblem(slug);
  if (!problem) notFound();

  const running = contest !== null && phaseOf(contest) === "running";
  const canSubmit = user !== null && (running || user.isAdmin);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <article>
        <p className="font-mono text-sm text-zinc-500">Problem {problem.label}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{problem.title}</h1>
        <p className="mt-2 flex flex-wrap gap-x-4 text-sm text-zinc-500">
          <span>Time limit: {problem.timeLimit} s</span>
          <span>Memory limit: {Math.round(problem.memoryLimit / 1024)} MB</span>
          <span>{problem.points} points</span>
        </p>
        <div className="statement mt-4">
          <Markdown remarkPlugins={[remarkGfm]}>{problem.statement}</Markdown>
        </div>
        {problem.samples.map((s, i) => (
          <div key={i} className="mt-6">
            <h2 className="mb-2 font-semibold">Example {problem.samples.length > 1 ? i + 1 : ""}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {[["Input", s.input], ["Output", s.output]].map(([title, body]) => (
                <div key={title}>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</p>
                  <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 text-[13px] dark:bg-zinc-900">{body}</pre>
                </div>
              ))}
            </div>
          </div>
        ))}
      </article>

      <section>
        <h2 className="mb-3 font-semibold">Submit</h2>
        {canSubmit ? (
          <SubmitForm problem={problem.slug} />
        ) : user === null ? (
          <p className="text-sm text-zinc-500">
            <Link href="/login" className="underline">Sign in</Link> to submit a solution.
          </p>
        ) : (
          <p className="text-sm text-zinc-500">Submissions are closed: the contest is over.</p>
        )}
      </section>
    </div>
  );
}
