import { describe, expect, it } from "vitest";

import { summarizeMigrationReadiness } from "../src/operational-readiness.js";

describe("summarizeMigrationReadiness", () => {
  it("requires the exact expected successful migration count", () => {
    expect(summarizeMigrationReadiness({
      successfulCount: 16,
      unfinishedCount: 0,
      rolledBackCount: 0,
      latestFinishedAt: new Date("2026-09-03T08:00:00.000Z"),
    }, 16)).toEqual({
      status: "ok",
      successfulCount: 16,
      expectedCount: 16,
      unfinishedCount: 0,
      rolledBackCount: 0,
      latestFinishedAt: "2026-09-03T08:00:00.000Z",
    });
  });

  it("fails readiness when migration history is incomplete or unexpected", () => {
    expect(summarizeMigrationReadiness({
      successfulCount: 15,
      unfinishedCount: 0,
      rolledBackCount: 0,
      latestFinishedAt: null,
    }, 16).status).toBe("failed");
    expect(summarizeMigrationReadiness({
      successfulCount: 17,
      unfinishedCount: 0,
      rolledBackCount: 0,
      latestFinishedAt: null,
    }, 16).status).toBe("failed");
  });

  it("keeps recovered rolled-back attempts visible without blocking readiness", () => {
    expect(summarizeMigrationReadiness({
      successfulCount: 16,
      unfinishedCount: 0,
      rolledBackCount: 1,
      latestFinishedAt: "2026-09-03T09:22:21.910Z",
    }, 16)).toEqual({
      status: "ok",
      successfulCount: 16,
      expectedCount: 16,
      unfinishedCount: 0,
      rolledBackCount: 1,
      latestFinishedAt: "2026-09-03T09:22:21.910Z",
    });
  });
});
