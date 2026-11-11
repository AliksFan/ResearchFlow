import { describe, expect, it, vi } from "vitest";

import { CollaborationService } from "../src/collaboration-service.js";
import { DEFAULT_COLLABORATION_TIME_LIMITS, aggregateOpenIssueRisk } from "../src/contracts.js";
import type { CollaborationRepository } from "../src/repository-contracts.js";

function repository(): CollaborationRepository {
  return {
    listAccessibleProjects: vi.fn(async () => []),
    getExecutionOverview: vi.fn(async () => null),
    listTimeLimits: vi.fn(async () => []),
    listGlobalTimeLimits: vi.fn(async () => []),
    saveGlobalTimeLimits: vi.fn(async () => undefined),
    saveProjectTimeLimits: vi.fn(async () => undefined),
    upsertTimeLimit: vi.fn(async (input) => ({
      id: "limit-1",
      projectId: input.projectId,
      responsibilityType: input.responsibilityType,
      timeLimitDays: input.timeLimitDays,
      reminderIntervalDays: input.reminderIntervalDays,
      updatedAt: "2026-08-21T00:00:00.000Z",
    })),
  };
}

describe("CollaborationService", () => {
  it("aggregates only open issue risk with blocked precedence", () => {
    expect(aggregateOpenIssueRisk([])).toEqual({ openIssueCount: 0, issueRiskLevel: "NONE" });
    expect(aggregateOpenIssueRisk(["RISK", "NONE"])).toEqual({ openIssueCount: 2, issueRiskLevel: "RISK" });
    expect(aggregateOpenIssueRisk(["RISK", "BLOCKED", "RISK"])).toEqual({ openIssueCount: 3, issueRiskLevel: "BLOCKED" });
  });

  it("defines the approved natural-day global defaults for every responsibility type", () => {
    expect(DEFAULT_COLLABORATION_TIME_LIMITS).toEqual([
      { responsibilityType: "WORKFLOW_COMPLETION_PMO_REVIEW", timeLimitDays: 3, reminderIntervalDays: 1 },
      { responsibilityType: "PROJECT_COMPLETION_PMO_REVIEW", timeLimitDays: 3, reminderIntervalDays: 1 },
      { responsibilityType: "PROJECT_COMPLETION_SUPPLEMENT", timeLimitDays: 5, reminderIntervalDays: 2 },
      { responsibilityType: "ISSUE_DEAN_DECISION", timeLimitDays: 3, reminderIntervalDays: 1 },
      { responsibilityType: "ISSUE_PMO_IMPLEMENTATION", timeLimitDays: 5, reminderIntervalDays: 2 },
      { responsibilityType: "ISSUE_REPORTER_SUPPLEMENT", timeLimitDays: 3, reminderIntervalDays: 1 },
      { responsibilityType: "ISSUE_REPORTER_CONFIRMATION", timeLimitDays: 3, reminderIntervalDays: 1 },
    ]);
  });

  it("keeps the global-default page PMO-only", async () => {
    const service = new CollaborationService(repository());
    expect(() =>
      service.listGlobalTimeLimits({ personId: "dean", sessionId: "session", roleCode: "DEAN" }),
    ).toThrow(expect.objectContaining({ code: "COLLABORATION_FORBIDDEN" }));
  });

  it("returns one effective project row per responsibility and prefers project overrides", async () => {
    const gateway = repository();
    vi.mocked(gateway.listTimeLimits).mockResolvedValue([
      ...DEFAULT_COLLABORATION_TIME_LIMITS.map((setting, index) => ({
        ...setting,
        id: `global-${index}`,
        projectId: null,
        updatedAt: "2026-08-21T00:00:00.000Z",
      })),
      {
        id: "project-dean-decision",
        projectId: "project-1",
        responsibilityType: "ISSUE_DEAN_DECISION",
        timeLimitDays: 5,
        reminderIntervalDays: 4,
        updatedAt: "2026-08-24T00:00:00.000Z",
      },
    ]);

    const settings = await new CollaborationService(gateway).listTimeLimits(
      { personId: "pmo", sessionId: "session", roleCode: "PMO" },
      "project-1",
    );

    expect(settings).toHaveLength(DEFAULT_COLLABORATION_TIME_LIMITS.length);
    expect(settings.filter((setting) => setting.responsibilityType === "ISSUE_DEAN_DECISION"))
      .toEqual([expect.objectContaining({
        projectId: "project-1",
        source: "PROJECT_OVERRIDE",
        timeLimitDays: 5,
        reminderIntervalDays: 4,
      })]);
  });

  it("marks an explicit project override even when its values equal the global default", async () => {
    const gateway = repository();
    vi.mocked(gateway.listTimeLimits).mockResolvedValue([
      {
        id: "global-review",
        projectId: null,
        responsibilityType: "WORKFLOW_COMPLETION_PMO_REVIEW",
        timeLimitDays: 3,
        reminderIntervalDays: 1,
        updatedAt: "2026-08-21T00:00:00.000Z",
      },
      {
        id: "project-review",
        projectId: "project-1",
        responsibilityType: "WORKFLOW_COMPLETION_PMO_REVIEW",
        timeLimitDays: 3,
        reminderIntervalDays: 1,
        updatedAt: "2026-08-24T00:00:00.000Z",
      },
    ]);

    await expect(new CollaborationService(gateway).listTimeLimits(
      { personId: "key", sessionId: "session", roleCode: "KEY_SUB_I" },
      "project-1",
    )).resolves.toEqual([
      expect.objectContaining({ id: "project-review", source: "PROJECT_OVERRIDE" }),
    ]);
  });

  it("keeps Dean and Key Sub-I time-limit access read-only", async () => {
    const service = new CollaborationService(repository());
    await expect(
      service.configureTimeLimit(
        { personId: "dean", sessionId: "session", roleCode: "DEAN" },
        {
          projectId: null,
          responsibilityType: "ISSUE_DEAN_DECISION",
          timeLimitDays: 3,
          reminderIntervalDays: 1,
        },
      ),
    ).rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
  });

  it("rejects non-positive or fractional configuration", async () => {
    const service = new CollaborationService(repository());
    await expect(
      service.configureTimeLimit(
        { personId: "pmo", sessionId: "session", roleCode: "PMO" },
        {
          projectId: null,
          responsibilityType: "WORKFLOW_COMPLETION_PMO_REVIEW",
          timeLimitDays: 1.5,
          reminderIntervalDays: 1,
        },
      ),
    ).rejects.toMatchObject({ code: "INVALID_TIME_LIMIT" });
  });

  it("passes valid PMO configuration to the Repository", async () => {
    const gateway = repository();
    const service = new CollaborationService(gateway);
    await service.configureTimeLimit(
      { personId: "pmo", sessionId: "session", roleCode: "PMO" },
      {
        projectId: "project-1",
        responsibilityType: "PROJECT_COMPLETION_PMO_REVIEW",
        timeLimitDays: 5,
        reminderIntervalDays: 2,
      },
    );
    expect(gateway.upsertTimeLimit).toHaveBeenCalledOnce();
  });

  it("saves project time-limit differences in one Repository command", async () => {
    const gateway = repository();
    const actor = { personId: "pmo", sessionId: "session", roleCode: "PMO" } as const;
    await new CollaborationService(gateway).saveProjectTimeLimits(actor, {
      projectId: "project-1",
      changes: [
        {
          responsibilityType: "ISSUE_DEAN_DECISION",
          mode: "FOLLOW_GLOBAL",
          expectedProjectSettingUpdatedAt: "2026-08-24T00:00:00.000Z",
        },
        {
          responsibilityType: "ISSUE_PMO_IMPLEMENTATION",
          mode: "PROJECT_OVERRIDE",
          timeLimitDays: 5,
          reminderIntervalDays: 2,
          expectedProjectSettingUpdatedAt: null,
        },
      ],
    });
    expect(gateway.saveProjectTimeLimits).toHaveBeenCalledOnce();
    expect(gateway.upsertTimeLimit).not.toHaveBeenCalled();
  });

  it("saves global time-limit differences in one PMO-only Repository command", async () => {
    const gateway = repository();
    const actor = { personId: "pmo", sessionId: "session", roleCode: "PMO" } as const;
    await new CollaborationService(gateway).saveGlobalTimeLimits(actor, {
      changes: [{
        responsibilityType: "ISSUE_PMO_IMPLEMENTATION",
        timeLimitDays: 6,
        reminderIntervalDays: 2,
        expectedUpdatedAt: "2026-08-24T00:00:00.000Z",
      }],
    });
    expect(gateway.saveGlobalTimeLimits).toHaveBeenCalledOnce();
    expect(gateway.upsertTimeLimit).not.toHaveBeenCalled();
  });

  it("rejects unauthorized, duplicate, or invalid global time-limit batches before persistence", async () => {
    const gateway = repository();
    const service = new CollaborationService(gateway);
    const change = {
      responsibilityType: "ISSUE_DEAN_DECISION" as const,
      timeLimitDays: 3,
      reminderIntervalDays: 1,
      expectedUpdatedAt: "2026-08-24T00:00:00.000Z",
    };
    await expect(service.saveGlobalTimeLimits(
      { personId: "dean", sessionId: "session", roleCode: "DEAN" },
      { changes: [change] },
    )).rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
    await expect(service.saveGlobalTimeLimits(
      { personId: "pmo", sessionId: "session", roleCode: "PMO" },
      { changes: [change, change] },
    )).rejects.toMatchObject({ code: "INVALID_TIME_LIMIT" });
    await expect(service.saveGlobalTimeLimits(
      { personId: "pmo", sessionId: "session", roleCode: "PMO" },
      { changes: [{ ...change, timeLimitDays: 0 }] },
    )).rejects.toMatchObject({ code: "INVALID_TIME_LIMIT" });
    expect(gateway.saveGlobalTimeLimits).not.toHaveBeenCalled();
  });

  it("rejects duplicate rows and invalid override values before the batch transaction", async () => {
    const service = new CollaborationService(repository());
    const actor = { personId: "pmo", sessionId: "session", roleCode: "PMO" } as const;
    await expect(service.saveProjectTimeLimits(actor, {
      projectId: "project-1",
      changes: [
        {
          responsibilityType: "ISSUE_DEAN_DECISION",
          mode: "PROJECT_OVERRIDE",
          timeLimitDays: 0,
          reminderIntervalDays: 1,
          expectedProjectSettingUpdatedAt: null,
        },
      ],
    })).rejects.toMatchObject({ code: "INVALID_TIME_LIMIT" });
  });
});
