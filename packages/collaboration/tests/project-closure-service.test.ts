import { describe, expect, it, vi } from "vitest";

import {
  ProjectClosureService,
  deriveProjectCompletionGateReasons,
  type ProjectClosureRepository,
} from "../src/index.js";

function repository(): ProjectClosureRepository {
  return {
    getState: vi.fn(async () => ({ projectId: "project-1", projectStatus: "ACTIVE" as const, projectRowVersion: 0, isPrimaryKeySubI: false, requests: [] })),
    checkInitialReadiness: vi.fn(async () => ({ projectId: "project-1", projectRowVersion: 0, incompleteRequiredWorkflowStageIds: [], openIssueIds: [], readyForMaterials: true })),
    submit: vi.fn(async () => ({ completionRequestId: "closure-1", status: "CLOSURE_PENDING_PMO_REVIEW" as const, rowVersion: 0 })),
    returnForSupplement: vi.fn(async () => undefined),
    resubmit: vi.fn(async () => undefined),
    withdraw: vi.fn(async () => undefined),
    approve: vi.fn(async () => undefined),
    archive: vi.fn(async () => undefined),
    restoreArchive: vi.fn(async () => undefined),
  };
}

const keySubI = { personId: "key", sessionId: "session-key", roleCode: "KEY_SUB_I" } as const;
const pmo = { personId: "pmo", sessionId: "session-pmo", roleCode: "PMO" } as const;
const dean = { personId: "dean", sessionId: "session-dean", roleCode: "DEAN" } as const;

describe("project completion hard gates", () => {
  it("returns stable structured reasons for incomplete nodes, open issues, and missing governance material", () => {
    expect(deriveProjectCompletionGateReasons({
      incompleteRequiredWorkflowStageIds: ["node-b", "node-a"],
      openIssueIds: ["issue-2"],
      materials: {
        completionSummary: " ",
        unfinishedOptionalAndLegacyStatement: "无",
        noUnfinishedItemConfirmed: false,
        archiveComplianceSelfCheck: "已完成虚拟项目资料自查",
        exceptionStatement: null,
        truthConfirmed: true,
      },
    })).toEqual([
      { code: "REQUIRED_NODE_INCOMPLETE", sourceId: "node-a" },
      { code: "REQUIRED_NODE_INCOMPLETE", sourceId: "node-b" },
      { code: "OPEN_ISSUE", sourceId: "issue-2" },
      { code: "GOVERNANCE_MATERIAL_MISSING", field: "completionSummary" },
      { code: "GOVERNANCE_MATERIAL_MISSING", field: "noUnfinishedItemConfirmed" },
    ]);
  });
});

describe("ProjectClosureService", () => {
  it("checks initial closure readiness without creating a request", async () => {
    const repo = repository();
    const readiness = {
      projectId: "project-1",
      projectRowVersion: 3,
      incompleteRequiredWorkflowStageIds: ["node-1"],
      openIssueIds: ["issue-1"],
      readyForMaterials: false,
    };
    Object.assign(repo, { checkInitialReadiness: vi.fn(async () => readiness) });

    await expect(new ProjectClosureService(repo).checkInitialReadiness(keySubI, " project-1 "))
      .resolves.toEqual(readiness);
    expect(repo.submit).not.toHaveBeenCalled();
  });

  it("preserves the current PMO return reason in the Key Sub-I closure state", async () => {
    const state = {
      projectId: "project-1",
      projectStatus: "CLOSING" as const,
      projectRowVersion: 2,
      isPrimaryKeySubI: true,
      requests: [{
        completionRequestId: "request-1",
        projectId: "project-1",
        projectStatus: "CLOSING" as const,
        status: "CLOSURE_RETURNED_FOR_SUPPLEMENT" as const,
        rowVersion: 3,
        currentSubmissionVersionNo: 1,
        gateReasons: [],
        currentReturnReason: "请补充虚拟项目级归档说明",
      }],
    };
    const repo = { ...repository(), getState: vi.fn(async () => state) };
    await expect(new ProjectClosureService(repo).getState(keySubI, "project-1"))
      .resolves.toEqual(state);
  });
  it("submits immutable governance materials only for the primary Key Sub-I", async () => {
    const repo = repository();
    await new ProjectClosureService(repo).submit(keySubI, {
      projectId: "project-1",
      expectedProjectRowVersion: 3,
      completionSummary: " 虚拟项目结题总结 ",
      unfinishedOptionalAndLegacyStatement: " 无 ",
      noUnfinishedItemConfirmed: true,
      archiveComplianceSelfCheck: " 已完成虚拟项目资料归档与合规自查 ",
      exceptionStatement: null,
      truthConfirmed: true,
      attachmentDraftIds: [],
      commandId: "closure-submit-1",
    });
    expect(repo.submit).toHaveBeenCalledWith(expect.objectContaining({
      actor: keySubI,
      completionSummary: "虚拟项目结题总结",
      unfinishedOptionalAndLegacyStatement: "无",
    }));
    await expect(new ProjectClosureService(repo).submit(pmo, {
      projectId: "project-1", expectedProjectRowVersion: 3,
      completionSummary: "虚拟项目结题总结", unfinishedOptionalAndLegacyStatement: "无",
      noUnfinishedItemConfirmed: true, archiveComplianceSelfCheck: "已自查", exceptionStatement: null,
      truthConfirmed: true, attachmentDraftIds: [], commandId: "closure-submit-2",
    })).rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
  });

  it("keeps approval and archive transitions PMO-only with mandatory public reasons", async () => {
    const repo = repository();
    const service = new ProjectClosureService(repo);
    await expect(service.archive(pmo, { projectId: "project-1", expectedProjectRowVersion: 5, reason: " ", commandId: "archive-1" }))
      .rejects.toMatchObject({ code: "PROJECT_CLOSURE_INVALID_INPUT" });
    await expect(service.restoreArchive(dean, { projectId: "project-1", expectedProjectRowVersion: 6, reason: "重新核对虚拟项目材料", commandId: "restore-1" }))
      .rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
  });

  it("allows the primary Key Sub-I to withdraw or resubmit but not approve", async () => {
    const repo = repository();
    const service = new ProjectClosureService(repo);
    await service.withdraw(keySubI, { projectId: "project-1", completionRequestId: "closure-1", expectedRowVersion: 2, reason: "需继续执行虚拟项目", commandId: "withdraw-1" });
    await expect(service.approve(keySubI, { projectId: "project-1", completionRequestId: "closure-1", expectedRowVersion: 2, comment: null, commandId: "approve-1" }))
      .rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
  });

  it("rejects missing confirmations and duplicate attachment drafts before persistence", async () => {
    const service = new ProjectClosureService(repository());
    await expect(service.submit(keySubI, {
      projectId: "project-1", expectedProjectRowVersion: 0,
      completionSummary: "虚拟项目结题总结", unfinishedOptionalAndLegacyStatement: "无",
      noUnfinishedItemConfirmed: false, archiveComplianceSelfCheck: "已完成虚拟项目自查",
      exceptionStatement: null, truthConfirmed: true, attachmentDraftIds: [], commandId: "missing-confirmation",
    })).rejects.toMatchObject({ code: "PROJECT_CLOSURE_INVALID_INPUT" });
    await expect(service.submit(keySubI, {
      projectId: "project-1", expectedProjectRowVersion: 0,
      completionSummary: "虚拟项目结题总结", unfinishedOptionalAndLegacyStatement: "无",
      noUnfinishedItemConfirmed: true, archiveComplianceSelfCheck: "已完成虚拟项目自查",
      exceptionStatement: null, truthConfirmed: true, attachmentDraftIds: ["draft-1", "draft-1"], commandId: "duplicate-draft",
    })).rejects.toMatchObject({ code: "PROJECT_CLOSURE_INVALID_INPUT" });
  });

  it("normalizes optional approval comments and requires return, withdraw, archive, and restore reasons", async () => {
    const repo = repository();
    const service = new ProjectClosureService(repo);
    await service.approve(pmo, { projectId: "project-1", completionRequestId: "closure-1", expectedRowVersion: 1, comment: " ", commandId: "approve-optional" });
    expect(repo.approve).toHaveBeenCalledWith(expect.objectContaining({ comment: null }));
    await expect(service.returnForSupplement(pmo, { projectId: "project-1", completionRequestId: "closure-1", expectedRowVersion: 1, reason: " ", commandId: "return-empty" })).rejects.toMatchObject({ code: "PROJECT_CLOSURE_INVALID_INPUT" });
    await expect(service.withdraw(keySubI, { projectId: "project-1", completionRequestId: "closure-1", expectedRowVersion: 1, reason: " ", commandId: "withdraw-empty" })).rejects.toMatchObject({ code: "PROJECT_CLOSURE_INVALID_INPUT" });
    await expect(service.archive(pmo, { projectId: "project-1", expectedProjectRowVersion: 1, reason: " ", commandId: "archive-empty" })).rejects.toMatchObject({ code: "PROJECT_CLOSURE_INVALID_INPUT" });
    await expect(service.restoreArchive(pmo, { projectId: "project-1", expectedProjectRowVersion: 2, reason: " ", commandId: "restore-empty" })).rejects.toMatchObject({ code: "PROJECT_CLOSURE_INVALID_INPUT" });
  });

  it("keeps all closure mutations unavailable to Dean", async () => {
    const service = new ProjectClosureService(repository());
    await expect(service.returnForSupplement(dean, { projectId: "project-1", completionRequestId: "closure-1", expectedRowVersion: 1, reason: "补充虚拟材料", commandId: "dean-return" })).rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
    await expect(service.withdraw(dean, { projectId: "project-1", completionRequestId: "closure-1", expectedRowVersion: 1, reason: "撤回虚拟申请", commandId: "dean-withdraw" })).rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
    await expect(service.approve(dean, { projectId: "project-1", completionRequestId: "closure-1", expectedRowVersion: 1, comment: null, commandId: "dean-approve" })).rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
    await expect(service.archive(dean, { projectId: "project-1", expectedProjectRowVersion: 1, reason: "归档虚拟项目", commandId: "dean-archive" })).rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
  });
});
