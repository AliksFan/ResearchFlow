import type { PmoDashboardQuery } from "@researchflow/collaboration";
import { describe, expect, it, vi } from "vitest";

import { PrismaPmoDashboardRepository, buildDashboardResult } from "../src/pmo-dashboard-repositories.js";

const query: PmoDashboardQuery = { focus: "all", applicationView: "active", q: "", hideFinished: false, sort: "action", order: "desc", page: 1, pageSize: 50 };
const now = new Date("2026-09-01T00:00:00.000Z");

describe("PMO dashboard repository aggregation", () => {
  it("revalidates the active PMO session and global role before one bounded project query", async () => {
    const transaction = {
      session: { findFirst: vi.fn().mockResolvedValue({ id: "session" }) },
      roleAssignment: { findFirst: vi.fn().mockResolvedValue({ id: "assignment" }) },
      project: { findMany: vi.fn().mockResolvedValue(Array.from({ length: 200 }, (_, index) => row({ id: `project-${index}`, projectCode: `DEMO-${String(index).padStart(3, "0")}` }))) },
    };
    const client = { $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)) };
    const repository = new PrismaPmoDashboardRepository(client as never);

    const result = await repository.queryProjects({ personId: "person", roleCode: "PMO", sessionId: "session" }, query);

    expect(result.counts.allItems).toBe(200);
    expect(transaction.session.findFirst).toHaveBeenCalledTimes(1);
    expect(transaction.roleAssignment.findFirst).toHaveBeenCalledTimes(1);
    expect(transaction.project.findMany).toHaveBeenCalledTimes(1);
  });

  it("does not query projects when the active global PMO role is missing", async () => {
    const transaction = {
      session: { findFirst: vi.fn().mockResolvedValue({ id: "session" }) },
      roleAssignment: { findFirst: vi.fn().mockResolvedValue(null) },
      project: { findMany: vi.fn() },
    };
    const client = { $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)) };
    const repository = new PrismaPmoDashboardRepository(client as never);

    await expect(repository.queryProjects({ personId: "person", roleCode: "PMO", sessionId: "session" }, query)).rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
    expect(transaction.project.findMany).not.toHaveBeenCalled();
  });

  it("deduplicates project counts while preserving overlapping work buckets and task counts", () => {
    const result = buildDashboardResult([row({
      workflowCompletionRequests: [{ projectWorkflowStageId: "node-1", reviewRounds: [{ startedAt: new Date("2026-08-29T00:00:00.000Z"), dueAt: new Date("2026-08-31T00:00:00.000Z") }] }],
      issues: [issue("issue-1"), issue("issue-2")],
      completionRequests: [{ status: "CLOSURE_PENDING_PMO_REVIEW", blocks: [], reviewRounds: [{ startedAt: new Date("2026-08-30T00:00:00.000Z"), dueAt: new Date("2026-09-02T00:00:00.000Z") }], supplementRounds: [] }],
    })], query, now);

    expect(result.counts).toEqual({ allItems: 1, applicationItems: 0, pendingPmoProjects: 1, pendingDeanProjects: 0, implementationProjects: 1, confirmationClosureProjects: 1 });
    const project = result.items[0];
    expect(project?.itemType).toBe("FORMAL_PROJECT");
    if (project?.itemType !== "FORMAL_PROJECT") throw new Error("expected formal project");
    expect(project.actionSummaries.find(({ category }) => category === "PMO")?.taskCount).toBe(4);
    expect(project.actionSummaries.find(({ category }) => category === "PMO_IMPLEMENTATION")?.taskCount).toBe(2);
  });

  it("keeps global counts stable when hide-finished and search filters remove rows", () => {
    const rows = [row({ projectName: "虚构进行中项目" }), row({ id: "project-2", projectCode: "DEMO-002", projectName: "虚构已归档项目", status: "ARCHIVED" })];
    const result = buildDashboardResult(rows, { ...query, q: "不存在", hideFinished: true }, now);

    expect(result.counts.allItems).toBe(2);
    expect(result.filteredTotal).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("normalizes full-width and case variants in repository search", () => {
    const result = buildDashboardResult([row({ projectName: "ABC 虚构项目" })], { ...query, q: "ａｂｃ" }, now);
    expect(result.filteredTotal).toBe(1);
  });

  it("counts CLOSING projects in confirmation and closure even when responsibility time is missing", () => {
    const result = buildDashboardResult([row({ status: "CLOSING" })], query, now);
    expect(result.counts.confirmationClosureProjects).toBe(1);
    const project = result.items[0];
    expect(project?.itemType).toBe("FORMAL_PROJECT");
    if (project?.itemType !== "FORMAL_PROJECT") throw new Error("expected formal project");
    expect(project.actionSummaries).toContainEqual(expect.objectContaining({ category: "CLOSURE", oldestStartedAt: null }));
  });

  it("keeps missing owners last in both sort directions", () => {
    const rows = [row({ id: "missing", projectCode: "DEMO-002", roleAssignments: [] }), row({ id: "owned", projectCode: "DEMO-001" })];
    for (const order of ["asc", "desc"] as const) {
      const result = buildDashboardResult(rows, { ...query, sort: "owner", order }, now);
      expect(result.items.map(({ projectId }) => projectId)).toEqual(["owned", "missing"]);
    }
  });

  it("places active applications beside formal projects and filters application history without duplicating established projects", () => {
    const rows = [
      row(),
      row({ id: "application-review", projectCode: null, applicationCode: "APP-002", projectName: "虚构待审核申请", status: "PENDING_ESTABLISHMENT_REVIEW" }),
      row({ id: "application-rejected", projectCode: null, applicationCode: "APP-003", projectName: "虚构已拒绝申请", status: "REJECTED" }),
    ];
    const all = buildDashboardResult(rows, query, now);
    expect(all.counts).toMatchObject({ allItems: 2, applicationItems: 1 });
    expect(all.items.map(({ itemType }) => itemType)).toContain("PROJECT_APPLICATION");

    const finished = buildDashboardResult(rows, { ...query, focus: "applications", applicationView: "finished" }, now);
    expect(finished.items).toEqual([expect.objectContaining({ itemType: "PROJECT_APPLICATION", applicationCode: "APP-003", applicationStatus: "REJECTED" })]);
  });
});

function issue(id: string) {
  return { id, projectWorkflowStageId: "node-1", currentRiskLevel: "RISK", handlingStates: [{ stateCode: "PMO_IMPLEMENTATION", enteredAt: new Date("2026-08-28T00:00:00.000Z"), dueAt: new Date("2026-08-30T00:00:00.000Z") }], decisionRounds: [{ status: "PENDING_PMO_IMPLEMENTATION" }] };
}

function row(overrides: Record<string, unknown> = {}): Parameters<typeof buildDashboardResult>[0][number] {
  return {
    id: "project-1",
    projectCode: "DEMO-001",
    applicationCode: "APP-001",
    projectName: "虚构神经研究项目",
    status: "ACTIVE",
    leadOrganizationName: "虚构研究中心",
    updatedAt: new Date("2026-08-31T00:00:00.000Z"),
    applicant: { displayName: "虚构申请人" },
    currentApplicationVersion: { projectName: "虚构神经研究项目", owners: [{ person: { displayName: "虚构拟任负责人" } }] },
    establishmentReviews: [{ submittedAt: new Date("2026-08-30T00:00:00.000Z") }],
    roleAssignments: [{ isPrimary: true, person: { displayName: "虚构负责人" } }],
    projectPlan: { versions: [{ stageVersions: [{ projectStageId: "stage-1", stageName: "执行阶段", sortOrder: 1, applicability: "REQUIRED" }], workflowStageVersions: [{ applicability: "REQUIRED", projectWorkflowStage: { id: "node-1", projectStageId: "stage-1", executionStatus: "ACTIVE" } }] }] },
    workflowCompletionRequests: [],
    issues: [],
    completionRequests: [],
    ...overrides,
  } as Parameters<typeof buildDashboardResult>[0][number];
}
