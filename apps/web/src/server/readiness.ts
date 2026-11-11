export interface ReadinessConfiguration {
  ok: boolean;
  missing: string[];
  invalid: string[];
  expectedMigrationCount: number | null;
}

const requiredNames = [
  "DATABASE_URL",
  "NEXTAUTH_URL",
  "PUBLIC_BASE_URL",
  "NEXTAUTH_SECRET",
  "AUTH_HMAC_SECRET",
  "ATTACHMENT_S3_ENDPOINT",
  "ATTACHMENT_S3_PUBLIC_ENDPOINT",
  "ATTACHMENT_S3_REGION",
  "ATTACHMENT_S3_BUCKET",
  "ATTACHMENT_S3_ACCESS_KEY_ID",
  "ATTACHMENT_S3_SECRET_ACCESS_KEY",
  "EXPECTED_PRISMA_MIGRATION_COUNT",
] as const;

const urlNames = new Set(["DATABASE_URL", "NEXTAUTH_URL", "PUBLIC_BASE_URL", "ATTACHMENT_S3_ENDPOINT", "ATTACHMENT_S3_PUBLIC_ENDPOINT"]);
const secretNames = new Set(["NEXTAUTH_SECRET", "AUTH_HMAC_SECRET", "ATTACHMENT_S3_SECRET_ACCESS_KEY"]);

export function evaluateReadinessConfiguration(
  environment: Record<string, string | undefined>,
): ReadinessConfiguration {
  const missing = requiredNames.filter((name) => !environment[name]?.trim());
  const invalid: string[] = [];

  for (const name of requiredNames) {
    const value = environment[name]?.trim();
    if (!value) continue;
    if (urlNames.has(name) && !isUrl(value)) invalid.push(name);
    if (secretNames.has(name) && isPlaceholderSecret(value)) invalid.push(name);
  }

  const expectedMigrationCount = Number(environment.EXPECTED_PRISMA_MIGRATION_COUNT);
  if (!Number.isInteger(expectedMigrationCount) || expectedMigrationCount < 1) {
    invalid.push("EXPECTED_PRISMA_MIGRATION_COUNT");
  }

  const trustProxyHeaders = environment.AUTH_TRUST_PROXY_HEADERS?.trim();
  if (trustProxyHeaders && trustProxyHeaders !== "0" && trustProxyHeaders !== "1") {
    invalid.push("AUTH_TRUST_PROXY_HEADERS");
  }

  return {
    ok: missing.length === 0 && invalid.length === 0,
    missing,
    invalid: [...new Set(invalid)],
    expectedMigrationCount: Number.isInteger(expectedMigrationCount) && expectedMigrationCount > 0
      ? expectedMigrationCount
      : null,
  };
}

function isUrl(value: string): boolean {
  try {
    void new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isPlaceholderSecret(value: string): boolean {
  const lowered = value.toLowerCase();
  return lowered.includes("replace-on-server") || lowered.includes("placeholder") || value.length < 32;
}
