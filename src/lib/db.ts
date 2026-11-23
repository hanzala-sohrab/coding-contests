import postgres from "postgres";

// Reuse one pool across dev hot reloads.
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

export const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL ?? "postgres://contest:contest@127.0.0.1:5434/contest", {
    max: 10,
    onnotice: () => {},
  });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
