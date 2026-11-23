// End-to-end checks against a running app + Judge0.
//   npm run build && npm start      (in another terminal)
//   npm run test:e2e
// Creates e2e_* users, temporarily moves the contest window, and cleans up after itself.
import { sql } from "../src/lib/db";
import type { Row } from "../src/lib/scoring";
import type { SubmissionView } from "../src/lib/submissions";
import { check, Client, crashed, deleteTestUsers, finish, LANG, PASSWORD, RUN } from "./helpers.mjs";

type Leaderboard = { problems: { id: number; label: string; points: number }[]; rows: Row[] };

const SOL = {
  sumCpp: `#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}`,
  sumC: `#include <stdio.h>\nint main(void){long long a,b;scanf("%lld %lld",&a,&b);printf("%lld\\n",a+b);return 0;}`,
  sumJava: `import java.util.*;\npublic class Main{public static void main(String[] x){Scanner s=new Scanner(System.in);System.out.println(s.nextLong()+s.nextLong());}}`,
  sumPython: `a, b = map(int, input().split())\nprint(a + b)`,
  sumJs: `const [a,b]=require("fs").readFileSync(0,"utf8").trim().split(/\\s+/).map(BigInt);console.log((a+b).toString());`,
  sumGo: `package main\nimport "fmt"\nfunc main(){var a,b int64;fmt.Scan(&a,&b);fmt.Println(a+b)}`,
  sumRust: `use std::io::*;\nfn main(){let mut s=String::new();stdin().read_to_string(&mut s).unwrap();let v:Vec<i64>=s.split_whitespace().map(|x|x.parse().unwrap()).collect();println!("{}",v[0]+v[1]);}`,
  sumInt32: `#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}`,
  compileError: `int main( {`,
  runtimeError: `raise SystemExit(3)`,
  memoryHog: `#include <vector>\n#include <cstdio>\nint main(){std::vector<char> v(400u<<20, 1);long long s=0;for(size_t i=0;i<v.size();i+=4096)s+=v[i];printf("%lld",s);}`,
  rsqNaivePython: `import sys\nd=sys.stdin.read().split();n,q=int(d[0]),int(d[1]);a=list(map(int,d[2:2+n]));o=[]\np=2+n\nfor _ in range(q):\n    l,r=int(d[p]),int(d[p+1]);p+=2\n    s=0\n    for i in range(l-1,r): s+=a[i]\n    o.append(s)\nprint("\\n".join(map(str,o)))`,
  rsqCpp: `#include <bits/stdc++.h>\nint main(){std::ios::sync_with_stdio(0);std::cin.tie(0);int n,q;std::cin>>n>>q;std::vector<long long>p(n+1);for(int i=1;i<=n;i++){long long x;std::cin>>x;p[i]=p[i-1]+x;}std::string o;while(q--){int l,r;std::cin>>l>>r;o+=std::to_string(p[r]-p[l-1]);o+='\\n';}std::cout<<o;}`,
  bracketsAlwaysYes: `import sys\nt=int(sys.stdin.readline())\nprint("\\n".join(["YES"]*t))`,
  bracketsJava: `import java.io.*;\npublic class Main{public static void main(String[] x)throws IOException{BufferedReader r=new BufferedReader(new InputStreamReader(System.in));int t=Integer.parseInt(r.readLine().trim());StringBuilder o=new StringBuilder();char[] st=new char[1000001];while(t-->0){String s=r.readLine().trim();int top=0;boolean ok=true;for(int i=0;i<s.length()&&ok;i++){char c=s.charAt(i);if(c=='('||c=='['||c=='{')st[top++]=c;else{char w=c==')'?'(':c==']'?'[':'{';if(top==0||st[--top]!=w)ok=false;}}o.append(ok&&top==0?"YES\\n":"NO\\n");}System.out.print(o);}}`,
};

const [original] = await sql<{ starts_at: Date; ends_at: Date }[]>`SELECT starts_at, ends_at FROM contest WHERE id = 1`;
if (!original) throw new Error("No contest configured; run npm run setup first");

async function setWindow(startOffsetMin: number, endOffsetMin: number) {
  await sql`UPDATE contest SET starts_at = now() + make_interval(mins => ${startOffsetMin}),
            ends_at = now() + make_interval(mins => ${endOffsetMin}) WHERE id = 1`;
}

const admin = new Client(`e2e_admin_${RUN}`);
const alice = new Client(`e2e_alice_${RUN}`);
const bob = new Client(`e2e_bob_${RUN}`);
const crowd = Array.from({ length: 8 }, (_, i) => new Client(`e2e_c${i}_${RUN}`));

try {
  await setWindow(-30, 120); // contest running, started 30 minutes ago

  console.log("\nAccounts");
  for (const c of [admin, alice, bob, ...crowd]) {
    const r = await c.register();
    if (r.status !== 201) throw new Error(`register ${c.username}: ${r.status} ${r.text}`);
  }
  await sql`UPDATE users SET is_admin = true WHERE username = ${admin.username}`;
  check("duplicate username (different case) is rejected", (await new Client(alice.username.toUpperCase()).register()).status === 409);
  const login = new Client(alice.username);
  check("wrong password is rejected", (await login.req("POST", "/api/auth/login", { username: alice.username, password: "nope-nope" })).status === 401);
  check("correct password signs in", (await login.req("POST", "/api/auth/login", { username: alice.username, password: PASSWORD })).status === 200);
  check("anonymous submit is rejected", (await new Client("anon").submit("sum-of-two", LANG.cpp, SOL.sumCpp)).status === 401);
  check(
    "non-JSON submit is rejected (CSRF guard)",
    (await alice.req("POST", "/api/submissions", "problem=sum-of-two", { "Content-Type": "application/x-www-form-urlencoded" })).status === 415,
  );

  console.log("\nVerdicts (admin, no cooldown)");
  const cases: [string, string, number, string, string][] = [
    ["C++ correct", "sum-of-two", LANG.cpp, SOL.sumCpp, "AC"],
    ["C correct", "sum-of-two", LANG.c, SOL.sumC, "AC"],
    ["Java correct", "sum-of-two", LANG.java, SOL.sumJava, "AC"],
    ["Python correct", "sum-of-two", LANG.python, SOL.sumPython, "AC"],
    ["JavaScript correct", "sum-of-two", LANG.js, SOL.sumJs, "AC"],
    ["Go correct", "sum-of-two", LANG.go, SOL.sumGo, "AC"],
    ["Rust correct", "sum-of-two", LANG.rust, SOL.sumRust, "AC"],
    ["32-bit overflow", "sum-of-two", LANG.cpp, SOL.sumInt32, "WA"],
    ["compile error", "sum-of-two", LANG.cpp, SOL.compileError, "CE"],
    ["non-zero exit", "sum-of-two", LANG.python, SOL.runtimeError, "RE"],
    ["400 MB allocation", "sum-of-two", LANG.cpp, SOL.memoryHog, "MLE"],
    ["O(n·q) range sums", "range-sum-queries", LANG.python, SOL.rsqNaivePython, "TLE"],
    ["prefix sums", "range-sum-queries", LANG.cpp, SOL.rsqCpp, "AC"],
    ["Java bracket stack", "balanced-brackets", LANG.java, SOL.bracketsJava, "AC"],
    ["always YES", "balanced-brackets", LANG.python, SOL.bracketsAlwaysYes, "WA"],
  ];
  const results = await Promise.all(cases.map(([, p, l, code]) => admin.judge(p, l, code)));
  cases.forEach(([name, , , , want], i) => {
    const r = results[i];
    check(`${name} -> ${want}`, r.verdict === want, { verdict: r.verdict, failedTest: r.failedTest, message: r.message, time: r.time, memory: r.memory });
  });
  const ce = results[cases.findIndex(([n]) => n === "compile error")];
  check("compile error includes compiler output", typeof ce.compileOutput === "string" && ce.compileOutput.includes("error"));
  const wa = results[cases.findIndex(([n]) => n === "32-bit overflow")];
  check("WA reports the first failing test (sample passes, first hidden fails)", wa.failedTest !== null && wa.failedTest > 1, wa.failedTest);

  console.log("\nPrivacy");
  const view = await admin.req("GET", `/api/submissions/${results[0].id}`);
  const hiddenInput = "1000000000000000000 1000000000000000000";
  const viewTests = (view.json as SubmissionView).tests;
  check("submission view never includes test data", !view.text.includes(hiddenInput) && viewTests.length > 0 && !("input" in viewTests[0]));
  const page = await alice.req("GET", "/problems/sum-of-two");
  check("problem page shows the sample", page.text.includes("3 4"));
  check("problem page does not leak hidden tests", !page.text.includes(hiddenInput));
  check("users cannot see other users' submissions", (await alice.req("GET", `/api/submissions/${results[0].id}`)).status === 404);

  console.log("\nCooldown and scoring");
  const bobCe = await bob.judge("sum-of-two", LANG.cpp, SOL.compileError);
  check("bob: compile error", bobCe.verdict === "CE");
  check("second submission within 10 s is rate limited", (await bob.submit("sum-of-two", LANG.cpp, SOL.sumCpp)).status === 429);
  const aliceTle = await alice.judge("range-sum-queries", LANG.python, SOL.rsqNaivePython);
  check("alice: TLE on B", aliceTle.verdict === "TLE");
  await new Promise((r) => setTimeout(r, 10_500));
  const [bobAc, aliceAc] = await Promise.all([
    bob.judge("sum-of-two", LANG.cpp, SOL.sumCpp),
    alice.judge("range-sum-queries", LANG.cpp, SOL.rsqCpp),
  ]);
  check("bob: AC on A after cooldown", bobAc.verdict === "AC");
  check("alice: AC on B after cooldown", aliceAc.verdict === "AC");

  const board = (await alice.req("GET", "/api/leaderboard")).json as Leaderboard;
  const probId = (label: string) => board.problems.find((p) => p.label === label)!.id;
  const rowOf = (c: Client) => board.rows.find((r) => r.username === c.username);
  const a = rowOf(alice);
  const b = rowOf(bob);
  check("admin is not ranked", !rowOf(admin));
  check("alice ranks above bob (200 pts vs 100 pts)", !!a && !!b && a.points === 200 && b.points === 100 && a.rank < b.rank, { a, b });
  const aCell = a?.cells[probId("B")];
  check("alice's TLE counts as one rejected attempt", aCell?.attempts === 1, aCell);
  check("penalty = solve minute + 20 × rejected attempts", aCell?.solvedAtMinute != null && a?.penalty === aCell.solvedAtMinute + 20, { penalty: a?.penalty, cell: aCell });
  const bCell = b?.cells[probId("A")];
  check("compile errors are not counted as attempts", bCell?.attempts === 0 && b?.penalty === bCell?.solvedAtMinute, { penalty: b?.penalty, cell: bCell });
  const minute = aCell?.solvedAtMinute ?? -1;
  check("solve time is ~30 minutes into the contest", minute >= 29 && minute <= 31, minute);

  console.log("\nConcurrency");
  const crowdResults = await Promise.all(crowd.map((c) => c.judge("balanced-brackets", LANG.java, SOL.bracketsJava)));
  check(`${crowd.length} simultaneous submissions all AC`, crowdResults.every((r) => r.verdict === "AC"), crowdResults.map((r) => r.verdict));

  console.log("\nContest window");
  await setWindow(60, 120);
  const early = new Client(`e2e_early_${RUN}`);
  await early.register();
  check("submissions before start are rejected", (await early.submit("sum-of-two", LANG.cpp, SOL.sumCpp)).status === 403);
  check("problems are hidden before start", (await early.req("GET", "/problems/sum-of-two")).text.includes("not available until the contest starts"));
  check("admins can view problems before start", (await admin.req("GET", "/problems/sum-of-two")).text.includes("Sum of Two"));
  await setWindow(-120, -60);
  check("submissions after the end are rejected", (await early.submit("sum-of-two", LANG.cpp, SOL.sumCpp)).status === 403);
} catch (err) {
  crashed(err);
} finally {
  await sql`UPDATE contest SET starts_at = ${original.starts_at}, ends_at = ${original.ends_at} WHERE id = 1`;
  await deleteTestUsers();
  await sql.end();
}

finish();
