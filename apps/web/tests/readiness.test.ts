import { describe, expect, it } from "vitest";

import { evaluateReadinessConfiguration } from "../src/server/readiness";

const completeEnvironment = {
  DATABASE_URL: "postgresql://runtime:secret@postgres:5432/researchflow_prod?schema=public",
  NEXTAUTH_URL: "https://researchflow.example.internal",
  PUBLIC_BASE_URL: "https://researchflow.example.internal",
  NEXTAUTH_SECRET: "virtual-next-auth-secret-at-least-32-bytes",
  AUTH_HMAC_SECRET: "virtual-auth-hmac-secret-at-least-32-bytes",
  ATTACHMENT_S3_ENDPOINT: "http://minio:9000",
  ATTACHMENT_S3_PUBLIC_ENDPOINT: "https://researchflow-files.example.internal",
  ATTACHMENT_S3_REGION: "us-east-1",
  ATTACHMENT_S3_BUCKET: "researchflow-attachments-prod",
  ATTACHMENT_S3_ACCESS_KEY_ID: "prod-access-key-placeholder-name",
  ATTACHMENT_S3_SECRET_ACCESS_KEY: "virtual-s3-secret-at-least-32-bytes",
  EXPECTED_PRISMA_MIGRATION_COUNT: "16",
};

describe("readiness configuration", () => {
  it("accepts a complete production readiness contract without exposing values", () => {
    expect(evaluateReadinessConfiguration(completeEnvironment)).toEqual({
      ok: true,
      missing: [],
      invalid: [],
      expectedMigrationCount: 16,
    });
  });

  it("reports missing and unsafe placeholders by variable name only", () => {
    const result = evaluateReadinessConfiguration({
      ...completeEnvironment,
      DATABASE_URL: "",
      NEXTAUTH_SECRET: "replace-on-server-with-random-secret",
      EXPECTED_PRISMA_MIGRATION_COUNT: "not-a-number",
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["DATABASE_URL"]);
    expect(result.invalid).toEqual(["NEXTAUTH_SECRET", "EXPECTED_PRISMA_MIGRATION_COUNT"]);
  });
});
