import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/client.js";

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const schema = readSchema(databaseUrl);
  return new PrismaClient({
    adapter: new PrismaPg(
      {
        connectionString: databaseUrl,
        ...(schema ? { options: `-c search_path=${schema}` } : {}),
      },
      { schema },
    ),
  });
}

function readSchema(databaseUrl: string): string | undefined {
  const schema = new URL(databaseUrl).searchParams.get("schema")?.trim();
  if (!schema) return undefined;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(schema)) {
    throw new Error("DATABASE_URL schema must be a simple PostgreSQL identifier");
  }
  return schema;
}

export type ApplicationPrismaClient = ReturnType<typeof createPrismaClient>;
