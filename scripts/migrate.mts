import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "../src/lib/db";

await sql.unsafe(readFileSync(join(import.meta.dirname, "..", "db", "schema.sql"), "utf8"));
console.log("Schema is up to date.");
await sql.end();
