import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const appRoot = resolve(import.meta.dirname, "../../..");
const excluded = new Set(["node_modules", ".next", "generated", "coverage"]);
const extensions = new Set([".ts", ".tsx", ".mjs", ".js"]);
const unsafeLog = /console\.(?:log|info|warn|error)\([^\n]*(?:password|passwordHash|token|cookie|authorization|DATABASE_URL|secretAccessKey|storageObjectKey)/i;
const findings = [];
walk(appRoot);
if (findings.length) {
  console.error("Log redaction validation failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}
console.log("Log redaction validation passed.");

function walk(directory) {
  for (const name of readdirSync(directory)) {
    if (excluded.has(name) || name.startsWith(".next-")) continue;
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (extensions.has(extname(path))) {
      const text = readFileSync(path, "utf8");
      if (unsafeLog.test(text)) findings.push(`${relative(appRoot, path)}: direct sensitive value logging`);
    }
  }
}
