// Imports problems/ into the database. Safe to re-run: problems are upserted
// by slug and their test cases replaced. Past submissions are kept.
//
// problems/contest.json            { title, startsAt, endsAt, penaltyMinutes? }
// problems/<slug>/problem.json     { label, title, timeLimit (s), memoryLimit (KB), points? }
// problems/<slug>/statement.md
// problems/<slug>/tests/*.in|*.out sample-*.{in,out} are shown to contestants, the rest are hidden.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { sql } from "../src/lib/db";

const ROOT = join(import.meta.dirname, "..", "problems");

const ContestSchema = z.object({
  title: z.string().min(1),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  penaltyMinutes: z.number().int().min(0).default(20),
});

const ProblemSchema = z.object({
  label: z.string().regex(/^[A-Z][0-9]?$/),
  title: z.string().min(1),
  timeLimit: z.number().positive().max(15),
  memoryLimit: z.number().int().min(16_000).max(512_000),
  points: z.number().int().positive().default(1),
});

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const naturalSort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

function loadTests(dir: string) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".in"));
  const names = files.map((f) => f.slice(0, -3));
  const samples = names.filter((n) => n.startsWith("sample-")).sort(naturalSort);
  const hidden = names.filter((n) => !n.startsWith("sample-")).sort(naturalSort);
  return [...samples, ...hidden].map((name, i) => {
    const out = join(dir, `${name}.out`);
    if (!existsSync(out)) throw new Error(`Missing ${out}`);
    return {
      position: i + 1,
      input: readFileSync(join(dir, `${name}.in`), "utf8"),
      expected_output: readFileSync(out, "utf8"),
      is_sample: name.startsWith("sample-"),
    };
  });
}

const contest = ContestSchema.parse(readJson(join(ROOT, "contest.json")));
if (new Date(contest.endsAt) <= new Date(contest.startsAt)) throw new Error("contest.json: endsAt must be after startsAt");

const slugs = readdirSync(ROOT).filter((d) => statSync(join(ROOT, d)).isDirectory()).sort();

await sql.begin(async (tx) => {
  await tx`
    INSERT INTO contest (id, title, starts_at, ends_at, penalty_minutes)
    VALUES (1, ${contest.title}, ${contest.startsAt}, ${contest.endsAt}, ${contest.penaltyMinutes})
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at, penalty_minutes = EXCLUDED.penalty_minutes`;
  console.log(`Contest: ${contest.title} (${contest.startsAt} → ${contest.endsAt})`);

  // Free labels first so problems can swap labels without hitting the unique constraint.
  await tx`UPDATE problems SET label = '~' || id`;

  for (const slug of slugs) {
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`Invalid problem directory name: ${slug}`);
    const dir = join(ROOT, slug);
    const meta = ProblemSchema.parse(readJson(join(dir, "problem.json")));
    const statement = readFileSync(join(dir, "statement.md"), "utf8");
    const tests = loadTests(join(dir, "tests"));
    if (tests.length === 0) throw new Error(`${slug}: no tests`);

    const [{ id }] = await tx<{ id: number }[]>`
      INSERT INTO problems (slug, label, title, statement, time_limit, memory_limit, points)
      VALUES (${slug}, ${meta.label}, ${meta.title}, ${statement}, ${meta.timeLimit}, ${meta.memoryLimit}, ${meta.points})
      ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label, title = EXCLUDED.title, statement = EXCLUDED.statement,
        time_limit = EXCLUDED.time_limit, memory_limit = EXCLUDED.memory_limit, points = EXCLUDED.points
      RETURNING id`;
    await tx`DELETE FROM test_cases WHERE problem_id = ${id}`;
    await tx`INSERT INTO test_cases ${tx(tests.map((t) => ({ ...t, problem_id: id })))}`;
    const samples = tests.filter((t) => t.is_sample).length;
    console.log(`  ${meta.label}. ${meta.title} [${slug}]: ${samples} sample + ${tests.length - samples} hidden tests`);
  }

  const stale = await tx<{ slug: string; used: boolean }[]>`
    SELECT slug, EXISTS (SELECT 1 FROM submissions s WHERE s.problem_id = p.id) AS used
    FROM problems p WHERE slug <> ALL(${slugs})`;
  for (const p of stale) {
    if (p.used) throw new Error(`Problem "${p.slug}" was removed from problems/ but has submissions. Restore it or delete its submissions first.`);
    await tx`DELETE FROM problems WHERE slug = ${p.slug}`;
    console.log(`  removed ${p.slug}`);
  }
});

await sql.end();
