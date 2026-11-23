"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LANGUAGES } from "@/lib/languages";
import { CodeEditor } from "./code-editor";

export function SubmitForm({ problem }: { problem: string }) {
  const router = useRouter();
  const [languageId, setLanguageId] = useState<number>(LANGUAGES[0].id);
  const [code, setCode] = useState<string>(LANGUAGES[0].template);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function changeLanguage(id: number) {
    const prev = LANGUAGES.find((l) => l.id === languageId);
    const next = LANGUAGES.find((l) => l.id === id);
    // Swap the template only if the editor still holds the untouched previous one.
    if (next && (code.trim() === "" || code === prev?.template)) setCode(next.template);
    setLanguageId(id);
  }

  const language = LANGUAGES.find((l) => l.id === languageId) ?? LANGUAGES[0];

  async function submit() {
    if (busy || code.trim() === "") return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem, languageId, sourceCode: code }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.id) {
      router.push(`/submissions/${data.id}`);
      return;
    }
    setError(data?.error ?? "Submission failed");
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={languageId}
          onChange={(e) => changeLanguage(Number(e.target.value))}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          name="language"
          aria-label="Language"
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        {languageId === 62 && <span className="text-xs text-zinc-500">Your class must be named <code>Main</code>.</span>}
      </div>
      <CodeEditor value={code} onChange={setCode} language={language.monaco} onSubmitShortcut={submit} />
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || code.trim() === ""}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "Submitting…" : "Submit"}
        </button>
        <span className="text-xs text-zinc-500">or Ctrl/⌘ + Enter</span>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}
