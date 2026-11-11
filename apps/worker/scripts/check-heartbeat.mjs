/* global process, URL */

import pg from "pg";

const workerId = process.env.WORKER_ID?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim();
const maxAgeSeconds = Number(process.env.WORKER_HEARTBEAT_MAX_AGE_SECONDS ?? "120");

if (!workerId || !databaseUrl || !Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 10) {
  process.exit(1);
}

const schema = new URL(databaseUrl).searchParams.get("schema")?.trim();
const client = new pg.Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 3_000,
  application_name: "researchflow-worker-heartbeat-check",
  ...(schema ? { options: `-c search_path=${schema}` } : {}),
});

try {
  await client.connect();
  const result = await client.query(
    `
      SELECT 1
      FROM "worker_heartbeat"
      WHERE "worker_id" = $1
        AND "status" = 'RUNNING'
        AND "last_seen_at" >= now() - ($2::int * interval '1 second')
      LIMIT 1
    `,
    [workerId, maxAgeSeconds],
  );
  process.exit(result.rowCount === 1 ? 0 : 1);
} catch {
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}
