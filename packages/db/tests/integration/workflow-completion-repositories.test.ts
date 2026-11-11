import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CollaborationError,
  CollaborationService,
  IssueService,
  LifecycleTemplateService,
  ProjectClosureService,
  WorkflowCompletionService,
} from "@researchflow/collaboration";

import {
  createPrismaClient,
  PrismaAttachmentRepository,
  PrismaLifecycleTemplateRepository,
  PrismaCollaborationRepository,
  PrismaIssueRepository,
  PrismaProjectClosureRepository,
  PrismaWorkflowCompletionRepository,
  type ApplicationPrismaClient,
} from "../../src/index.js";

const stage5IntegrationEnabled = process.env.RF_PHASE2_STAGE5_TEST_DATABASE === "1";
const stage6IntegrationEnabled = process.env.RF_PHASE2_STAGE6_TEST_DATABASE === "1";
const explicitIntegrationSchema = process.env.RF_REPOSITORY_TEST_SCHEMA?.trim();
const integrationEnabled = process.env.RF_PHASE2_STAGE4_TEST_DATABASE === "1" || stage5IntegrationEnabled || stage6IntegrationEnabled || Boolean(explicitIntegrationSchema);
const expectedSchema = explicitIntegrationSchema || (stage6IntegrationEnabled ? "p2_s6_repository_v1" : stage5IntegrationEnabled ? "p2_s5_repository_v1" : "p2_s4_repository_v1");

const id = {
  pmo1: "d1000000-0000-4000-8000-000000000001",
  pmo2: "d1000000-0000-4000-8000-000000000002",
  dean: "d1000000-0000-4000-8000-000000000003",
  key: "d1000000-0000-4000-8000-000000000004",
  pmo1Session: "d2000000-0000-4000-8000-000000000001",
  pmo2Session: "d2000000-0000-4000-8000-000000000002",
  deanSession: "d2000000-0000-4000-8000-000000000003",
  keySession: "d2000000-0000-4000-8000-000000000004",
  lifecycle: "d3000000-0000-4000-8000-000000000001",
  templateVersion: "d3000000-0000-4000-8000-000000000002",
  stageTemplate: "d3000000-0000-4000-8000-000000000003",
  templateWorkflow1: "d3000000-0000-4000-8000-000000000004",
  templateWorkflow2: "d3000000-0000-4000-8000-000000000005",
  templateWorkflow3: "d3000000-0000-4000-8000-000000000006",
  templateNode1: "d3000000-0000-4000-8000-000000000007",
  templateNode2: "d3000000-0000-4000-8000-000000000008",
  templateNode3: "d3000000-0000-4000-8000-000000000009",
  templateDependency: "d3000000-0000-4000-8000-00000000000a",
  project: "d4000000-0000-4000-8000-000000000001",
  plan: "d5000000-0000-4000-8000-000000000001",
  planVersion: "d5000000-0000-4000-8000-000000000002",
  projectStage: "d6000000-0000-4000-8000-000000000001",
  stageVersion: "d6000000-0000-4000-8000-000000000002",
  workflow: "d7000000-0000-4000-8000-000000000001",
  workflowVersion: "d7000000-0000-4000-8000-000000000002",
  workflow2: "d7000000-0000-4000-8000-000000000003",
  workflowVersion2: "d7000000-0000-4000-8000-000000000004",
  workflow3: "d7000000-0000-4000-8000-000000000005",
  workflowVersion3: "d7000000-0000-4000-8000-000000000006",
  predecessor: "d8000000-0000-4000-8000-000000000001",
  successor: "d8000000-0000-4000-8000-000000000002",
  requiredAttachment: "d8000000-0000-4000-8000-000000000003",
  predecessorVersion: "d9000000-0000-4000-8000-000000000001",
  successorVersion: "d9000000-0000-4000-8000-000000000002",
  requiredAttachmentVersion: "d9000000-0000-4000-8000-000000000003",
  predecessorRole: "da000000-0000-4000-8000-000000000001",
  successorRole: "da000000-0000-4000-8000-000000000002",
  requiredAttachmentRole: "da000000-0000-4000-8000-000000000003",
  dependency: "db000000-0000-4000-8000-000000000001",
  diseaseDictionary: "dc000000-0000-4000-8000-000000000001",
  researchDictionary: "dc000000-0000-4000-8000-000000000002",
  issueDictionary: "dc000000-0000-4000-8000-000000000004",
  diseaseOption: "dd000000-0000-4000-8000-000000000001",
  researchOption: "dd000000-0000-4000-8000-000000000002",
  issueOption: "dd000000-0000-4000-8000-000000000004",
  issueOtherOption: "dd000000-0000-4000-8000-000000000005",
  completionDraft: "df000000-0000-4000-8000-000000000001",
  completionUpload: "df000000-0000-4000-8000-000000000002",
  completionAsset: "df000000-0000-4000-8000-000000000003",
  closureDraft1: "df100000-0000-4000-8000-000000000001",
  closureUpload1: "df100000-0000-4000-8000-000000000002",
  closureAsset1: "df100000-0000-4000-8000-000000000003",
  closureDraft2: "df100000-0000-4000-8000-000000000004",
  closureUpload2: "df100000-0000-4000-8000-000000000005",
  closureAsset2: "df100000-0000-4000-8000-000000000006",
  candidatePlanVersion: "df000000-0000-4000-8000-000000000004",
  candidateStageVersion: "df000000-0000-4000-8000-000000000005",
  candidateWorkflowVersion1: "df000000-0000-4000-8000-000000000006",
  candidateWorkflowVersion2: "df000000-0000-4000-8000-000000000007",
  candidateWorkflowVersion3: "df000000-0000-4000-8000-000000000008",
  candidateNodeVersion1: "df000000-0000-4000-8000-000000000009",
  candidateNodeVersion2: "df000000-0000-4000-8000-00000000000a",
  candidateNodeVersion3: "df000000-0000-4000-8000-00000000000b",
  planChange: "df000000-0000-4000-8000-00000000000c",
} as const;

describe.runIf(integrationEnabled)("Prisma workflow completion repository", () => {
  let client: ApplicationPrismaClient;
  let service: WorkflowCompletionService;
  let issueService: IssueService;
  let collaborationService: CollaborationService;
  let closureService: ProjectClosureService;
  let attachmentRepository: PrismaAttachmentRepository;
  const pmo1 = { personId: id.pmo1, sessionId: id.pmo1Session, roleCode: "PMO" as const };
  const pmo2 = { personId: id.pmo2, sessionId: id.pmo2Session, roleCode: "PMO" as const };
  const dean = { personId: id.dean, sessionId: id.deanSession, roleCode: "DEAN" as const };
  const key = { personId: id.key, sessionId: id.keySession, roleCode: "KEY_SUB_I" as const };

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const url = new URL(databaseUrl);
    if (
      url.hostname !== "127.0.0.1" ||
      url.port !== "55434" ||
      url.pathname !== "/researchflow_validation_1" ||
      url.searchParams.get("schema") !== expectedSchema ||
      !/^(?:p2_[a-z0-9_]+|formal_web_[a-z0-9_]+)$/u.test(expectedSchema)
    ) {
      throw new Error("Refusing Stage 4 integration test outside the approved isolated schema");
    }
    client = createPrismaClient(databaseUrl);
    const identity = await client.$queryRaw<Array<{ databaseName: string; schemaName: string }>>`
      SELECT current_database() AS "databaseName", current_schema() AS "schemaName"
    `;
    expect(identity).toEqual([{ databaseName: "researchflow_validation_1", schemaName: expectedSchema }]);
    await cleanup(client);
    await seed(client);
    service = new WorkflowCompletionService(new PrismaWorkflowCompletionRepository(client));
    issueService = new IssueService(new PrismaIssueRepository(client));
    collaborationService = new CollaborationService(new PrismaCollaborationRepository(client));
    closureService = new ProjectClosureService(new PrismaProjectClosureRepository(client));
    attachmentRepository = new PrismaAttachmentRepository(client);
  });

  afterAll(async () => {
    if (client) {
      await cleanup(client);
      await client.$disconnect();
    }
  });

  it("runs the dependency, return, resubmit, pause, shared-action, and approval chain atomically", async () => {
    const submitInput = {
      projectId: id.project,
      projectWorkflowStageId: id.predecessor,
      expectedNodeRowVersion: 0,
      progressSummary: "虚构前置节点完成",
      basis: "虚构项目级完成依据",
      expectedCompletionDate: null,
      attachmentDraftIds: [],
    };
    const concurrent = await Promise.allSettled([
      service.submit(key, submitInput),
      service.submit(key, submitInput),
    ]);
    expect(
      concurrent.filter(({ status }) => status === "fulfilled"),
      concurrent.map((result) => result.status === "rejected"
        ? `${result.reason instanceof Error ? result.reason.name : typeof result.reason}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
        : "fulfilled").join(", "),
    ).toHaveLength(1);
    expect(concurrent.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const predecessor = (await service.list(key, id.project)).find((item) => item.projectWorkflowStageId === id.predecessor);
    expect(predecessor).toMatchObject({ status: "PENDING_PMO_REVIEW", rowVersion: 0, submissionNo: 1 });

    const successor = await service.submit(key, {
      ...submitInput,
      projectWorkflowStageId: id.successor,
      progressSummary: "虚构下游节点完成",
    });
    expect(successor.status).toBe("WAITING_FOR_PREDECESSOR");
    await expect(service.review(pmo1, {
      projectId: id.project,
      completionRequestId: successor.id,
      expectedRowVersion: successor.rowVersion,
      decision: "APPROVE",
      comment: "不应越过前置",
    })).rejects.toEqual(new CollaborationError("WORKFLOW_COMPLETION_CONFLICT"));

    await service.supplement(key, {
      projectId: id.project,
      completionRequestId: predecessor!.id,
      expectedRowVersion: predecessor!.rowVersion,
      content: "追加虚构审核依据",
      attachmentDraftIds: [],
    });
    const supplemented = (await service.list(key, id.project)).find((item) => item.id === predecessor!.id)!;
    const originalDueAt = supplemented.reviewRound?.dueAt;
    expect(supplemented.supplements).toHaveLength(1);

    await service.review(pmo1, {
      projectId: id.project,
      completionRequestId: supplemented.id,
      expectedRowVersion: supplemented.rowVersion,
      decision: "RETURN",
      comment: "请补充虚构完成说明",
    });
    const returned = (await service.list(key, id.project)).find((item) => item.id === predecessor!.id)!;
    expect(returned.status).toBe("RETURNED_FOR_RESUBMISSION");
    await service.resubmit(key, {
      projectId: id.project,
      completionRequestId: returned.id,
      expectedRowVersion: returned.rowVersion,
      progressSummary: "虚构前置节点完成修订版",
      basis: "虚构修订依据",
      expectedCompletionDate: null,
      attachmentDraftIds: [],
    });
    const resubmitted = (await service.list(key, id.project)).find((item) => item.id === returned.id)!;
    expect(resubmitted).toMatchObject({ status: "PENDING_PMO_REVIEW", submissionNo: 2 });
    expect(resubmitted.reviewRound?.dueAt).not.toBe(originalDueAt);

    await service.review(pmo1, {
      projectId: id.project,
      completionRequestId: resubmitted.id,
      expectedRowVersion: resubmitted.rowVersion,
      decision: "APPROVE",
      comment: "同意虚构前置节点完成",
    });
    const awaitingReconfirmation = (await service.list(key, id.project)).find((item) => item.id === successor.id)!;
    expect(awaitingReconfirmation.status).toBe("PREDECESSOR_RETURNED_CONFIRMATION");
    await service.reconfirm(key, {
      projectId: id.project,
      completionRequestId: awaitingReconfirmation.id,
      expectedRowVersion: awaitingReconfirmation.rowVersion,
      confirmation: "确认虚构下游节点完成材料仍然有效",
    });
    const activatedSuccessor = (await service.list(key, id.project)).find((item) => item.id === successor.id)!;
    expect(activatedSuccessor.status).toBe("PENDING_PMO_REVIEW");

    const activeRound = activatedSuccessor.reviewRound!;
    const createdIssue = await issueService.create(key, {
      projectId: id.project,
      projectWorkflowStageId: id.successor,
      issueTypeOptionId: id.issueOption,
      issueTypeOtherText: null,
      title: "虚构未关闭问题",
      description: "通过真实问题事务验证完成审核暂停",
      expectedSupport: "请 PMO协调虚构项目级问题",
      currentRiskLevel: "RISK",
      sharedSummary: null,
      attachmentDraftIds: [],
      commandId: "s4-real-issue-create",
    });
    const paused = (await service.list(dean, id.project)).find((item) => item.id === successor.id)!;
    expect(paused).toMatchObject({ status: "ISSUE_RESOLUTION_REQUIRED", reviewRound: { status: "PAUSED" } });
    expect(paused.reviewRound?.id).toBe(activeRound.id);
    expect(Math.abs((paused.reviewRound?.remainingMilliseconds ?? 0) - activeRound.remainingMilliseconds)).toBeLessThan(2_000);
    await issueService.closeInvalid(pmo1, {
      projectId: id.project,
      issueId: createdIssue.id,
      expectedRowVersion: createdIssue.rowVersion,
      reasonCode: "CREATED_BY_MISTAKE",
      conclusionSummary: "虚构问题已无效关闭，完成审核可恢复",
      duplicateIssueId: null,
      commandId: "s4-real-issue-close",
    });
    const resumed = (await service.list(dean, id.project)).find((item) => item.id === successor.id)!;
    expect(resumed).toMatchObject({ status: "PENDING_PMO_REVIEW", reviewRound: { status: "ACTIVE" } });
    expect(resumed.reviewRound?.id).toBe(activeRound.id);
    expect(Math.abs((resumed.reviewRound?.remainingMilliseconds ?? 0) - (paused.reviewRound?.remainingMilliseconds ?? 0))).toBeLessThan(2_000);
    await expect(client.issue.findUniqueOrThrow({ where: { id: createdIssue.id }, select: { closedAt: true, invalidCloseReasonCode: true } }))
      .resolves.toMatchObject({ closedAt: expect.any(Date), invalidCloseReasonCode: "CREATED_BY_MISTAKE" });

    await service.review(pmo1, {
      projectId: id.project,
      completionRequestId: resumed.id,
      expectedRowVersion: resumed.rowVersion,
      decision: "APPROVE",
      comment: "同意虚构下游节点完成",
    });
    await expect(client.projectWorkflowStage.findUniqueOrThrow({ where: { id: id.successor }, select: { executionStatus: true } }))
      .resolves.toEqual({ executionStatus: "COMPLETED" });
    await expect(client.notification.count({ where: {
      workflowCompletionRequestId: resumed.id,
      recipientPersonId: id.pmo2,
      eventCode: "WORKFLOW_COMPLETION_REVIEW_RESULT",
      messageKind: "INFORMATIONAL",
    } })).resolves.toBeGreaterThan(0);
    await expect(client.notification.count({ where: {
      workflowCompletionRequestId: resumed.id,
      messageKind: "ACTION",
      actionStatus: "PENDING",
    } })).resolves.toBe(0);
  });

  it("rejects a required completion attachment gate without formal available assets", async () => {
    await expect(service.submit(key, {
      projectId: id.project,
      projectWorkflowStageId: id.requiredAttachment,
      expectedNodeRowVersion: 0,
      progressSummary: "虚构必需附件节点完成",
      basis: "虚构项目级依据",
      expectedCompletionDate: null,
      attachmentDraftIds: [],
    })).rejects.toEqual(new CollaborationError("WORKFLOW_COMPLETION_ATTACHMENT_REQUIRED"));
    await expect(client.workflowCompletionRequest.count({ where: { projectWorkflowStageId: id.requiredAttachment } }))
      .resolves.toBe(0);

    await seedAvailableCompletionAttachment(client);
    const request = await service.submit(key, {
      projectId: id.project,
      projectWorkflowStageId: id.requiredAttachment,
      expectedNodeRowVersion: 0,
      progressSummary: "虚构必需附件节点完成",
      basis: "虚构项目级附件依据",
      expectedCompletionDate: null,
      attachmentDraftIds: [id.completionDraft],
    });
    await expect(client.businessAttachment.count({ where: {
      fileAssetId: id.completionAsset,
      workflowCompletionSubmission: { completionRequestId: request.id },
    } })).resolves.toBe(1);
    await service.review(pmo1, {
      projectId: id.project,
      completionRequestId: request.id,
      expectedRowVersion: request.rowVersion,
      decision: "APPROVE",
      comment: "附件可用，同意虚构节点完成",
    });
    await expect(client.projectWorkflowStage.findUniqueOrThrow({ where: { id: id.requiredAttachment }, select: { executionStatus: true } }))
      .resolves.toEqual({ executionStatus: "COMPLETED" });
  });

  it("atomically revokes an upstream formal green and invalidates an already formal downstream", async () => {
    const requests = await service.list(pmo1, id.project);
    const predecessor = requests.find((item) => item.projectWorkflowStageId === id.predecessor)!;
    const successor = requests.find((item) => item.projectWorkflowStageId === id.successor)!;
    expect(predecessor.status).toBe("APPROVED");
    expect(successor.status).toBe("APPROVED");

    await service.revokeFormalCompletion(pmo1, {
      projectId: id.project,
      completionRequestId: predecessor.id,
      expectedRowVersion: predecessor.rowVersion,
      reason: "虚构依据复核后需要重新提交",
    });

    const revoked = await service.list(pmo1, id.project);
    expect(revoked.find((item) => item.id === predecessor.id)?.status).toBe("RETURNED_FOR_RESUBMISSION");
    expect(revoked.find((item) => item.id === successor.id)?.status).toBe("PREDECESSOR_RETURNED_CONFIRMATION");
    await expect(client.projectWorkflowStage.findMany({
      where: { id: { in: [id.predecessor, id.successor] } },
      orderBy: { id: "asc" },
      select: { id: true, executionStatus: true, actualEndAt: true },
    })).resolves.toEqual([
      { id: id.predecessor, executionStatus: "ACTIVE", actualEndAt: null },
      { id: id.successor, executionStatus: "NOT_STARTED", actualEndAt: null },
    ]);
    await expect(client.notification.count({ where: { workflowCompletionRequestId: successor.id, eventCode: "WORKFLOW_COMPLETION_PREDECESSOR_RECONFIRMATION_REQUIRED", actionStatus: "PENDING" } }))
      .resolves.toBeGreaterThan(0);
  });

  it("rolls back the entire project time-limit batch when any row conflicts", async () => {
    const current = await collaborationService.listTimeLimits(pmo1, id.project);
    const review = current.find((item) => item.responsibilityType === "WORKFLOW_COMPLETION_PMO_REVIEW")!;
    const before = await client.collaborationTimeLimitSetting.findUniqueOrThrow({ where: { id: review.id } });
    await expect(collaborationService.saveProjectTimeLimits(pmo1, {
      projectId: id.project,
      changes: [
        { responsibilityType: "WORKFLOW_COMPLETION_PMO_REVIEW", mode: "PROJECT_OVERRIDE", timeLimitDays: 9, reminderIntervalDays: 2, expectedProjectSettingUpdatedAt: review.updatedAt },
        { responsibilityType: "ISSUE_DEAN_DECISION", mode: "PROJECT_OVERRIDE", timeLimitDays: 4, reminderIntervalDays: 1, expectedProjectSettingUpdatedAt: "2000-01-01T00:00:00.000Z" },
      ],
    })).rejects.toEqual(new CollaborationError("TIME_LIMIT_CONFLICT"));
    await expect(client.collaborationTimeLimitSetting.findUniqueOrThrow({ where: { id: review.id } }))
      .resolves.toMatchObject({ timeLimitDays: before.timeLimitDays, reminderIntervalDays: before.reminderIntervalDays, updatedAt: before.updatedAt });
    await expect(client.collaborationTimeLimitSetting.count({ where: { projectId: id.project, responsibilityType: "ISSUE_DEAN_DECISION" } })).resolves.toBe(0);
  });

  it("serializes concurrent issue transitions while preserving every PMO coordination append", async () => {
    const created = await issueService.create(key, {
      projectId: id.project,
      projectWorkflowStageId: id.requiredAttachment,
      issueTypeOptionId: id.issueOption,
      issueTypeOtherText: null,
      title: "虚构并发协调问题",
      description: "验证两名 PMO追加记录与状态并发门禁",
      expectedSupport: "请 PMO并行协调虚构资源",
      currentRiskLevel: "BLOCKED",
      sharedSummary: null,
      attachmentDraftIds: [],
      commandId: "s4-concurrent-issue-create",
    });
    const overviewWithIssue = await collaborationService.getOverview(pmo1, id.project);
    const riskyNode = overviewWithIssue?.stages.flatMap(({ workflows }) => workflows).find(({ workflowStageId }) => workflowStageId === id.requiredAttachment);
    expect(riskyNode).toMatchObject({ openIssueCount: 1, issueRiskLevel: "BLOCKED" });
    const transitions = await Promise.allSettled([
      issueService.appendCoordination(pmo1, { projectId: id.project, issueId: created.id, expectedRowVersion: created.rowVersion, detail: "PMO一协调记录", visibilityScope: "PMO_ONLY", attachmentDraftIds: [], commandId: "s4-transition-pmo1" }),
      issueService.appendCoordination(pmo2, { projectId: id.project, issueId: created.id, expectedRowVersion: created.rowVersion, detail: "PMO二协调记录", visibilityScope: "PMO_ONLY", attachmentDraftIds: [], commandId: "s4-transition-pmo2" }),
    ]);
    expect(transitions.filter(({ status }) => status === "fulfilled")).toHaveLength(2);
    expect(transitions.filter(({ status }) => status === "rejected")).toHaveLength(0);

    await Promise.all([
      issueService.appendCoordination(pmo1, { projectId: id.project, issueId: created.id, detail: "PMO一并发追加", visibilityScope: "PMO_ONLY", attachmentDraftIds: [], commandId: "s4-append-pmo1" }),
      issueService.appendCoordination(pmo2, { projectId: id.project, issueId: created.id, detail: "PMO二并发追加", visibilityScope: "PMO_ONLY", attachmentDraftIds: [], commandId: "s4-append-pmo2" }),
    ]);
    const projected = (await issueService.list(pmo1, id.project)).find((issue) => issue.id === created.id)!;
    const appended = projected.activities.filter(({ detail }) => detail.includes("并发追加"));
    expect(appended.map(({ detail }) => detail).sort()).toEqual(["PMO一并发追加", "PMO二并发追加"]);
    expect(appended.map(({ sequenceNo }) => sequenceNo)).toEqual(appended.map(({ sequenceNo }) => sequenceNo).slice().sort((left, right) => left - right));
    const deanProjection = (await issueService.list(dean, id.project)).find((issue) => issue.id === created.id)!;
    const keyProjection = (await issueService.list(key, id.project)).find((issue) => issue.id === created.id)!;
    expect(deanProjection.activities.some(({ detail }) => detail.includes("并发追加"))).toBe(false);
    expect(keyProjection.activities.some(({ detail }) => detail.includes("并发追加"))).toBe(false);

    await issueService.closeInvalid(pmo1, { projectId: id.project, issueId: created.id, expectedRowVersion: projected.rowVersion, reasonCode: "CREATED_BY_MISTAKE", conclusionSummary: "虚构并发问题已关闭", duplicateIssueId: null, commandId: "s4-concurrent-issue-close" });
    const overviewAfterClose = await collaborationService.getOverview(pmo1, id.project);
    const clearedNode = overviewAfterClose?.stages.flatMap(({ workflows }) => workflows).find(({ workflowStageId }) => workflowStageId === id.requiredAttachment);
    expect(clearedNode).toMatchObject({ openIssueCount: 0, issueRiskLevel: "NONE" });
  });

  it("projects only available issue attachments to every authorized issue participant", async () => {
    const draft = await attachmentRepository.createIssueDraft({
      actor: key,
      projectId: id.project,
      projectWorkflowStageId: id.requiredAttachment,
      issueId: null,
      parentType: "ISSUE",
      visibilityScope: "ISSUE_PARTICIPANTS",
    });
    const prepared = await attachmentRepository.prepareUpload({
      actor: key,
      draftId: draft.id,
      idempotencyKey: "s4-issue-projection-asset",
      fileName: "虚构问题材料.pdf",
      declaredMediaType: "application/pdf",
      sizeBytes: 1024,
      sha256: "e".repeat(64),
      declarationVersion: "ISSUE_ATTACHMENT_V1",
    });
    await attachmentRepository.markFileAvailable({ actor: key, assetId: prepared.assetId, storageObjectVersion: null, etag: "virtual-issue-etag" });
    const created = await issueService.create(key, {
      projectId: id.project,
      projectWorkflowStageId: id.requiredAttachment,
      issueTypeOptionId: id.issueOption,
      issueTypeOtherText: null,
      title: "虚构附件投影问题",
      description: "验证问题附件状态过滤",
      expectedSupport: null,
      currentRiskLevel: "RISK",
      sharedSummary: null,
      attachmentDraftIds: [draft.id],
      commandId: "s4-issue-projection-create",
    });

    for (const actor of [pmo1, dean, key]) {
      const projected = (await issueService.list(actor, id.project)).find(({ id: issueId }) => issueId === created.id)!;
      expect(projected.attachments).toEqual([expect.objectContaining({ assetId: prepared.assetId, fileName: "虚构问题材料.pdf" })]);
    }

    await client.fileAsset.update({ where: { id: prepared.assetId }, data: { status: "REJECTED", availableAt: null, rejectedAt: new Date(), rejectionCode: "VIRTUAL_REJECTION" } });
    await expect(issueService.list(pmo1, id.project)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.id, attachments: [] }),
    ]));
    await client.fileAsset.update({ where: { id: prepared.assetId }, data: { status: "REMOVED", rejectedAt: null, rejectionCode: null, removedAt: new Date(), removalReason: "STORAGE_OBJECT_MISSING" } });
    await expect(issueService.list(key, id.project)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.id, attachments: [] }),
    ]));

    const current = (await issueService.list(pmo1, id.project)).find(({ id: issueId }) => issueId === created.id)!;
    await issueService.closeInvalid(pmo1, { projectId: id.project, issueId: created.id, expectedRowVersion: current.rowVersion, reasonCode: "CREATED_BY_MISTAKE", conclusionSummary: "虚构附件测试结束", duplicateIssueId: null, commandId: "s4-issue-projection-close" });
  });

  it("retains an explicit manual-email failure without rolling back the open issue or leaking its body to notifications", async () => {
    const created = await issueService.create(key, {
      projectId: id.project,
      projectWorkflowStageId: id.requiredAttachment,
      issueTypeOptionId: id.issueOption,
      issueTypeOtherText: null,
      title: "虚构人工邮件问题",
      description: "验证无 SMTP时的失败记录",
      expectedSupport: "请 PMO联系虚构外部协作方",
      currentRiskLevel: "RISK",
      sharedSummary: null,
      attachmentDraftIds: [],
      commandId: "s4-email-issue-create",
    });
    const contact = await issueService.createExternalContact(pmo1, { projectId: id.project, name: "虚构外部协调人", email: "virtual-contact@example.invalid", category: "VIRTUAL_PARTNER" });
    const body = "仅供 PMO查看的虚构邮件正文";
    await expect(issueService.recordManualEmail(pmo1, { projectId: id.project, issueId: created.id, subject: "虚构问题协调邮件", body, recipientRefs: [contact.ref], idempotencyKey: "s4-email-attempt" }))
      .resolves.toMatchObject({ status: "FAILED", failureCode: "SMTP_NOT_CONFIGURED" });
    await expect(client.issue.findUnique({ where: { id: created.id }, select: { closedAt: true, resolvedAt: true } }))
      .resolves.toEqual({ closedAt: null, resolvedAt: null });
    await expect(client.emailDeliveryAttempt.findFirstOrThrow({ where: { issueEmailRecipient: { issueEmail: { issueId: created.id } } }, select: { status: true, errorCode: true } }))
      .resolves.toEqual({ status: "FAILED", errorCode: "SMTP_NOT_CONFIGURED" });
    await expect(client.notification.count({ where: { projectId: id.project, content: body } })).resolves.toBe(0);
    const current = (await issueService.list(pmo1, id.project)).find((issue) => issue.id === created.id)!;
    await issueService.closeInvalid(pmo1, { projectId: id.project, issueId: created.id, expectedRowVersion: current.rowVersion, reasonCode: "CREATED_BY_MISTAKE", conclusionSummary: "虚构邮件问题已关闭", duplicateIssueId: null, commandId: "s4-email-issue-close" });
  });

  it("rejects PMO issue creation without writing a problem", async () => {
    const beforeCount = await client.issue.count({ where: { projectId: id.project } });
    await expect(issueService.create(pmo1, {
      projectId: id.project,
      projectWorkflowStageId: id.requiredAttachment,
      issueTypeOptionId: id.issueOption,
      issueTypeOtherText: null,
      title: "虚构 PMO创建问题",
      description: "服务端必须拒绝 PMO创建",
      expectedSupport: null,
      currentRiskLevel: "RISK",
      sharedSummary: "虚构项目成员摘要",
      attachmentDraftIds: [],
      commandId: "s4-pmo-create-forbidden",
    })).rejects.toEqual(new CollaborationError("COLLABORATION_FORBIDDEN"));
    await expect(client.issue.count({ where: { projectId: id.project } })).resolves.toBe(beforeCount);
  });

  it("copies, validates, and concurrently publishes a lifecycle template draft", async () => {
    const templates = new LifecycleTemplateService(new PrismaLifecycleTemplateRepository(client));
    const draftId = await templates.createDraftFromPublished(pmo1, id.templateVersion);
    const draft = (await templates.listVersions(pmo1)).find(({ id: versionId }) => versionId === draftId)!;
    expect(draft).toMatchObject({ status: "DRAFT", versionNo: 2 });
    const [first, second, third] = draft.nodes;
    await expect(templates.saveDraft(pmo1, {
      templateVersionId: draftId,
      templateName: draft.templateName,
      expectedFingerprint: draft.fingerprint,
      stages: draft.stages,
      workflows: draft.workflows,
      nodes: [
        { ...first!, predecessorIds: [second!.id] },
        { ...second!, predecessorIds: [first!.id] },
        { ...third!, predecessorIds: [] },
      ],
    })).rejects.toEqual(new CollaborationError("WORKFLOW_DEPENDENCY_CYCLE"));

    const valid = {
      templateVersionId: draftId,
      templateName: draft.templateName,
      expectedFingerprint: draft.fingerprint,
      stages: draft.stages,
      workflows: draft.workflows,
      nodes: [
        { ...first!, applicability: "REQUIRED" as const, attachmentRequirement: "NONE" as const, predecessorIds: [] },
        { ...second!, applicability: "OPTIONAL" as const, attachmentRequirement: "OPTIONAL" as const, predecessorIds: [first!.id] },
        { ...third!, applicability: "REQUIRED" as const, attachmentRequirement: "REQUIRED" as const, predecessorIds: [] },
      ],
    };
    await templates.saveDraft(pmo1, valid);
    const refreshed = (await templates.listVersions(pmo1)).find(({ id: versionId }) => versionId === draftId)!;
    const validForPublish = { ...valid, expectedFingerprint: refreshed.fingerprint };
    const published = await Promise.allSettled([
      templates.publishDraft(pmo1, validForPublish),
      templates.publishDraft(pmo1, validForPublish),
    ]);
    expect(
      published.filter(({ status }) => status === "fulfilled"),
      published.map((result) => result.status === "rejected"
        ? `${result.reason instanceof Error ? result.reason.name : typeof result.reason}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
        : "fulfilled").join(", "),
    ).toHaveLength(1);
    expect(published.filter(({ status }) => status === "rejected")).toHaveLength(1);
    await expect(client.lifecycleTemplateVersion.findUniqueOrThrow({ where: { id: draftId }, select: { status: true } }))
      .resolves.toEqual({ status: "PUBLISHED" });
  });

  it("physically deletes unreferenced drafts and retires referenced or published solutions", async () => {
    const templates = new LifecycleTemplateService(new PrismaLifecycleTemplateRepository(client));
    const referenced = (await templates.listVersions(pmo1)).find(({ lifecycleTemplateId }) => lifecycleTemplateId === id.lifecycle)!;
    const temporaryReferenceId = "df000000-0000-4000-8000-000000000099";
    const hasReference = await client.projectPlanVersion.count({ where: { templateVersionId: referenced.id } });
    if (hasReference === 0) {
      await client.projectPlanVersion.create({ data: {
        id: temporaryReferenceId,
        projectPlanId: id.plan,
        versionNo: 99,
        baseVersionId: id.planVersion,
        templateVersionId: referenced.id,
        status: "PENDING_REVIEW",
        createdByPersonId: id.pmo1,
      } });
    }
    try {
      await expect(templates.deleteVersion(pmo1, referenced.id, referenced.fingerprint)).resolves.toBeUndefined();
      await expect(client.lifecycleTemplateVersion.findUnique({ where: { id: referenced.id }, select: { status: true } })).resolves.toEqual({ status: "RETIRED" });
      await expect(client.lifecycleTemplate.findUnique({ where: { id: referenced.lifecycleTemplateId }, select: { status: true } })).resolves.toEqual({ status: "RETIRED" });
      await expect(templates.listVersions(pmo1)).resolves.not.toEqual(expect.arrayContaining([expect.objectContaining({ id: referenced.id })]));
      await expect(client.auditLog.count({ where: { entityId: referenced.id, actionCode: "LIFECYCLE_TEMPLATE_RETIRED", result: "SUCCESS" } })).resolves.toBeGreaterThan(0);
    } finally {
      if (hasReference === 0) await client.projectPlanVersion.delete({ where: { id: temporaryReferenceId } });
    }

    const isolatedLifecycleId = "d3000000-0000-4000-8000-0000000000a1";
    const isolatedVersionId = "d3000000-0000-4000-8000-0000000000a2";
    const isolatedStageId = "d3000000-0000-4000-8000-0000000000a3";
    const isolatedWorkflowId = "d3000000-0000-4000-8000-0000000000a4";
    await client.lifecycleTemplate.create({ data: { id: isolatedLifecycleId, templateCode: "S4_DELETE_ZERO_REF", templateName: "虚构零引用模板", status: "ACTIVE" } });
    await client.lifecycleTemplateVersion.create({ data: { id: isolatedVersionId, lifecycleTemplateId: isolatedLifecycleId, versionNo: 1, status: "DRAFT" } });
    await client.stageTemplate.create({ data: { id: isolatedStageId, templateVersionId: isolatedVersionId, stageCode: "ONLY", stageName: "唯一阶段", sortOrder: 0 } });
    await client.workflowTemplate.create({ data: { id: isolatedWorkflowId, templateVersionId: isolatedVersionId, workflowCode: "ONLY_FLOW", workflowName: "唯一流程", description: "零引用删除验证" } });
    await client.workflowStageTemplate.create({ data: { templateVersionId: isolatedVersionId, stageTemplateId: isolatedStageId, workflowTemplateId: isolatedWorkflowId, sortOrder: 0, defaultTask: "虚构节点", defaultOwnerRole: "KEY_SUB_I" } });
    const isolated = (await templates.listVersions(pmo1)).find(({ id: versionId }) => versionId === isolatedVersionId)!;
    await templates.deleteVersion(pmo1, isolated.id, isolated.fingerprint);
    await expect(client.lifecycleTemplateVersion.findUnique({ where: { id: isolated.id } })).resolves.toBeNull();
    await expect(client.lifecycleTemplate.findUnique({ where: { id: isolatedLifecycleId } })).resolves.toBeNull();

    const draftId = await templates.createSolution(pmo1, "虚构待删除草稿方案");
    const draft = (await templates.listVersions(pmo1)).find(({ id: versionId }) => versionId === draftId)!;
    await templates.deleteVersion(pmo1, draft.id, draft.fingerprint);
    await expect(client.lifecycleTemplateVersion.findUnique({ where: { id: draft.id } })).resolves.toBeNull();
  });

  it("atomically terminates a processing request when an activated plan makes its node not applicable", async () => {
    const request = (await service.list(key, id.project)).find((item) => item.projectWorkflowStageId === id.predecessor)!;
    expect(request.status).toBe("RETURNED_FOR_RESUBMISSION");
    await seedCandidatePlanChange(client);
    await service.activatePlanChange(pmo1, { projectId: id.project, planChangeRequestId: id.planChange });
    await expect(client.workflowCompletionRequest.findUniqueOrThrow({ where: { id: request.id }, select: { status: true, terminatedByPlanChangeRequestId: true } }))
      .resolves.toEqual({ status: "TERMINATED_BY_PLAN_CHANGE", terminatedByPlanChangeRequestId: id.planChange });
    await expect(client.projectPlanVersion.findMany({ where: { id: { in: [id.planVersion, id.candidatePlanVersion] } }, orderBy: { versionNo: "asc" }, select: { status: true } }))
      .resolves.toEqual([{ status: "SUPERSEDED" }, { status: "ACTIVE" }]);
    await expect(client.auditLog.count({ where: { projectId: id.project, actionCode: "PROJECT_PLAN_CHANGE_ACTIVATED" } }))
      .resolves.toBe(1);
  });

  it.runIf(stage5IntegrationEnabled)("enforces the issue matrix and closes, blocks, resumes, approves, archives, and restores atomically", async () => {
    await client.dictionaryOption.create({ data: { id: id.issueOtherOption, dictionaryId: id.issueDictionary, dictionaryCode: "ISSUE_TYPE", optionCode: "OTHER", displayName: "其它", sortOrder: 9999 } });
    const createBase = {
      projectId: id.project,
      projectWorkflowStageId: id.predecessor,
      title: "虚构字段矩阵问题",
      description: "仅用于阶段五字段矩阵验证",
      expectedSupport: null,
      currentRiskLevel: "RISK" as const,
      sharedSummary: null,
      attachmentDraftIds: [],
    };
    await expect(issueService.create(key, { ...createBase, issueTypeOptionId: id.issueOption, issueTypeOtherText: "不应保存", commandId: "standard-with-other" }))
      .rejects.toEqual(new CollaborationError("ISSUE_INVALID_INPUT"));
    await expect(issueService.create(key, { ...createBase, issueTypeOptionId: id.issueOtherOption, issueTypeOtherText: null, commandId: "other-without-detail" }))
      .rejects.toEqual(new CollaborationError("ISSUE_INVALID_INPUT"));
    const matrixIssue = await issueService.create(key, { ...createBase, issueTypeOptionId: id.issueOtherOption, issueTypeOtherText: "虚构其他问题说明", commandId: "other-with-detail" });
    await issueService.closeInvalid(pmo1, { projectId: id.project, issueId: matrixIssue.id, expectedRowVersion: matrixIssue.rowVersion, reasonCode: "INVALID", conclusionSummary: "字段矩阵验证完毕", duplicateIssueId: null, commandId: "close-matrix-issue" });

    await client.projectWorkflowStage.updateMany({ where: { projectId: id.project }, data: { executionStatus: "COMPLETED" } });
    await seedAvailableClosureAttachment(client, { draftId: id.closureDraft1, uploadId: id.closureUpload1, assetId: id.closureAsset1, requestId: null, fileName: "虚构结题材料第一版.pdf" });
    const project = await client.project.findUniqueOrThrow({ where: { id: id.project }, select: { rowVersion: true } });
    const materials = {
      projectId: id.project,
      expectedProjectRowVersion: project.rowVersion,
      completionSummary: "虚构阶段五项目结题总结",
      unfinishedOptionalAndLegacyStatement: "无",
      noUnfinishedItemConfirmed: true,
      archiveComplianceSelfCheck: "已完成虚构项目资料归档与合规自查",
      exceptionStatement: null,
      truthConfirmed: true,
      attachmentDraftIds: [id.closureDraft1],
    };
    const submissions = await Promise.allSettled([
      closureService.submit(key, { ...materials, commandId: "closure-submit-a" }),
      closureService.submit(key, { ...materials, commandId: "closure-submit-b" }),
    ]);
    expect(
      submissions.filter(({ status }) => status === "fulfilled"),
      submissions.map((result) => result.status === "rejected"
        ? `${result.reason instanceof Error ? result.reason.name : typeof result.reason}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
        : "fulfilled").join(", "),
    ).toHaveLength(1);
    expect(submissions.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const requestId = (submissions.find(({ status }) => status === "fulfilled") as PromiseFulfilledResult<{ completionRequestId: string }>).value.completionRequestId;
    await expect(client.project.findUniqueOrThrow({ where: { id: id.project }, select: { status: true } })).resolves.toEqual({ status: "CLOSING" });
    await expect(client.projectCompletionSubmissionVersion.count({ where: { completionRequestId: requestId } })).resolves.toBe(1);
    await expect(client.businessAttachment.count({ where: { projectCompletionSubmissionVersion: { completionRequestId: requestId } } })).resolves.toBe(1);
    await expect(client.projectCompletionReviewRound.findMany({ where: { completionRequestId: requestId }, select: { roundNo: true, status: true } })).resolves.toEqual([{ roundNo: 1, status: "ACTIVE" }]);

    const closingIssue = async (suffix: string) => issueService.create(key, {
      ...createBase,
      title: `虚构结题阻塞问题${suffix}`,
      issueTypeOptionId: id.issueOption,
      issueTypeOtherText: null,
      currentRiskLevel: "RISK",
      commandId: `closing-issue-${suffix}`,
    });
    const first = await closingIssue("一");
    const second = await closingIssue("二");
    await expect(client.issue.findMany({ where: { id: { in: [first.id, second.id] } }, orderBy: { title: "asc" }, select: { currentRiskLevel: true, projectCompletionRequestId: true } }))
      .resolves.toEqual([
        { currentRiskLevel: "BLOCKED", projectCompletionRequestId: requestId },
        { currentRiskLevel: "BLOCKED", projectCompletionRequestId: requestId },
      ]);
    await expect(client.projectCompletionReviewRound.findUniqueOrThrow({ where: { completionRequestId_roundNo: { completionRequestId: requestId, roundNo: 1 } }, select: { status: true } })).resolves.toEqual({ status: "BLOCKED_ENDED" });

    await issueService.closeInvalid(pmo1, { projectId: id.project, issueId: first.id, expectedRowVersion: first.rowVersion, reasonCode: "INVALID", conclusionSummary: "清除第一项虚构阻塞", duplicateIssueId: null, commandId: "clear-first-block" });
    await expect(client.projectCompletionRequest.findUniqueOrThrow({ where: { id: requestId }, select: { status: true } })).resolves.toEqual({ status: "CLOSURE_BLOCKED" });
    await issueService.closeInvalid(pmo1, { projectId: id.project, issueId: second.id, expectedRowVersion: second.rowVersion, reasonCode: "INVALID", conclusionSummary: "清除第二项虚构阻塞", duplicateIssueId: null, commandId: "clear-second-block" });
    const resumed = await closureService.getState(pmo1, id.project);
    const current = resumed.requests.find(({ completionRequestId }) => completionRequestId === requestId)!;
    expect(current.status).toBe("CLOSURE_PENDING_PMO_REVIEW");
    await expect(client.projectCompletionReviewRound.findMany({ where: { completionRequestId: requestId }, orderBy: { roundNo: "asc" }, select: { roundNo: true, status: true } }))
      .resolves.toEqual([{ roundNo: 1, status: "BLOCKED_ENDED" }, { roundNo: 2, status: "ACTIVE" }]);

    await closureService.returnForSupplement(pmo1, { projectId: id.project, completionRequestId: requestId, expectedRowVersion: current.rowVersion, reason: "请补充虚构结题材料", commandId: "return-closure" });
    const returned = (await closureService.getState(key, id.project)).requests.find(({ completionRequestId }) => completionRequestId === requestId)!;
    await seedAvailableClosureAttachment(client, { draftId: id.closureDraft2, uploadId: id.closureUpload2, assetId: id.closureAsset2, requestId, fileName: "虚构结题材料第二版.pdf" });
    await closureService.resubmit(key, {
      projectId: id.project,
      completionRequestId: requestId,
      expectedRowVersion: returned.rowVersion,
      completionSummary: "虚构阶段五项目结题总结第二版",
      unfinishedOptionalAndLegacyStatement: "无",
      noUnfinishedItemConfirmed: true,
      archiveComplianceSelfCheck: "已完成虚构项目资料归档与合规复查",
      exceptionStatement: null,
      truthConfirmed: true,
      attachmentDraftIds: [id.closureDraft2],
      commandId: "resubmit-closure",
    });
    await expect(client.projectCompletionSubmissionVersion.findMany({ where: { completionRequestId: requestId }, orderBy: { versionNo: "asc" }, select: { versionNo: true, completionSummary: true } }))
      .resolves.toEqual([
        { versionNo: 1, completionSummary: "虚构阶段五项目结题总结" },
        { versionNo: 2, completionSummary: "虚构阶段五项目结题总结第二版" },
      ]);
    await expect(client.businessAttachment.count({ where: { projectCompletionSubmissionVersion: { completionRequestId: requestId } } })).resolves.toBe(2);
    const readyAfterResubmit = (await closureService.getState(pmo1, id.project)).requests.find(({ completionRequestId }) => completionRequestId === requestId)!;
    await expect(client.projectCompletionReviewRound.findMany({ where: { completionRequestId: requestId }, orderBy: { roundNo: "asc" }, select: { roundNo: true, status: true } }))
      .resolves.toEqual([{ roundNo: 1, status: "BLOCKED_ENDED" }, { roundNo: 2, status: "RETURNED" }, { roundNo: 3, status: "ACTIVE" }]);

    const race = await Promise.allSettled([
      closureService.approve(pmo1, { projectId: id.project, completionRequestId: requestId, expectedRowVersion: readyAfterResubmit.rowVersion, comment: null, commandId: "approve-race" }),
      closingIssue("并发"),
    ]);
    expect(race.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const concurrentIssue = race[1].status === "fulfilled" ? race[1].value : null;
    if (concurrentIssue) {
      const blocked = (await closureService.getState(pmo1, id.project)).requests.find(({ completionRequestId }) => completionRequestId === requestId)!;
      expect(blocked.status).toBe("CLOSURE_BLOCKED");
      await issueService.closeInvalid(pmo1, { projectId: id.project, issueId: concurrentIssue.id, expectedRowVersion: concurrentIssue.rowVersion, reasonCode: "INVALID", conclusionSummary: "清除并发虚构阻塞", duplicateIssueId: null, commandId: "clear-race-block" });
      const ready = (await closureService.getState(pmo1, id.project)).requests.find(({ completionRequestId }) => completionRequestId === requestId)!;
      await closureService.approve(pmo1, { projectId: id.project, completionRequestId: requestId, expectedRowVersion: ready.rowVersion, comment: null, commandId: "approve-after-race" });
    }
    const completed = await closureService.getState(pmo1, id.project);
    expect(completed.projectStatus).toBe("COMPLETED");
    await expect(issueService.create(key, { ...createBase, issueTypeOptionId: id.issueOption, issueTypeOtherText: null, commandId: "write-after-completed" }))
      .rejects.toEqual(new CollaborationError("PROJECT_NOT_ACTIVE"));

    await closureService.archive(pmo1, { projectId: id.project, expectedProjectRowVersion: completed.projectRowVersion, reason: "虚构项目材料已归档", commandId: "archive-project" });
    const archived = await closureService.getState(dean, id.project);
    expect(archived.projectStatus).toBe("ARCHIVED");
    await closureService.restoreArchive(pmo2, { projectId: id.project, expectedProjectRowVersion: archived.projectRowVersion, reason: "虚构项目取消归档复核", commandId: "restore-project" });
    const restored = await closureService.getState(key, id.project);
    expect(restored.projectStatus).toBe("COMPLETED");
    await expect(client.projectArchiveActivity.findMany({ where: { projectId: id.project }, orderBy: { occurredAt: "asc" }, select: { action: true, reason: true } }))
      .resolves.toEqual([{ action: "ARCHIVED", reason: "虚构项目材料已归档" }, { action: "RESTORED", reason: "虚构项目取消归档复核" }]);
    await expect(client.auditLog.count({ where: { projectId: id.project, actionCode: { in: ["PROJECT_COMPLETION_SUBMITTED", "PROJECT_COMPLETION_APPROVED", "PROJECT_ARCHIVED", "PROJECT_ARCHIVE_RESTORED"] } } })).resolves.toBe(4);
  });
});

async function seed(client: ApplicationPrismaClient): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  await client.$transaction(async (transaction) => {
    await transaction.person.createMany({ data: [
      { id: id.pmo1, loginName: "s3-pmo-1", displayName: "虚构 PMO一", accountStatus: "ACTIVE" },
      { id: id.pmo2, loginName: "s3-pmo-2", displayName: "虚构 PMO二", accountStatus: "ACTIVE" },
      { id: id.dean, loginName: "s3-dean", displayName: "虚构院长", accountStatus: "ACTIVE" },
      { id: id.key, loginName: "s3-key", displayName: "虚构 Key Sub-I", accountStatus: "ACTIVE" },
    ] });
    await transaction.session.createMany({ data: [
      { id: id.pmo1Session, personId: id.pmo1, tokenHash: "s3-pmo-1-token", activeRoleCode: "PMO", expiresAt },
      { id: id.pmo2Session, personId: id.pmo2, tokenHash: "s3-pmo-2-token", activeRoleCode: "PMO", expiresAt },
      { id: id.deanSession, personId: id.dean, tokenHash: "s3-dean-token", activeRoleCode: "DEAN", expiresAt },
      { id: id.keySession, personId: id.key, tokenHash: "s3-key-token", activeRoleCode: "KEY_SUB_I", expiresAt },
    ] });
    await transaction.lifecycleTemplate.create({ data: {
      id: id.lifecycle,
      templateCode: "S3_COMPLETION",
      templateName: "虚构阶段三模板",
      status: "ACTIVE",
      versions: { create: {
        id: id.templateVersion,
        versionNo: 1,
        status: "PUBLISHED",
        publishedByPersonId: id.pmo1,
        publishedAt: now,
        stageTemplates: { create: { id: id.stageTemplate, stageCode: "EXECUTE", stageName: "执行", sortOrder: 0 } },
      } },
    } });
    await transaction.workflowTemplate.createMany({ data: [
      { id: id.templateWorkflow1, templateVersionId: id.templateVersion, workflowCode: "S3_TEMPLATE_1", workflowName: "虚构模板流程一", description: "阶段三隔离测试" },
      { id: id.templateWorkflow2, templateVersionId: id.templateVersion, workflowCode: "S3_TEMPLATE_2", workflowName: "虚构模板流程二", description: "阶段三隔离测试" },
      { id: id.templateWorkflow3, templateVersionId: id.templateVersion, workflowCode: "S3_TEMPLATE_3", workflowName: "虚构模板流程三", description: "阶段三隔离测试" },
    ] });
    await transaction.workflowStageTemplate.createMany({ data: [
      { id: id.templateNode1, templateVersionId: id.templateVersion, workflowTemplateId: id.templateWorkflow1, stageTemplateId: id.stageTemplate, sortOrder: 0, defaultTask: "虚构模板节点一", defaultOwnerRole: "KEY_SUB_I", defaultApplicability: "REQUIRED", defaultAttachmentRequirement: "NONE" },
      { id: id.templateNode2, templateVersionId: id.templateVersion, workflowTemplateId: id.templateWorkflow2, stageTemplateId: id.stageTemplate, sortOrder: 1, defaultTask: "虚构模板节点二", defaultOwnerRole: "KEY_SUB_I", defaultApplicability: "OPTIONAL", defaultAttachmentRequirement: "OPTIONAL" },
      { id: id.templateNode3, templateVersionId: id.templateVersion, workflowTemplateId: id.templateWorkflow3, stageTemplateId: id.stageTemplate, sortOrder: 2, defaultTask: "虚构模板节点三", defaultOwnerRole: "KEY_SUB_I", defaultApplicability: "REQUIRED", defaultAttachmentRequirement: "REQUIRED" },
    ] });
    await transaction.workflowStageTemplateDependency.create({ data: {
      id: id.templateDependency,
      templateVersionId: id.templateVersion,
      predecessorWorkflowStageTemplateId: id.templateNode1,
      successorWorkflowStageTemplateId: id.templateNode2,
    } });
    await transaction.dictionary.createMany({ data: [
      { id: id.diseaseDictionary, dictionaryCode: "DISEASE_AREA", dictionaryName: "虚构疾病领域", description: "阶段三隔离测试" },
      { id: id.researchDictionary, dictionaryCode: "RESEARCH_TYPE", dictionaryName: "虚构研究类型", description: "阶段三隔离测试" },
      { id: id.issueDictionary, dictionaryCode: "ISSUE_TYPE", dictionaryName: "虚构问题类型", description: "阶段三问题门禁测试" },
    ] });
    await transaction.dictionaryOption.createMany({ data: [
      { id: id.diseaseOption, dictionaryId: id.diseaseDictionary, dictionaryCode: "DISEASE_AREA", optionCode: "VIRTUAL", displayName: "虚构领域", sortOrder: 0 },
      { id: id.researchOption, dictionaryId: id.researchDictionary, dictionaryCode: "RESEARCH_TYPE", optionCode: "VIRTUAL", displayName: "虚构类型", sortOrder: 0 },
      { id: id.issueOption, dictionaryId: id.issueDictionary, dictionaryCode: "ISSUE_TYPE", optionCode: "VIRTUAL_BLOCK", displayName: "虚构阻塞", sortOrder: 0 },
    ] });
    await transaction.project.create({ data: {
      id: id.project,
      applicationCode: "APP-9301",
      projectCode: "DEMO-930",
      projectName: "虚构阶段三完成审核项目",
      projectSummary: "仅用于阶段三隔离测试",
      normalizedNameOccupancy: "虚构阶段三完成审核项目",
      applicantPersonId: id.key,
      status: "ACTIVE",
      establishedByPersonId: id.pmo1,
      establishedAt: now,
      diseaseAreaOptionId: id.diseaseOption,
      researchTypeOptionId: id.researchOption,
      plannedStartDate: new Date("2026-09-01"),
      plannedEndDate: new Date("2026-12-31"),
    } });
    await transaction.roleAssignment.createMany({ data: [
      { personId: id.pmo1, roleCode: "PMO", assignmentStatus: "ACTIVE", activatedAt: now, grantedByPersonId: id.pmo1 },
      { personId: id.pmo2, roleCode: "PMO", assignmentStatus: "ACTIVE", activatedAt: now, grantedByPersonId: id.pmo1 },
      { personId: id.dean, roleCode: "DEAN", assignmentStatus: "ACTIVE", activatedAt: now, grantedByPersonId: id.pmo1 },
      { personId: id.key, roleCode: "KEY_SUB_I", projectId: id.project, assignmentStatus: "ACTIVE", isPrimary: true, activatedAt: now, grantedByPersonId: id.pmo1 },
    ] });
    await transaction.collaborationTimeLimitSetting.createMany({ data: [
      { projectId: id.project, responsibilityType: "WORKFLOW_COMPLETION_PMO_REVIEW", timeLimitDays: 3, reminderIntervalDays: 1, updatedByPersonId: id.pmo1 },
      { projectId: id.project, responsibilityType: "PROJECT_COMPLETION_PMO_REVIEW", timeLimitDays: 3, reminderIntervalDays: 1, updatedByPersonId: id.pmo1 },
      { projectId: id.project, responsibilityType: "PROJECT_COMPLETION_SUPPLEMENT", timeLimitDays: 3, reminderIntervalDays: 1, updatedByPersonId: id.pmo1 },
    ] });
    await transaction.projectPlan.create({ data: { id: id.plan, projectId: id.project } });
    await transaction.projectPlanVersion.create({ data: { id: id.planVersion, projectPlanId: id.plan, versionNo: 1, templateVersionId: id.templateVersion, status: "ACTIVE", createdByPersonId: id.pmo1, activatedAt: now } });
    await transaction.projectStage.create({ data: { id: id.projectStage, projectId: id.project, projectPlanId: id.plan, sourceStageTemplateId: id.stageTemplate } });
    await transaction.projectStageVersion.create({ data: { id: id.stageVersion, projectPlanVersionId: id.planVersion, projectStageId: id.projectStage, stageCode: "EXECUTE", stageName: "执行", sortOrder: 0, plannedStartDate: new Date("2026-09-01"), plannedEndDate: new Date("2026-12-31") } });
    for (const [workflowId, workflowVersionId, workflowCode, sortOrder] of [
      [id.workflow, id.workflowVersion, "S3_PREDECESSOR", 0],
      [id.workflow2, id.workflowVersion2, "S3_SUCCESSOR", 1],
      [id.workflow3, id.workflowVersion3, "S3_REQUIRED_ATTACHMENT", 2],
    ] as const) {
      await transaction.projectWorkflow.create({ data: { id: workflowId, projectId: id.project, projectPlanId: id.plan, workflowType: "PROJECT_CUSTOM" } });
      await transaction.projectWorkflowVersion.create({ data: { id: workflowVersionId, projectPlanVersionId: id.planVersion, projectWorkflowId: workflowId, workflowCode, workflowName: `虚构流程 ${sortOrder + 1}`, sortOrder } });
    }
    for (const [nodeId, workflowId] of [
      [id.predecessor, id.workflow],
      [id.successor, id.workflow2],
      [id.requiredAttachment, id.workflow3],
    ] as const) {
      await transaction.projectWorkflowStage.create({ data: { id: nodeId, projectId: id.project, projectPlanId: id.plan, projectWorkflowId: workflowId, projectStageId: id.projectStage } });
    }
    for (const [versionId, nodeId, workflowId, roleId, taskName, attachmentRequirement, sortOrder] of [
      [id.predecessorVersion, id.predecessor, id.workflow, id.predecessorRole, "虚构前置节点", "NONE", 0],
      [id.successorVersion, id.successor, id.workflow2, id.successorRole, "虚构下游节点", "OPTIONAL", 1],
      [id.requiredAttachmentVersion, id.requiredAttachment, id.workflow3, id.requiredAttachmentRole, "虚构必需附件节点", "REQUIRED", 2],
    ] as const) {
      await transaction.projectWorkflowStageVersion.create({ data: {
        id: versionId,
        projectPlanVersionId: id.planVersion,
        projectWorkflowStageId: nodeId,
        projectWorkflowId: workflowId,
        projectStageId: id.projectStage,
        taskName,
        taskDescription: "仅用于阶段三隔离测试",
        plannedStartDate: new Date("2026-09-01"),
        plannedEndDate: new Date("2026-09-30"),
        attachmentRequirement,
        sortOrder,
        roleVersions: { create: { id: roleId, roleCode: "KEY_SUB_I", sortOrder: 0 } },
      } });
    }
    await transaction.projectWorkflowStageDependencyVersion.create({ data: { id: id.dependency, projectId: id.project, projectPlanVersionId: id.planVersion, predecessorProjectWorkflowStageId: id.predecessor, successorProjectWorkflowStageId: id.successor } });
  });
}

async function seedAvailableCompletionAttachment(client: ApplicationPrismaClient): Promise<void> {
  const now = new Date();
  await client.attachmentDraft.create({ data: {
    id: id.completionDraft,
    projectId: id.project,
    parentType: "WORKFLOW_COMPLETION_SUBMISSION",
    purposeCode: "COMPLETION_EVIDENCE",
    visibilityScope: "PROJECT_SHARED",
    uploaderPersonId: id.key,
    uploaderRoleCode: "KEY_SUB_I",
    projectWorkflowStageId: id.requiredAttachment,
    createdAt: now,
    lastActivityAt: now,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    uploadSessions: { create: {
      id: id.completionUpload,
      uploaderPersonId: id.key,
      status: "COMPLETED",
      idempotencyKey: "s3-required-completion-asset",
      createdAt: now,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      lastActivityAt: now,
      fileAssets: { create: {
        id: id.completionAsset,
        status: "AVAILABLE",
        originalFileName: "虚构节点完成依据.pdf",
        mediaType: "application/pdf",
        sizeBytes: 1024,
        sha256: "a".repeat(64),
        storageObjectKey: `projects/${id.project}/assets/${id.completionAsset}`,
        uploadedByPersonId: id.key,
        uploadedRoleCode: "KEY_SUB_I",
        declarationVersion: "WORKFLOW_COMPLETION_ATTACHMENT_DECLARATION_V1",
        createdAt: now,
        availableAt: now,
      } },
    } },
  } });
}

async function seedAvailableClosureAttachment(client: ApplicationPrismaClient, input: { draftId: string; uploadId: string; assetId: string; requestId: string | null; fileName: string }): Promise<void> {
  const now = new Date();
  await client.attachmentDraft.create({ data: {
    id: input.draftId,
    projectId: id.project,
    projectCompletionRequestId: input.requestId,
    parentType: "PROJECT_COMPLETION_SUBMISSION_VERSION",
    purposeCode: "PROJECT_COMPLETION_MATERIAL",
    visibilityScope: "PROJECT_SHARED",
    uploaderPersonId: id.key,
    uploaderRoleCode: "KEY_SUB_I",
    createdAt: now,
    lastActivityAt: now,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    uploadSessions: { create: {
      id: input.uploadId,
      uploaderPersonId: id.key,
      status: "COMPLETED",
      idempotencyKey: `closure-${input.assetId}`,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      lastActivityAt: now,
      fileAssets: { create: {
        id: input.assetId,
        status: "AVAILABLE",
        originalFileName: input.fileName,
        mediaType: "application/pdf",
        sizeBytes: 1024,
        sha256: input.assetId.endsWith("3") ? "b".repeat(64) : "c".repeat(64),
        storageObjectKey: `projects/${id.project}/assets/${input.assetId}`,
        uploadedByPersonId: id.key,
        uploadedRoleCode: "KEY_SUB_I",
        declarationVersion: "PROJECT_COMPLETION_ATTACHMENT_DECLARATION_V1",
        createdAt: now,
        availableAt: now,
      } },
    } },
  } });
}

async function seedCandidatePlanChange(client: ApplicationPrismaClient): Promise<void> {
  const now = new Date();
  await client.$transaction(async (transaction) => {
    await transaction.projectPlanVersion.create({ data: {
      id: id.candidatePlanVersion,
      projectPlanId: id.plan,
      versionNo: 2,
      baseVersionId: id.planVersion,
      templateVersionId: id.templateVersion,
      status: "PENDING_REVIEW",
      createdByPersonId: id.pmo1,
    } });
    await transaction.projectStageVersion.create({ data: {
      id: id.candidateStageVersion,
      projectPlanVersionId: id.candidatePlanVersion,
      projectStageId: id.projectStage,
      stageCode: "EXECUTE",
      stageName: "执行",
      sortOrder: 0,
      plannedStartDate: new Date("2026-09-01"),
      plannedEndDate: new Date("2026-12-31"),
    } });
    for (const [versionId, workflowId, code, sortOrder] of [
      [id.candidateWorkflowVersion1, id.workflow, "S3_PREDECESSOR", 0],
      [id.candidateWorkflowVersion2, id.workflow2, "S3_SUCCESSOR", 1],
      [id.candidateWorkflowVersion3, id.workflow3, "S3_REQUIRED_ATTACHMENT", 2],
    ] as const) {
      await transaction.projectWorkflowVersion.create({ data: { id: versionId, projectPlanVersionId: id.candidatePlanVersion, projectWorkflowId: workflowId, workflowCode: code, workflowName: `虚构变更流程 ${sortOrder + 1}`, sortOrder } });
    }
    for (const [versionId, nodeId, workflowId, taskName, applicability, attachmentRequirement, sortOrder] of [
      [id.candidateNodeVersion1, id.predecessor, id.workflow, "虚构前置节点", "NOT_APPLICABLE", "NONE", 0],
      [id.candidateNodeVersion2, id.successor, id.workflow2, "虚构下游节点", "OPTIONAL", "OPTIONAL", 1],
      [id.candidateNodeVersion3, id.requiredAttachment, id.workflow3, "虚构必需附件节点", "REQUIRED", "REQUIRED", 2],
    ] as const) {
      await transaction.projectWorkflowStageVersion.create({ data: {
        id: versionId,
        projectPlanVersionId: id.candidatePlanVersion,
        projectWorkflowStageId: nodeId,
        projectWorkflowId: workflowId,
        projectStageId: id.projectStage,
        taskName,
        taskDescription: "仅用于阶段三计划变更隔离测试",
        plannedStartDate: new Date("2026-09-01"),
        plannedEndDate: new Date("2026-09-30"),
        applicability,
        attachmentRequirement,
        sortOrder,
      } });
    }
    await transaction.projectPlanChangeRequest.create({ data: {
      id: id.planChange,
      projectId: id.project,
      projectPlanId: id.plan,
      candidatePlanVersionId: id.candidatePlanVersion,
      changeReason: "虚构计划将前置节点调整为不适用",
      status: "PENDING_PMO_ACTIVATION",
      submittedByPersonId: id.key,
      submittedRoleCode: "KEY_SUB_I",
      submittedAt: now,
    } });
  });
}

async function cleanup(client: ApplicationPrismaClient): Promise<void> {
  const people = [id.pmo1, id.pmo2, id.dean, id.key];
  await client.$transaction(async (transaction) => {
    await transaction.notificationOutboxAttempt.deleteMany({});
    await transaction.notificationOutbox.deleteMany({});
    await transaction.notification.deleteMany({ where: { projectId: id.project } });
    await transaction.businessAttachment.deleteMany({ where: { projectId: id.project } });
    await transaction.fileAsset.deleteMany({ where: { projectId: id.project } });
    await transaction.attachmentUploadSession.deleteMany({ where: { projectId: id.project } });
    await transaction.attachmentDraft.deleteMany({ where: { projectId: id.project } });
    await transaction.emailDeliveryAttempt.deleteMany({ where: { projectId: id.project } });
    await transaction.issueEmailRecipient.deleteMany({ where: { projectId: id.project } });
    await transaction.issueEmail.deleteMany({ where: { projectId: id.project } });
    await transaction.externalContact.deleteMany({ where: { email: "virtual-contact@example.invalid" } });
    await transaction.issueSharedSummary.deleteMany({ where: { projectId: id.project } });
    await transaction.issueActivity.deleteMany({ where: { projectId: id.project } });
    await transaction.issueHandlingState.deleteMany({ where: { projectId: id.project } });
    await transaction.projectCompletionBlock.deleteMany({ where: { projectId: id.project } });
    await transaction.issue.deleteMany({ where: { projectId: id.project } });
    await transaction.projectCompletionCheck.deleteMany({ where: { projectId: id.project } });
    await transaction.projectCompletionReviewRound.deleteMany({ where: { projectId: id.project } });
    await transaction.projectCompletionSupplementRound.deleteMany({ where: { projectId: id.project } });
    await transaction.projectCompletionActivity.deleteMany({ where: { projectId: id.project } });
    await transaction.projectCompletionRequest.updateMany({ where: { projectId: id.project }, data: { currentSubmissionVersionId: null } });
    await transaction.projectCompletionSubmissionVersion.deleteMany({ where: { projectId: id.project } });
    await transaction.projectCompletionRequest.deleteMany({ where: { projectId: id.project } });
    await transaction.projectArchiveActivity.deleteMany({ where: { projectId: id.project } });
    await transaction.workflowCompletionReviewPause.deleteMany({ where: { projectId: id.project } });
    await transaction.workflowCompletionReviewRound.deleteMany({ where: { projectId: id.project } });
    await transaction.workflowCompletionActivity.deleteMany({ where: { projectId: id.project } });
    await transaction.workflowCompletionSupplement.deleteMany({ where: { projectId: id.project } });
    await transaction.workflowCompletionRequest.updateMany({ where: { projectId: id.project }, data: { currentSubmissionId: null } });
    await transaction.workflowCompletionSubmission.deleteMany({ where: { projectId: id.project } });
    await transaction.workflowCompletionRequest.deleteMany({ where: { projectId: id.project } });
    await transaction.auditLog.deleteMany({ where: { projectId: id.project } });
    await transaction.projectPlanChangeActivity.deleteMany({ where: { request: { projectId: id.project } } });
    await transaction.projectPlanChangeRequest.deleteMany({ where: { projectId: id.project } });
    await transaction.projectWorkflowStageDependencyVersion.deleteMany({ where: { projectId: id.project } });
    await transaction.projectWorkflowStageRoleVersion.deleteMany({ where: { id: { in: [id.predecessorRole, id.successorRole, id.requiredAttachmentRole] } } });
    await transaction.projectWorkflowStageVersion.deleteMany({ where: { projectPlanVersion: { projectPlanId: id.plan } } });
    await transaction.projectWorkflowVersion.deleteMany({ where: { projectPlanVersion: { projectPlanId: id.plan } } });
    await transaction.projectStageVersion.deleteMany({ where: { projectPlanVersion: { projectPlanId: id.plan } } });
    await transaction.projectWorkflowStage.deleteMany({ where: { projectId: id.project } });
    await transaction.projectWorkflow.deleteMany({ where: { projectId: id.project } });
    await transaction.projectStage.deleteMany({ where: { projectId: id.project } });
    await transaction.projectPlanVersion.deleteMany({ where: { projectPlanId: id.plan } });
    await transaction.projectPlan.deleteMany({ where: { id: id.plan } });
    await transaction.collaborationTimeLimitSetting.deleteMany({ where: { projectId: id.project } });
    await transaction.roleAssignment.deleteMany({ where: { personId: { in: people } } });
    await transaction.project.deleteMany({ where: { id: id.project } });
    await transaction.dictionaryOption.deleteMany({ where: { id: { in: [id.diseaseOption, id.researchOption, id.issueOption, id.issueOtherOption] } } });
    await transaction.dictionary.deleteMany({ where: { id: { in: [id.diseaseDictionary, id.researchDictionary, id.issueDictionary] } } });
    const templateVersions = await transaction.lifecycleTemplateVersion.findMany({ where: { lifecycleTemplateId: id.lifecycle }, select: { id: true } });
    const templateVersionIds = templateVersions.map(({ id: versionId }) => versionId);
    await transaction.auditLog.deleteMany({ where: { entityType: "LIFECYCLE_TEMPLATE_VERSION", entityId: { in: templateVersionIds } } });
    await transaction.workflowStageTemplateDependency.deleteMany({ where: { templateVersionId: { in: templateVersionIds } } });
    await transaction.workflowStageTemplate.deleteMany({ where: { templateVersionId: { in: templateVersionIds } } });
    await transaction.workflowTemplate.deleteMany({ where: { templateVersionId: { in: templateVersionIds } } });
    await transaction.stageTemplate.deleteMany({ where: { templateVersionId: { in: templateVersionIds } } });
    await transaction.lifecycleTemplateVersion.deleteMany({ where: { id: { in: templateVersionIds } } });
    await transaction.lifecycleTemplate.deleteMany({ where: { id: id.lifecycle } });
    await transaction.auditLog.deleteMany({ where: { sessionId: { in: [id.pmo1Session, id.pmo2Session, id.deanSession, id.keySession] } } });
    await transaction.session.deleteMany({ where: { personId: { in: people } } });
    await transaction.person.deleteMany({ where: { id: { in: people } } });
  });
}
