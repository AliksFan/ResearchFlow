import { checkDatabaseReadiness } from "@researchflow/db";
import { NextResponse } from "next/server";

import { evaluateReadinessConfiguration } from "@/server/readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const config = evaluateReadinessConfiguration(process.env);
  const database = config.ok && config.expectedMigrationCount
    ? await checkDatabaseReadiness({
      databaseUrl: process.env.DATABASE_URL!,
      expectedMigrationCount: config.expectedMigrationCount,
    })
    : null;
  const ready = config.ok && database?.status === "ok";

  return NextResponse.json(
    {
      status: ready ? "ready" : "not_ready",
      service: "researchflow-web",
      checks: {
        config: {
          status: config.ok ? "ok" : "failed",
          missing: config.missing,
          invalid: config.invalid,
        },
        database,
      },
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
