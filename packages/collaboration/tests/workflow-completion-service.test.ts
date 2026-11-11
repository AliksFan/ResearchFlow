import { describe, expect, it, vi } from "vitest";

import {
  CollaborationError,
  WorkflowCompletionService,
  canApproveWorkflowCompletion,
  deriveInitialCompletionStatus,
  type WorkflowCompletionRepository,
  validateWorkflowDependencyGraph,
} from "../src/index.js";

function completionRepository(): WorkflowCompletionRepository {
  return {
    list: async () => [],
    submit: async (input) => ({
      id: "request-1",
      projectId: input.projectId,
      projectWorkflowStageId: input.projectWorkflowStageId,
      status: "PENDING_PMO_REVIEW",
      rowVersion: 0,
      attachmentRequirement: "NONE",
      submissionNo: 1,
      progressSummary: input.progressSummary,
      basis: input.basis,
      expectedCompletionDate: input.expectedCompletionDate,
      submittedByPersonId: input.actor.personId,
      submittedAt: "2026-08-24T00:00:00.000Z",
      lastActivityAt: "2026-08-24T00:00:00.000Z",
      supplements: [],
      attachments: [],
      reviewRound: null,
    }),
    supplement: async () => undefined,
    withdraw: async () => undefined,
    reconfirm: async () => undefined,
    resubmit: async () => undefined,
    review: async () => undefined,
    synchronizeIssueGate: async () => undefined,
    revokeFormalCompletion: async () => undefined,
    activatePlanChange: async () => undefined,
  };
}

describe("workflow dependency graph", () => {
  const nodes = [
    { id: "required-root", applicability: "REQUIRED" as const },
    { id: "optional-leaf", applicability: "OPTIONAL" as const },
    { id: "required-leaf", applicability: "REQUIRED" as const },
    { id: "excluded", applicability: "NOT_APPLICABLE" as const },
  ];

  it.each([
    [["required-root", "required-root"], "WORKFLOW_DEPENDENCY_SELF_REFERENCE"],
    [["missing", "required-root"], "WORKFLOW_DEPENDENCY_NODE_NOT_FOUND"],
  ] as const)("rejects invalid edge %j", (edge, code) => {
    expect(() => validateWorkflowDependencyGraph(nodes, [edge])).toThrow(
      expect.objectContaining({ code }),
    );
  });

  it("rejects a cycle", () => {
    expect(() => validateWorkflowDependencyGraph(nodes, [
      ["required-root", "required-leaf"],
      ["required-leaf", "required-root"],
    ])).toThrow(expect.objectContaining({ code: "WORKFLOW_DEPENDENCY_CYCLE" }));
  });

  it("rejects an applicable node depending on a not-applicable node", () => {
    expect(() => validateWorkflowDependencyGraph(nodes, [
      ["excluded", "optional-leaf"],
    ])).toThrow(expect.objectContaining({
      code: "WORKFLOW_DEPENDENCY_NOT_APPLICABLE_PREDECESSOR",
    }));
  });

  it("rejects a required node with an indirect optional ancestor", () => {
    expect(() => validateWorkflowDependencyGraph(nodes, [
      ["optional-leaf", "required-root"],
      ["required-root", "required-leaf"],
    ])).toThrow(expect.objectContaining({
      code: "WORKFLOW_DEPENDENCY_REQUIRED_HAS_OPTIONAL_ANCESTOR",
    }));
  });

  it("accepts an acyclic graph where optional nodes depend on required nodes", () => {
    expect(() => validateWorkflowDependencyGraph(nodes, [
      ["required-root", "optional-leaf"],
      ["required-root", "required-leaf"],
    ])).not.toThrow();
  });
});

describe("workflow completion gates", () => {
  it("waits for every direct predecessor before starting PMO review", () => {
    expect(deriveInitialCompletionStatus(["COMPLETED", "ACTIVE"], false))
      .toBe("WAITING_FOR_PREDECESSOR");
  });

  it("enters the problem observation state only after predecessors are complete", () => {
    expect(deriveInitialCompletionStatus(["COMPLETED"], true))
      .toBe("ISSUE_RESOLUTION_REQUIRED");
  });

  it("starts PMO review when predecessors are complete and no open issue exists", () => {
    expect(deriveInitialCompletionStatus(["COMPLETED"], false))
      .toBe("PENDING_PMO_REVIEW");
  });

  it("blocks approval until predecessor, issue, and required-attachment gates all pass", () => {
    expect(() => canApproveWorkflowCompletion({
      requestStatus: "PENDING_PMO_REVIEW",
      predecessorExecutionStatuses: ["COMPLETED", "PENDING_COMPLETION_CONFIRMATION"],
      hasOpenIssue: false,
      attachmentRequirement: "REQUIRED",
      availableAttachmentCount: 1,
    })).toThrow(expect.objectContaining({ code: "WORKFLOW_COMPLETION_PREDECESSOR_BLOCKED" }));

    expect(() => canApproveWorkflowCompletion({
      requestStatus: "PENDING_PMO_REVIEW",
      predecessorExecutionStatuses: ["COMPLETED"],
      hasOpenIssue: true,
      attachmentRequirement: "REQUIRED",
      availableAttachmentCount: 1,
    })).toThrow(expect.objectContaining({ code: "WORKFLOW_COMPLETION_ISSUE_BLOCKED" }));

    expect(() => canApproveWorkflowCompletion({
      requestStatus: "PENDING_PMO_REVIEW",
      predecessorExecutionStatuses: ["COMPLETED"],
      hasOpenIssue: false,
      attachmentRequirement: "REQUIRED",
      availableAttachmentCount: 0,
    })).toThrow(expect.objectContaining({ code: "WORKFLOW_COMPLETION_ATTACHMENT_REQUIRED" }));
  });

  it("allows approval only for a pending review with all gates satisfied", () => {
    expect(canApproveWorkflowCompletion({
      requestStatus: "PENDING_PMO_REVIEW",
      predecessorExecutionStatuses: ["COMPLETED"],
      hasOpenIssue: false,
      attachmentRequirement: "REQUIRED",
      availableAttachmentCount: 1,
    })).toBeUndefined();
  });

  it("uses collaboration error values for stable service error mapping", () => {
    expect(new CollaborationError("WORKFLOW_COMPLETION_CONFLICT").code)
      .toBe("WORKFLOW_COMPLETION_CONFLICT");
  });
});

describe("WorkflowCompletionService", () => {
  const keySubI = { personId: "key", sessionId: "session", roleCode: "KEY_SUB_I" } as const;
  const pmo = { personId: "pmo", sessionId: "session", roleCode: "PMO" } as const;

  it("normalizes and forwards a Key Sub-I submission", async () => {
    const repository = completionRepository();
    const submit = vi.spyOn(repository, "submit");
    await new WorkflowCompletionService(repository).submit(keySubI, {
      projectId: "project-1",
      projectWorkflowStageId: "node-1",
      expectedNodeRowVersion: 0,
      progressSummary: " 完成虚拟节点 ",
      basis: " 虚拟项目级依据 ",
      expectedCompletionDate: null,
      attachmentDraftIds: [],
    });
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      actor: keySubI,
      progressSummary: "完成虚拟节点",
      basis: "虚拟项目级依据",
    }));
  });

  it.each(["PMO", "DEAN"] as const)("rejects %s submission", async (roleCode) => {
    const repository = completionRepository();
    await expect(new WorkflowCompletionService(repository).submit(
      { personId: roleCode.toLowerCase(), sessionId: "session", roleCode },
      {
        projectId: "project-1",
        projectWorkflowStageId: "node-1",
        expectedNodeRowVersion: 0,
        progressSummary: "完成",
        basis: "依据",
        expectedCompletionDate: null,
        attachmentDraftIds: [],
      },
    )).rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
  });

  it("requires optimistic concurrency on every mutation", async () => {
    const service = new WorkflowCompletionService(completionRepository());
    await expect(service.withdraw(keySubI, {
      projectId: "project-1",
      completionRequestId: "request-1",
      expectedRowVersion: -1,
      reason: "继续执行",
    })).rejects.toMatchObject({ code: "WORKFLOW_COMPLETION_INVALID_INPUT" });
  });

  it("keeps review PMO-only and requires a decision comment", async () => {
    const service = new WorkflowCompletionService(completionRepository());
    await expect(service.review(keySubI, {
      projectId: "project-1",
      completionRequestId: "request-1",
      expectedRowVersion: 0,
      decision: "APPROVE",
      comment: "确认完成",
    })).rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
    await expect(service.review(pmo, {
      projectId: "project-1",
      completionRequestId: "request-1",
      expectedRowVersion: 0,
      decision: "RETURN",
      comment: "   ",
    })).rejects.toMatchObject({ code: "WORKFLOW_COMPLETION_INVALID_INPUT" });
  });

  it("keeps formal-green revocation PMO-only with a public reason and row version", async () => {
    const repository = completionRepository();
    const revoke = vi.spyOn(repository, "revokeFormalCompletion");
    const service = new WorkflowCompletionService(repository);
    await expect(service.revokeFormalCompletion(keySubI, {
      projectId: "project-1",
      completionRequestId: "request-1",
      expectedRowVersion: 2,
      reason: "虚拟项目依据需要重新核对",
    })).rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
    await expect(service.revokeFormalCompletion(pmo, {
      projectId: "project-1",
      completionRequestId: "request-1",
      expectedRowVersion: 2,
      reason: "  ",
    })).rejects.toMatchObject({ code: "WORKFLOW_COMPLETION_INVALID_INPUT" });
    await service.revokeFormalCompletion(pmo, {
      projectId: "project-1",
      completionRequestId: "request-1",
      expectedRowVersion: 2,
      reason: " 虚拟项目依据需要重新核对 ",
    });
    expect(revoke).toHaveBeenCalledWith(expect.objectContaining({
      actor: pmo,
      reason: "虚拟项目依据需要重新核对",
    }));
  });

  it.each(["PMO", "DEAN", "KEY_SUB_I"] as const)("allows %s to request a scoped read", async (roleCode) => {
    const repository = completionRepository();
    const list = vi.spyOn(repository, "list");
    const actor = { personId: roleCode.toLowerCase(), sessionId: "session", roleCode };
    await new WorkflowCompletionService(repository).list(actor, "project-1");
    expect(list).toHaveBeenCalledWith(actor, "project-1");
  });
});
