import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig, env } from "prisma/config";

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceEnvPath = resolve(packageDirectory, "../../.env");

if (existsSync(workspaceEnvPath)) {
  loadEnvFile(workspaceEnvPath);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});

