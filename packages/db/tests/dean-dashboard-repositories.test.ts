import type { DeanDashboardQuery } from "@researchflow/collaboration";
import { describe, expect, it, vi } from "vitest";

import { PrismaDeanDashboardRepository, buildDeanDashboardResult } from "../src/dean-dashboard-repositories.js";

const query: DeanDashboardQuery = { focus: "all", q: "", hideFinished: false, sort: "action", order: "desc", page: 1, pageSize: 50 };
const now = new Date("2026-09-01T00:00:00.000Z");

describe("Dean dashboard repository aggregation", () => {
  it("revalidates the active dean session and global role before one project query", async () => {
    const transaction = {
      session: { findFirst: vi.fn().mockResolvedValue({ id: "session" }) },
      roleAssignment: { findFirst: vi.fn().mockResolvedValue({ id: "assignment" }) },
      project: { findMany: vi.fn().mockResolvedValue(Array.from({ length: 200 }, (_, index) => row({ id: `project-${index}`, projectCode: `DEMO-${String(index).padStart(3, "0")}` }))) },
    };
    const client = { $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)) };
    const repository = new PrismaDeanDashboardRepository(client as never);

    const result = await repository.queryProjects({ personId: "dean-a", roleCode: "DEAN", sessionId: "session" }, query);

    expect(result.counts.allProjects).toBe(200);
    expect(transaction.project.findMany).toHaveBeenCalledTimes(1);
  });

  it("separates the public queue, tracking buckets and current dean review responsibility", () => {
    const result = buildDeanDashboardResult([row({ issues: [
      issue("decision", "DEAN_DECISION", "PENDING_DEAN_DECISION"),
      issue("implementation", "PMO_IMPLEMENTATION", "PENDING_PMO_IMPLEMENTATION", { decidedByPersonId: "dean-a", implementationReviewRequired: true }),
      issue("confirmation-own", "DEAN_IMPLEMENTATION_CONFIRMATION", "PENDING_DEAN_REVIEW", { decidedByPersonId: "dean-a", implementationReviewRequired: true }),
      issue("confirmation-other", "DEAN_IMPLEMENTATION_CONFIRMATION", "PENDING_DEAN_REVIEW", { decidedByPersonId: "dean-b", implementationReviewRequired: true }),
      issue("feedback", "REPORTER_RESOLUTION_CONFIRMATION", "PENDING_REPORTER_CONFIRMATION", { decidedByPersonId: "dean-b", implementationReviewRequired: false }),
    ] })], "dean-a", query, now);

    expect(result.counts).toEqual({ allProjects: 1, decisionProjects: 1, implementationProjects: 1, confirmationProjects: 1, reporterFeedbackProjects: 1 });
    expect(result.items[0]?.actionSummaries.map(({ category }) => category)).toEqual(["DEAN_DECISION", "DEAN_IMPLEMENTATION_CONFIRMATION", "PMO_IMPLEMENTATION", "REPORTER_FEEDBACK"]);
  });

  it("moves confirmation responsibility only after a transfer is accepted", () => {
    const pending = buildDeanDashboardResult([row({ issues: [issue("pending", "DEAN_IMPLEMENTATION_CONFIRMATION", "PENDING_DEAN_REVIEW", { decidedByPersonId: "dean-a", implementationReviewRequired: true })] })], "dean-b", query, now);
    const accepted = buildDeanDashboardResult([row({ issues: [issue("accepted", "DEAN_IMPLEMENTATION_CONFIRMATION", "PENDING_DEAN_REVIEW", { decidedByPersonId: "dean-a", implementationReviewRequired: true }, "dean-b")] })], "dean-b", query, now);

    expect(pending.counts.confirmationProjects).toBe(0);
    expect(accepted.counts.confirmationProjects).toBe(1);
  });

  it("does not count ordinary PMO resolution confirmation without a dean decision", () => {
    const result = buildDeanDashboardResult([row({ issues: [issue("ordinary", "REPORTER_RESOLUTION_CONFIRMATION", "PENDING_REPORTER_CONFIRMATION", null)] })], "dean-a", query, now);
    expect(result.counts.reporterFeedbackProjects).toBe(0);
  });
});

function issue(id: string, stateCode: string, status: string, deanDecision: { decidedByPersonId: string; implementationReviewRequired: boolean } | null = null, acceptedByDeanPersonId?: string) {
  return {
    id,
    projectWorkflowStageId: "node-1",
    currentRiskLevel: "RISK",
    handlingStates: [{ stateCode, enteredAt: new Date("2026-08-28T00:00:00.000Z"), dueAt: new Date("2026-08-30T00:00:00.000Z") }],
    decisionRounds: [{ status, deanDecision, reviewTransfers: acceptedByDeanPersonId ? [{ acceptedByDeanPersonId, acceptedAt: new Date("2026-08-31T00:00:00.000Z") }] : [] }],
  };
}

function row(overrides: Record<string, unknown> = {}): Parameters<typeof buildDeanDashboardResult>[0][number] {
  return {
    id: "project-1",
    projectCode: "DEMO-001",
    applicationCode: "APP-001",
    projectName: "虚构院长项目",
    status: "ACTIVE",
    leadOrganizationName: "虚构研究中心",
    updatedAt: new Date("2026-08-31T00:00:00.000Z"),
    applicant: { displayName: "虚构申请人" },
    currentApplicationVersion: null,
    establishmentReviews: [],
    roleAssignments: [{ isPrimary: true, person: { displayName: "虚构负责人" } }],
    projectPlan: { versions: [{ stageVersions: [{ projectStageId: "stage-1", stageName: "执行阶段", sortOrder: 1, applicability: "REQUIRED" }], workflowStageVersions: [{ applicability: "REQUIRED", projectWorkflowStage: { id: "node-1", projectStageId: "stage-1", executionStatus: "ACTIVE" } }] }] },
    workflowCompletionRequests: [],
    issues: [],
    completionRequests: [],
    ...overrides,
  } as Parameters<typeof buildDeanDashboardResult>[0][number];
}
