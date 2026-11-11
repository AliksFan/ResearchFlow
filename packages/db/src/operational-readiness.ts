import { createPrismaClient } from "./client.js";
import type { ApplicationPrismaClient } from "./client.js";

export interface MigrationReadinessSummary {
  status: "ok" | "failed";
  successfulCount: number;
  expectedCount: number;
  unfinishedCount: number;
  rolledBackCount: number;
  latestFinishedAt: string | null;
}

export interface DatabaseReadinessSummary {
  status: "ok" | "failed";
  migrations: MigrationReadinessSummary | null;
  errorCode?: string;
}

export async function checkDatabaseReadiness(input: {
  databaseUrl: string;
  expectedMigrationCount: number;
}): Promise<DatabaseReadinessSummary> {
  let client: ApplicationPrismaClient | null = null;
  try {
    client = createPrismaClient(input.databaseUrl);
    await client.$queryRaw`SELECT 1`;
    const result = await client.$queryRaw<Array<{
      successfulCount: number;
      unfinishedCount: number;
      rolledBackCount: number;
      latestFinishedAt: Date | null;
    }>>`
      SELECT
        COUNT(*) FILTER (WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL)::int AS "successfulCount",
        COUNT(*) FILTER (WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL)::int AS "unfinishedCount",
        COUNT(*) FILTER (WHERE "rolled_back_at" IS NOT NULL)::int AS "rolledBackCount",
        MAX("finished_at") AS "latestFinishedAt"
      FROM "_prisma_migrations"
    `;
    const migrations = summarizeMigrationReadiness(result[0], input.expectedMigrationCount);
    return {
      status: migrations.status,
      migrations,
    };
  } catch (error) {
    return {
      status: "failed",
      migrations: null,
      errorCode: safeDatabaseErrorCode(error),
    };
  } finally {
    await client?.$disconnect().catch(() => undefined);
  }
}

export function summarizeMigrationReadiness(
  row: {
    successfulCount: number;
    unfinishedCount: number;
    rolledBackCount: number;
    latestFinishedAt: Date | string | null;
  },
  expectedCount: number,
): MigrationReadinessSummary {
  const successfulCount = Number(row.successfulCount);
  const unfinishedCount = Number(row.unfinishedCount);
  const rolledBackCount = Number(row.rolledBackCount);
  const status = successfulCount === expectedCount && unfinishedCount === 0
    ? "ok"
    : "failed";
  return {
    status,
    successfulCount,
    expectedCount,
    unfinishedCount,
    rolledBackCount,
    latestFinishedAt: row.latestFinishedAt instanceof Date
      ? row.latestFinishedAt.toISOString()
      : row.latestFinishedAt,
  };
}

function safeDatabaseErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 80);
  }
  return "DATABASE_READINESS_FAILED";
}
