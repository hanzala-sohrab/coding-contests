// Serves Monaco from this app instead of a CDN, so the editor works offline.
// Copies node_modules/monaco-editor/min/vs -> public/monaco/vs (gitignored).
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const pkg = join(root, "node_modules", "monaco-editor", "package.json");
const src = join(root, "node_modules", "monaco-editor", "min", "vs");
const destRoot = join(root, "public", "monaco");
const stamp = join(destRoot, "VERSION");

if (!existsSync(pkg)) {
  console.error("monaco-editor is not installed; run npm install");
  process.exit(1);
}
const version = JSON.parse(readFileSync(pkg, "utf8")).version;
if (existsSync(stamp) && readFileSync(stamp, "utf8") === version) process.exit(0);

rmSync(destRoot, { recursive: true, force: true });
cpSync(src, join(destRoot, "vs"), { recursive: true });
writeFileSync(stamp, version);
console.log(`Copied monaco-editor ${version} to public/monaco/vs`);
