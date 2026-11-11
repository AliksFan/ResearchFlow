import { describe, expect, it, vi } from "vitest";

import {
  CollaborationError,
  IssueService,
  assertIssueTransition,
  issueActivityVisibilityScopes,
  type IssueRepository,
} from "../src/index.js";

function issueRepository(): IssueRepository {
  return {
    list: async () => [],
    listIssueTypes: async () => [],
    listContacts: async () => [],
    createExternalContact: async (input) => ({ ref: "external:contact-1", name: input.name, email: input.email, source: "EXTERNAL_CONTACT", category: input.category }),
    recordManualEmail: async () => ({ id: "email-1", status: "FAILED", failureCode: "SMTP_NOT_CONFIGURED" }),
    create: async (input) => ({
      id: "issue-1",
      projectId: input.projectId,
      projectWorkflowStageId: input.projectWorkflowStageId,
      issueNo: "ISS-0001",
      title: input.title,
      description: input.description,
      expectedSupport: input.expectedSupport,
      currentRiskLevel: input.currentRiskLevel,
      currentState: "PMO_INITIAL_REVIEW",
      rowVersion: 0,
      reportedByPersonId: input.actor.personId,
      reportedRoleCode: input.actor.roleCode,
      currentDecisionRoundId: null,
      currentDecisionRoundStatus: null,
      pendingReviewTransferId: null,
      attachments: [],
      activities: [],
      sharedSummaries: [],
    }),
    returnForSupplement: async () => undefined,
    supplement: async () => undefined,
    appendCoordination: vi.fn(async () => undefined),
    submitResolution: vi.fn(async () => undefined),
    closeInvalid: async () => undefined,
    escalateToDean: async () => undefined,
    recordDeanDecision: async () => undefined,
    requestDecisionSupplement: vi.fn(async () => undefined),
    resubmitDecisionMaterials: vi.fn(async () => undefined),
    submitImplementation: async () => undefined,
    reviewImplementation: async () => undefined,
    requestDeanReviewTransfer: vi.fn(async () => undefined),
    acceptDeanReviewTransfer: vi.fn(async () => undefined),
    confirmResolution: async () => undefined,
  };
}

describe("issue responsibility state machine", () => {
  it.each([
    ["PMO_INITIAL_REVIEW", "REPORTER_SUPPLEMENT"],
    ["PMO_INITIAL_REVIEW", "PMO_COORDINATION"],
    ["PMO_COORDINATION", "DEAN_DECISION"],
    ["DEAN_DECISION", "PMO_DECISION_SUPPLEMENT"],
    ["DEAN_DECISION", "PMO_IMPLEMENTATION"],
    ["PMO_IMPLEMENTATION", "DEAN_IMPLEMENTATION_CONFIRMATION"],
    ["PMO_IMPLEMENTATION", "REPORTER_RESOLUTION_CONFIRMATION"],
    ["REPORTER_RESOLUTION_CONFIRMATION", "RESOLVED"],
    ["REPORTER_RESOLUTION_CONFIRMATION", "PMO_COORDINATION"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(() => assertIssueTransition(from, to)).not.toThrow();
  });

  it.each([
    ["RESOLVED", "PMO_COORDINATION"],
    ["CLOSED_INVALID", "PMO_INITIAL_REVIEW"],
    ["PMO_COORDINATION", "RESOLVED"],
    ["DEAN_DECISION", "REPORTER_RESOLUTION_CONFIRMATION"],
  ] as const)("rejects %s -> %s", (from, to) => {
    expect(() => assertIssueTransition(from, to)).toThrow(
      expect.objectContaining({ code: "ISSUE_INVALID_TRANSITION" }),
    );
  });
});

describe("issue detail visibility", () => {
  it("restricts detail rows before repository projection", () => {
    expect(issueActivityVisibilityScopes("PMO")).toEqual([
      "PMO_ONLY",
      "PMO_AND_DEAN",
      "ISSUE_PARTICIPANTS",
    ]);
    expect(issueActivityVisibilityScopes("DEAN")).toEqual([
      "PMO_AND_DEAN",
      "ISSUE_PARTICIPANTS",
    ]);
    expect(issueActivityVisibilityScopes("KEY_SUB_I")).toEqual([
      "ISSUE_PARTICIPANTS",
    ]);
  });
});

describe("IssueService", () => {
  const keySubI = { personId: "key", sessionId: "session-key", roleCode: "KEY_SUB_I" } as const;
  const pmo = { personId: "pmo", sessionId: "session-pmo", roleCode: "PMO" } as const;
  const dean = { personId: "dean", sessionId: "session-dean", roleCode: "DEAN" } as const;

  it("normalizes and forwards a Key Sub-I problem", async () => {
    const repository = issueRepository();
    const create = vi.spyOn(repository, "create");
    await new IssueService(repository).create(keySubI, {
      projectId: "project-1",
      projectWorkflowStageId: "node-1",
      issueTypeOptionId: "type-1",
      issueTypeOtherText: null,
      title: " 虚拟项目进度风险 ",
      description: " 虚拟项目级问题说明 ",
      expectedSupport: null,
      currentRiskLevel: "RISK",
      sharedSummary: null,
      attachmentDraftIds: [],
      commandId: "command-1",
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      actor: keySubI,
      title: "虚拟项目进度风险",
      description: "虚拟项目级问题说明",
      expectedSupport: null,
    }));
  });

  it("rejects PMO problem creation", async () => {
    await expect(new IssueService(issueRepository()).create(pmo, {
      projectId: "project-1",
      projectWorkflowStageId: "node-1",
      issueTypeOptionId: "type-1",
      issueTypeOtherText: null,
      title: "虚拟问题",
      description: "PMO内部说明",
      expectedSupport: null,
      currentRiskLevel: "BLOCKED",
      sharedSummary: "虚构项目成员摘要",
      attachmentDraftIds: [],
      commandId: "command-1",
    })).rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
  });

  it("rejects Dean problem creation", async () => {
    await expect(new IssueService(issueRepository()).create(dean, {
      projectId: "project-1",
      projectWorkflowStageId: "node-1",
      issueTypeOptionId: "type-1",
      issueTypeOtherText: null,
      title: "虚拟问题",
      description: "虚拟说明",
      expectedSupport: null,
      currentRiskLevel: "RISK",
      sharedSummary: null,
      attachmentDraftIds: [],
      commandId: "command-1",
    })).rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
  });

  it("keeps PMO state changes behind optimistic concurrency", async () => {
    await expect(new IssueService(issueRepository()).returnForSupplement(pmo, {
      projectId: "project-1",
      issueId: "issue-1",
      expectedRowVersion: -1,
      reason: "请补充虚拟项目进度",
      commandId: "command-1",
    })).rejects.toMatchObject({ code: "ISSUE_INVALID_INPUT" });
  });

  it("allows coordination append without consuming the issue row version", async () => {
    const repository = issueRepository();
    const append = vi.spyOn(repository, "appendCoordination");
    await new IssueService(repository).appendCoordination(pmo, {
      projectId: "project-1",
      issueId: "issue-1",
      detail: " 追加虚拟协调记录 ",
      visibilityScope: "PMO_ONLY",
      attachmentDraftIds: [],
      commandId: "command-1",
    });
    expect(append).toHaveBeenCalledWith(expect.objectContaining({
      detail: "追加虚拟协调记录",
    }));
  });

  it("requires both OTHER decision fields and an explicit review choice", async () => {
    const service = new IssueService(issueRepository());
    await expect(service.recordDeanDecision(dean, {
      projectId: "project-1",
      issueId: "issue-1",
      expectedRowVersion: 2,
      decisionCode: "OTHER",
      decisionContent: "其他决定内容",
      pmoImplementationInstruction: " ",
      implementationReviewRequired: true,
      attachmentDraftIds: [],
      commandId: "command-1",
    })).rejects.toMatchObject({ code: "ISSUE_INVALID_INPUT" });

    await expect(service.recordDeanDecision(dean, {
      projectId: "project-1",
      issueId: "issue-1",
      expectedRowVersion: 2,
      decisionCode: "COORDINATE_RESOURCES",
      decisionContent: "协调虚拟资源",
      pmoImplementationInstruction: null,
      implementationReviewRequired: undefined,
      attachmentDraftIds: [],
      commandId: "command-2",
    })).rejects.toMatchObject({ code: "ISSUE_INVALID_INPUT" });
  });

  it("keeps Dean decisions Dean-only", async () => {
    await expect(new IssueService(issueRepository()).recordDeanDecision(pmo, {
      projectId: "project-1",
      issueId: "issue-1",
      expectedRowVersion: 2,
      decisionCode: "AGREE_WITH_PMO_RECOMMENDATION",
      decisionContent: "同意建议",
      pmoImplementationInstruction: null,
      implementationReviewRequired: false,
      attachmentDraftIds: [],
      commandId: "command-1",
    })).rejects.toBeInstanceOf(CollaborationError);
  });

  it("uses the first coordination record to move initial review into coordination", async () => {
    const repository = issueRepository();
    await new IssueService(repository).appendCoordination(pmo, {
      projectId: "project-1",
      issueId: "issue-1",
      detail: "形成虚拟项目协调记录",
      visibilityScope: "PMO_ONLY",
      attachmentDraftIds: [],
      commandId: "command-1",
    });
    expect(repository.appendCoordination).toHaveBeenCalledOnce();
  });

  it("accepts omitted optional issue fields and keeps conditional fields strict", async () => {
    const repository = issueRepository();
    const service = new IssueService(repository);
    await expect(service.supplement(keySubI, {
      projectId: "project-1", issueId: "issue-1", expectedRowVersion: 1,
      latestProgress: null, supplementalDetail: "补充虚拟项目说明", expectedSupport: null,
      attachmentDraftIds: [], commandId: "supplement-1",
    })).resolves.toBeUndefined();
    await expect(service.recordDeanDecision(dean, {
      projectId: "project-1", issueId: "issue-1", expectedRowVersion: 2,
      decisionCode: "COORDINATE_RESOURCES", decisionContent: " ", pmoImplementationInstruction: null,
      implementationReviewRequired: false, attachmentDraftIds: [], commandId: "decision-1",
    })).resolves.toBeUndefined();
    await expect(service.reviewImplementation(dean, {
      projectId: "project-1", issueId: "issue-1", expectedRowVersion: 3,
      decision: "ACCEPTED", comment: null, commandId: "review-1",
    })).resolves.toBeUndefined();
    await expect(service.confirmResolution(keySubI, {
      projectId: "project-1", issueId: "issue-1", expectedRowVersion: 4,
      resolved: true, confirmation: null, commandId: "confirm-1",
    })).resolves.toBeUndefined();
    await expect(service.reviewImplementation(dean, {
      projectId: "project-1", issueId: "issue-1", expectedRowVersion: 3,
      decision: "RETURNED", comment: null, commandId: "review-2",
    })).rejects.toMatchObject({ code: "ISSUE_INVALID_INPUT" });
    await expect(service.confirmResolution(keySubI, {
      projectId: "project-1", issueId: "issue-1", expectedRowVersion: 4,
      resolved: false, confirmation: null, commandId: "confirm-2",
    })).rejects.toMatchObject({ code: "ISSUE_INVALID_INPUT" });
  });

  it("accepts the minimum fields for escalation, standard decision, implementation, and invalid closure", async () => {
    const repository = issueRepository();
    const service = new IssueService(repository);
    await expect(service.escalateToDean(pmo, {
      projectId: "project-1", issueId: "issue-1", expectedRowVersion: 1,
      pmoAssessment: null, recommendation: null, decisionQuestion: "是否协调虚拟项目资源",
      suggestedDeadline: null, attachmentDraftIds: [], commandId: "escalate-minimum",
    })).resolves.toBeUndefined();
    await expect(service.recordDeanDecision(dean, {
      projectId: "project-1", issueId: "issue-1", expectedRowVersion: 2,
      decisionCode: "COORDINATE_RESOURCES", decisionContent: null,
      pmoImplementationInstruction: null, implementationReviewRequired: false,
      attachmentDraftIds: [], commandId: "decision-minimum",
    })).resolves.toBeUndefined();
    await expect(service.submitImplementation(pmo, {
      projectId: "project-1", issueId: "issue-1", expectedRowVersion: 3,
      decisionRoundId: "round-1", resultSummary: "虚拟项目资源已协调",
      attachmentDraftIds: [], commandId: "implementation-minimum",
    })).resolves.toBeUndefined();
    await expect(service.closeInvalid(pmo, {
      projectId: "project-1", issueId: "issue-1", expectedRowVersion: 4,
      reasonCode: "INVALID", conclusionSummary: "该虚拟项目问题无效",
      duplicateIssueId: null, commandId: "invalid-minimum",
    })).resolves.toBeUndefined();
  });

  it("rejects every conditional field when its triggering choice requires text", async () => {
    const service = new IssueService(issueRepository());
    const base = { projectId: "project-1", issueId: "issue-1", expectedRowVersion: 2 } as const;
    await expect(service.recordDeanDecision(dean, {
      ...base, decisionCode: "OTHER", decisionContent: null,
      pmoImplementationInstruction: "落实虚拟项目其他决定", implementationReviewRequired: false,
      attachmentDraftIds: [], commandId: "other-content-missing",
    })).rejects.toMatchObject({ code: "ISSUE_INVALID_INPUT" });
    await expect(service.closeInvalid(pmo, {
      ...base, reasonCode: "DUPLICATE", conclusionSummary: "虚拟项目问题重复",
      duplicateIssueId: null, commandId: "duplicate-id-missing",
    })).rejects.toMatchObject({ code: "ISSUE_INVALID_INPUT" });
    await expect(service.escalateToDean(pmo, {
      ...base, pmoAssessment: null, recommendation: null, decisionQuestion: " ",
      suggestedDeadline: null, attachmentDraftIds: [], commandId: "question-missing",
    })).rejects.toMatchObject({ code: "ISSUE_INVALID_INPUT" });
    await expect(service.submitImplementation(pmo, {
      ...base, decisionRoundId: "round-1", resultSummary: " ",
      attachmentDraftIds: [], commandId: "result-missing",
    })).rejects.toMatchObject({ code: "ISSUE_INVALID_INPUT" });
  });

  it("keeps each unconditional action field mandatory", async () => {
    const service = new IssueService(issueRepository());
    const base = { projectId: "project-1", issueId: "issue-1", expectedRowVersion: 1, commandId: "required-field" } as const;
    await expect(service.returnForSupplement(pmo, { ...base, reason: " " })).rejects.toMatchObject({ code: "ISSUE_INVALID_INPUT" });
    await expect(service.supplement(keySubI, { ...base, latestProgress: null, supplementalDetail: " ", expectedSupport: null, attachmentDraftIds: [] })).rejects.toMatchObject({ code: "ISSUE_INVALID_INPUT" });
    await expect(service.appendCoordination(pmo, { projectId: base.projectId, issueId: base.issueId, detail: " ", visibilityScope: "PMO_ONLY", attachmentDraftIds: [], commandId: base.commandId })).rejects.toMatchObject({ code: "ISSUE_INVALID_INPUT" });
    await expect(service.submitResolution(pmo, { ...base, result: " ", attachmentDraftIds: [] })).rejects.toMatchObject({ code: "ISSUE_INVALID_INPUT" });
    await expect(service.requestDecisionSupplement(dean, { ...base, reason: " " })).rejects.toMatchObject({ code: "ISSUE_INVALID_INPUT" });
    await expect(service.resubmitDecisionMaterials(pmo, { ...base, content: " " })).rejects.toMatchObject({ code: "ISSUE_INVALID_INPUT" });
  });

  it("forwards optional attachments with the PMO public resolution result", async () => {
    const repository = issueRepository();
    const submit = vi.spyOn(repository, "submitResolution");
    await new IssueService(repository).submitResolution(pmo, {
      projectId: "project-1", issueId: "issue-1", expectedRowVersion: 2,
      result: " 虚拟项目问题已处理 ", attachmentDraftIds: ["draft-1"], commandId: "resolution-with-file",
    });
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      result: "虚拟项目问题已处理",
      attachmentDraftIds: ["draft-1"],
    }));
  });

  it("never lets a Dean decision skip PMO implementation", async () => {
    const repository = issueRepository();
    await new IssueService(repository).requestDecisionSupplement(dean, {
      projectId: "project-1",
      issueId: "issue-1",
      expectedRowVersion: 1,
      reason: "请补充虚拟项目协调依据",
      commandId: "command-1",
    });
    expect(repository.requestDecisionSupplement).toHaveBeenCalledOnce();
    await expect(new IssueService(repository).submitResolution(dean, {
      projectId: "project-1",
      issueId: "issue-1",
      expectedRowVersion: 2,
      result: "不能由院长直接关闭",
      attachmentDraftIds: [],
      commandId: "command-2",
    })).rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
  });

  it("keeps review transfer controlled by PMO request and another Dean acceptance", async () => {
    const repository = issueRepository();
    await new IssueService(repository).requestDeanReviewTransfer(pmo, {
      projectId: "project-1",
      issueId: "issue-1",
      expectedRowVersion: 3,
      decisionRoundId: "round-1",
      reason: "原决定院长授权已结束",
      commandId: "command-1",
    });
    await new IssueService(repository).acceptDeanReviewTransfer(dean, {
      projectId: "project-1",
      issueId: "issue-1",
      expectedRowVersion: 4,
      transferId: "transfer-1",
      commandId: "command-2",
    });
    expect(repository.requestDeanReviewTransfer).toHaveBeenCalledOnce();
    expect(repository.acceptDeanReviewTransfer).toHaveBeenCalledOnce();
  });

  it("records an explicit failed manual-email attempt without pretending delivery", async () => {
    const repository = issueRepository();
    const record = vi.spyOn(repository, "recordManualEmail");
    await expect(new IssueService(repository).recordManualEmail(pmo, {
      projectId: "project-1",
      issueId: "issue-1",
      subject: "虚拟项目问题协调",
      body: "请协助处理虚拟项目级问题。",
      recipientRefs: ["external:contact-1"],
      idempotencyKey: "email-command-1",
    })).resolves.toMatchObject({ status: "FAILED", failureCode: "SMTP_NOT_CONFIGURED" });
    expect(record).toHaveBeenCalledOnce();
  });
});
