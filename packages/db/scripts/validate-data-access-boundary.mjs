import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDirectory = resolve(packageDirectory, "../..");
const protectedRoots = [
  resolve(appDirectory, "apps/web/src"),
  resolve(appDirectory, "packages/auth/src"),
];
const sourceExtensions = new Set([".js", ".mjs", ".ts", ".tsx"]);
const forbiddenPatterns = [
  /from\s+["']@prisma\//,
  /from\s+["'][^"']*generated\/client(?:\.js)?["']/,
  /\bprisma\.[a-zA-Z]/,
  /\$queryRaw|\$executeRaw/,
];

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return listSourceFiles(path);
      return sourceExtensions.has(extname(entry.name)) ? [path] : [];
    }),
  );
  return nested.flat();
}

const failures = [];
for (const root of protectedRoots) {
  for (const path of await listSourceFiles(root)) {
    const source = await readFile(path, "utf8");
    if (forbiddenPatterns.some((pattern) => pattern.test(source))) {
      failures.push(path.replace(`${appDirectory}\\`, ""));
    }
  }
}

if (failures.length > 0) {
  console.error("Repository data-access boundary validation failed:");
  for (const path of failures) console.error(`- ${path}`);
  process.exitCode = 1;
} else {
  console.log("Repository data-access boundary validation passed.");
}
