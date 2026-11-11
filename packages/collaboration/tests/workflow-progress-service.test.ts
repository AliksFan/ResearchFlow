import { describe, expect, it, vi } from "vitest";

import {
  CollaborationError,
  WorkflowProgressService,
  type WorkflowProgressRepository,
} from "../src/index.js";

function repository(): WorkflowProgressRepository {
  return {
    submitProgress: vi.fn(async (input) => ({
      id: "update-1",
      projectId: input.projectId,
      projectWorkflowStageId: input.projectWorkflowStageId,
      submittedByPersonId: input.actor.personId,
      progressSummary: input.progressSummary,
      basis: input.basis,
      expectedCompletionDate: input.expectedCompletionDate,
      effectiveBudgetAmountCny: input.budgetAmountCny,
      latestCorrectionSequenceNo: 0,
      submittedAt: "2026-08-24T00:00:00.000Z",
      attachments: [],
    })),
    correctProgress: vi.fn(async (input) => ({
      workflowUpdateId: input.workflowUpdateId,
      sequenceNo: input.expectedLatestSequenceNo + 1,
      effectiveProgressSummary: input.revisedProgressSummary ?? "原进展",
      effectiveBasis: input.revisedBasis ?? "原依据",
      effectiveExpectedCompletionDate:
        input.revisedExpectedDateMode === "SET" ? input.revisedExpectedDate : null,
      effectiveBudgetAmountCny:
        input.budgetAmountMode === "SET" ? input.revisedBudgetAmountCny : null,
      correctedAt: "2026-08-24T00:01:00.000Z",
    })),
    listProgress: vi.fn(async () => []),
    getRecordedBudgetTotal: vi.fn(async () => "0.00"),
  };
}

const keySubI = { personId: "key-sub-i", sessionId: "session", roleCode: "KEY_SUB_I" } as const;

describe("WorkflowProgressService", () => {
  it.each(["PMO", "DEAN", "KEY_SUB_I"] as const)(
    "forwards %s read access for Repository scope enforcement",
    async (roleCode) => {
      const gateway = repository();
      const actor = { personId: roleCode.toLowerCase(), sessionId: "session", roleCode };
      const service = new WorkflowProgressService(gateway);

      await service.list(actor, "project-1");
      await service.getRecordedBudgetTotal(actor, "project-1");

      expect(gateway.listProgress).toHaveBeenCalledWith(actor, "project-1");
      expect(gateway.getRecordedBudgetTotal).toHaveBeenCalledWith(actor, "project-1");
    },
  );

  it("submits ordinary progress without creating a required budget amount", async () => {
    const gateway = repository();
    await new WorkflowProgressService(gateway).submit(keySubI, {
      projectId: "project-1",
      projectWorkflowStageId: "workflow-stage-1",
      progressSummary: " 完成虚拟项目会议 ",
      basis: " 虚拟会议纪要 ",
      expectedCompletionDate: null,
      budgetAmountCny: null,
      attachmentDraftIds: [],
    });

    expect(gateway.submitProgress).toHaveBeenCalledWith(expect.objectContaining({
      progressSummary: "完成虚拟项目会议",
      basis: "虚拟会议纪要",
      budgetAmountCny: null,
    }));
  });

  it("normalizes a legal positive CNY amount to two decimals", async () => {
    const gateway = repository();
    await new WorkflowProgressService(gateway).submit(keySubI, {
      projectId: "project-1",
      projectWorkflowStageId: "workflow-stage-1",
      progressSummary: "记录虚拟项目进展",
      basis: "项目级依据",
      expectedCompletionDate: "2026-09-01",
      budgetAmountCny: "1200.5",
      attachmentDraftIds: [],
    });

    expect(gateway.submitProgress).toHaveBeenCalledWith(expect.objectContaining({
      budgetAmountCny: "1200.50",
      expectedCompletionDate: "2026-09-01",
    }));
  });

  it.each(["0", "-1", "12.345", "1e3", "1000000000000.00"])(
    "rejects illegal CNY amount %s",
    async (budgetAmountCny) => {
      const gateway = repository();
      await expect(new WorkflowProgressService(gateway).submit(keySubI, {
        projectId: "project-1",
        projectWorkflowStageId: "workflow-stage-1",
        progressSummary: "记录虚拟项目进展",
        basis: "项目级依据",
        expectedCompletionDate: null,
        budgetAmountCny,
        attachmentDraftIds: [],
      })).rejects.toEqual(new CollaborationError("INVALID_BUDGET_AMOUNT"));
      expect(gateway.submitProgress).not.toHaveBeenCalled();
    },
  );

  it.each(["PMO", "DEAN"] as const)("keeps %s progress access read-only", async (roleCode) => {
    const gateway = repository();
    await expect(new WorkflowProgressService(gateway).submit(
      { personId: roleCode.toLowerCase(), sessionId: "session", roleCode },
      {
        projectId: "project-1",
        projectWorkflowStageId: "workflow-stage-1",
        progressSummary: "不应提交",
        basis: "不应提交",
        expectedCompletionDate: null,
        budgetAmountCny: null,
        attachmentDraftIds: [],
      },
    )).rejects.toEqual(new CollaborationError("COLLABORATION_FORBIDDEN"));
    expect(gateway.submitProgress).not.toHaveBeenCalled();
  });

  it.each([
    ["", "项目级依据", null],
    ["虚拟进展", " ", null],
    ["虚拟进展", "项目级依据", "2026-02-30"],
  ] as const)("rejects incomplete progress input", async (progressSummary, basis, expectedCompletionDate) => {
    const gateway = repository();
    await expect(new WorkflowProgressService(gateway).submit(keySubI, {
      projectId: "project-1",
      projectWorkflowStageId: "workflow-stage-1",
      progressSummary,
      basis,
      expectedCompletionDate,
      budgetAmountCny: null,
      attachmentDraftIds: [],
    })).rejects.toEqual(new CollaborationError("INVALID_PROGRESS_INPUT"));
    expect(gateway.submitProgress).not.toHaveBeenCalled();
  });

  it("allows an explicit budget CLEAR correction with an optimistic sequence", async () => {
    const gateway = repository();
    await new WorkflowProgressService(gateway).correct(keySubI, {
      projectId: "project-1",
      workflowUpdateId: "update-1",
      expectedLatestSequenceNo: 2,
      correctionReason: "原金额误填",
      revisedProgressSummary: null,
      revisedBasis: null,
      revisedExpectedDateMode: "KEEP",
      revisedExpectedDate: null,
      budgetAmountMode: "CLEAR",
      revisedBudgetAmountCny: null,
    });

    expect(gateway.correctProgress).toHaveBeenCalledWith(expect.objectContaining({
      expectedLatestSequenceNo: 2,
      budgetAmountMode: "CLEAR",
      revisedBudgetAmountCny: null,
    }));
  });

  it.each([
    ["SET", null],
    ["CLEAR", "1.00"],
    ["KEEP", "1.00"],
    ["SET", "0"],
  ] as const)("rejects inconsistent budget correction %s / %s", async (mode, value) => {
    const gateway = repository();
    await expect(new WorkflowProgressService(gateway).correct(keySubI, {
      projectId: "project-1",
      workflowUpdateId: "update-1",
      expectedLatestSequenceNo: 0,
      correctionReason: "纠错原因",
      revisedProgressSummary: "更新说明",
      revisedBasis: null,
      revisedExpectedDateMode: "KEEP",
      revisedExpectedDate: null,
      budgetAmountMode: mode,
      revisedBudgetAmountCny: value,
    })).rejects.toEqual(new CollaborationError("INVALID_CORRECTION"));
    expect(gateway.correctProgress).not.toHaveBeenCalled();
  });

  it("rejects a no-op correction", async () => {
    const gateway = repository();
    await expect(new WorkflowProgressService(gateway).correct(keySubI, {
      projectId: "project-1",
      workflowUpdateId: "update-1",
      expectedLatestSequenceNo: 0,
      correctionReason: "没有实际变化",
      revisedProgressSummary: null,
      revisedBasis: null,
      revisedExpectedDateMode: "KEEP",
      revisedExpectedDate: null,
      budgetAmountMode: "KEEP",
      revisedBudgetAmountCny: null,
    })).rejects.toEqual(new CollaborationError("INVALID_CORRECTION"));
    expect(gateway.correctProgress).not.toHaveBeenCalled();
  });

  it("rejects a stale-shape optimistic sequence before the Repository", async () => {
    const gateway = repository();
    await expect(new WorkflowProgressService(gateway).correct(keySubI, {
      projectId: "project-1",
      workflowUpdateId: "update-1",
      expectedLatestSequenceNo: -1,
      correctionReason: "纠错原因",
      revisedProgressSummary: "更新说明",
      revisedBasis: null,
      revisedExpectedDateMode: "KEEP",
      revisedExpectedDate: null,
      budgetAmountMode: "KEEP",
      revisedBudgetAmountCny: null,
    })).rejects.toEqual(new CollaborationError("INVALID_CORRECTION"));
    expect(gateway.correctProgress).not.toHaveBeenCalled();
  });
});
