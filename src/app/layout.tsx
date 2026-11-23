import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coding Contest",
  description: "Local programming contest judged by Judge0",
};

const navLink = "rounded-md px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-1 px-4 py-3">
            <Link href="/" className="mr-3 font-semibold tracking-tight">
              Contest
            </Link>
            <Link href="/" className={navLink}>Problems</Link>
            <Link href="/leaderboard" className={navLink}>Leaderboard</Link>
            <Link href="/game" className={navLink}>Fastest Finger</Link>
            {user && <Link href="/submissions" className={navLink}>{user.isAdmin ? "All submissions" : "My submissions"}</Link>}
            <div className="ml-auto flex items-center gap-2 text-sm">
              {user ? (
                <>
                  <span className="text-zinc-500">
                    {user.username}
                    {user.isAdmin && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">admin</span>}
                  </span>
                  <LogoutButton />
                </>
              ) : (
                <>
                  <Link href="/login" className={navLink}>Sign in</Link>
                  <Link href="/register" className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
                    Register
                  </Link>
                </>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
