import { describe, expect, it, vi } from "vitest";

import { ProjectSwimlaneService, type ProjectSwimlaneChangeCommand, type ProjectSwimlaneRepository } from "../src/index.js";

const actor = { personId: "10000000-0000-4000-8000-000000000001", sessionId: "20000000-0000-4000-8000-000000000001", roleCode: "PMO" as const };

function command(): ProjectSwimlaneChangeCommand {
  return {
    projectId: "30000000-0000-4000-8000-000000000001", expectedRevision: "40000000-0000-4000-8000-000000000001", name: "虚构项目泳道", reason: "调整虚构项目执行安排",
    stages: [{ id: "50000000-0000-4000-8000-000000000001", code: "START", name: "启动", sortOrder: 1, applicability: "REQUIRED", plannedStartDate: null, plannedEndDate: null }],
    workflows: [{ id: "60000000-0000-4000-8000-000000000001", code: "GOV", name: "治理", description: "虚构说明", sortOrder: 1, enabled: true }],
    nodes: [{ id: "70000000-0000-4000-8000-000000000001", workflowId: "60000000-0000-4000-8000-000000000001", stageId: "50000000-0000-4000-8000-000000000001", taskName: "虚构任务", taskDescription: "", sortOrder: 1, applicability: "REQUIRED", plannedStartDate: null, plannedEndDate: null, updateIntervalDays: null, overdueReminderIntervalDays: 7, attachmentRequirement: "NONE", ownerRoles: ["KEY_SUB_I"], predecessorIds: [], executionStatus: "NOT_STARTED", hasExecutionHistory: false }],
  };
}

function repository(): ProjectSwimlaneRepository {
  return {
    getEditableSwimlane: vi.fn(),
    previewSwimlaneChange: vi.fn(async () => ({ swimlaneNameChanges: 0, stageChanges: 0, workflowChanges: 0, nodeChanges: 0, nodesWithHistory: 0, nodesBecomingNotApplicable: 0, completionRequestsToTerminate: 0, openIssuesPreserved: 0, scheduleOrResponsibilityChanges: 0 })),
    applySwimlaneChange: vi.fn(async () => ({ swimlaneName: "虚构项目泳道", activatedAt: "2026-09-02T00:00:00.000Z", impact: { swimlaneNameChanges: 0, stageChanges: 0, workflowChanges: 0, nodeChanges: 0, nodesWithHistory: 0, nodesBecomingNotApplicable: 0, completionRequestsToTerminate: 0, openIssuesPreserved: 0, scheduleOrResponsibilityChanges: 0 } })),
  };
}

describe("ProjectSwimlaneService", () => {
  it("rejects dean and non-primary access before mutation", async () => {
    const gateway = repository();
    await expect(new ProjectSwimlaneService(gateway).apply({ ...actor, roleCode: "DEAN" }, command())).rejects.toMatchObject({ code: "PROJECT_SWIMLANE_FORBIDDEN" });
    expect(gateway.applySwimlaneChange).not.toHaveBeenCalled();
  });

  it("requires a reason and a complete graph", async () => {
    const service = new ProjectSwimlaneService(repository());
    await expect(service.apply(actor, { ...command(), reason: " " })).rejects.toMatchObject({ code: "PROJECT_SWIMLANE_INVALID_INPUT" });
    await expect(service.apply(actor, { ...command(), nodes: [] })).rejects.toMatchObject({ code: "PROJECT_SWIMLANE_INVALID_GRAPH" });
  });

  it("normalizes the approved full-graph command before delegating", async () => {
    const gateway = repository();
    await new ProjectSwimlaneService(gateway).apply(actor, { ...command(), name: "  虚构泳道Ａ  ", reason: "  项目级调整  " });
    expect(gateway.applySwimlaneChange).toHaveBeenCalledWith(actor, expect.objectContaining({ name: "虚构泳道A", reason: "项目级调整" }));
  });
});
