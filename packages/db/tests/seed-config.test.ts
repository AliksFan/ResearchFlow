import { describe, expect, it } from "vitest";

import { assertTestSeedAllowed, readDefaultPmoSeedConfig } from "../src/index.js";

describe("seed configuration", () => {
  it("requires the default PMO password from the environment", () => {
    expect(() =>
      readDefaultPmoSeedConfig({ DATABASE_URL: "postgresql://invalid.local/test" }),
    ).toThrowError("INITIAL_PMO_PASSWORD is required");
  });

  it("never embeds or returns a fallback password", () => {
    expect(
      readDefaultPmoSeedConfig({
        DATABASE_URL: "postgresql://invalid.local/test",
        INITIAL_PMO_PASSWORD: "injected-value",
      }).initialPassword,
    ).toBe("injected-value");
  });

  it("hard rejects test seed in production", () => {
    expect(() => assertTestSeedAllowed({ NODE_ENV: "production" })).toThrowError(
      "Test seed is forbidden in production",
    );
    expect(() => assertTestSeedAllowed({ NODE_ENV: "test" })).not.toThrow();
  });
});
