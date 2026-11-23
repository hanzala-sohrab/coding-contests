"use client";

import { useRouter } from "next/navigation";
import { CodeWorkspace } from "./code-workspace";

/** Contest submission: posts the code and opens the submission page. */
export function SubmitForm({ problem }: { problem: string }) {
  const router = useRouter();
  return (
    <CodeWorkspace
      onSubmit={async (languageId, sourceCode) => {
        const res = await fetch("/api/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ problem, languageId, sourceCode }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.id) {
          router.push(`/submissions/${data.id}`);
          return null;
        }
        return data?.error ?? "Submission failed";
      }}
    />
  );
}
