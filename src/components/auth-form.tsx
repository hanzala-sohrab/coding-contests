"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const input = "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    setError((await res.json().catch(() => null))?.error ?? "Something went wrong");
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-8 max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">{mode === "login" ? "Sign in" : "Create an account"}</h1>
      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">Username</span>
        <input name="username" required autoComplete="username" className={input} pattern="[A-Za-z0-9_]{3,20}" title="3–20 letters, digits or underscores" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={mode === "register" ? 8 : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className={input}
        />
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        disabled={busy}
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
      </button>
      <p className="text-center text-sm text-zinc-500">
        {mode === "login" ? (
          <>No account? <Link href="/register" className="underline">Register</Link></>
        ) : (
          <>Already registered? <Link href="/login" className="underline">Sign in</Link></>
        )}
      </p>
    </form>
  );
}
