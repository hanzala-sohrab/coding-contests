"use client";

import { useState } from "react";
import { LANGUAGES } from "@/lib/languages";
import { CodeEditor } from "./code-editor";

/**
 * Language picker + Monaco editor + submit button.
 * `onSubmit` resolves to an error message, or null on success.
 */
export function CodeWorkspace({
  onSubmit,
  disabled = false,
  disabledReason,
}: {
  onSubmit: (languageId: number, sourceCode: string) => Promise<string | null>;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [languageId, setLanguageId] = useState<number>(LANGUAGES[0].id);
  const [code, setCode] = useState<string>(LANGUAGES[0].template);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const language = LANGUAGES.find((l) => l.id === languageId) ?? LANGUAGES[0];

  function changeLanguage(id: number) {
    const next = LANGUAGES.find((l) => l.id === id);
    // Swap the template only if the editor still holds the untouched previous one.
    if (next && (code.trim() === "" || code === language.template)) setCode(next.template);
    setLanguageId(id);
  }

  async function submit() {
    if (busy || disabled || code.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      setError(await onSubmit(languageId, code));
    } catch {
      setError("Submission failed");
    } finally {
      setBusy(false);
    }
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
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || disabled || code.trim() === ""}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "Submitting…" : "Submit"}
        </button>
        <span className="text-xs text-zinc-500">or Ctrl/⌘ + Enter</span>
        {disabled && disabledReason && <span className="text-sm text-zinc-500">{disabledReason}</span>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}
