export function readDefaultPmoSeedConfig(
  environment: Record<string, string | undefined>,
): { databaseUrl: string; initialPassword: string } {
  const databaseUrl = environment.DATABASE_URL;
  const initialPassword = environment.INITIAL_PMO_PASSWORD;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!initialPassword) throw new Error("INITIAL_PMO_PASSWORD is required");
  return { databaseUrl, initialPassword };
}

export function assertTestSeedAllowed(
  environment: Record<string, string | undefined>,
): void {
  if (environment.NODE_ENV === "production") {
    throw new Error("Test seed is forbidden in production");
  }
}
