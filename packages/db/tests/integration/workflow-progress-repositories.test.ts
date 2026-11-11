import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { WorkflowProgressService } from "@researchflow/collaboration";

import {
  createPrismaClient,
  PrismaAttachmentRepository,
  PrismaWorkflowProgressRepository,
  type ApplicationPrismaClient,
} from "../../src/index.js";

const stage6IntegrationEnabled = process.env.RF_PHASE2_STAGE6_TEST_DATABASE === "1";
const explicitIntegrationSchema = process.env.RF_REPOSITORY_TEST_SCHEMA?.trim();
const integrationEnabled = process.env.RF_PHASE2_STAGE2_TEST_DATABASE === "1" || stage6IntegrationEnabled || Boolean(explicitIntegrationSchema);
const expectedSchema = explicitIntegrationSchema || (stage6IntegrationEnabled ? "p2_s6_repository_v1" : "p2_s2_repository_v1");

const id = {
  pmo: "c1000000-0000-4000-8000-000000000001",
  dean: "c1000000-0000-4000-8000-000000000002",
  reporter: "c1000000-0000-4000-8000-000000000003",
  primary: "c1000000-0000-4000-8000-000000000004",
  other: "c1000000-0000-4000-8000-000000000005",
  pmoSession: "c2000000-0000-4000-8000-000000000001",
  deanSession: "c2000000-0000-4000-8000-000000000002",
  reporterSession: "c2000000-0000-4000-8000-000000000003",
  primarySession: "c2000000-0000-4000-8000-000000000004",
  otherSession: "c2000000-0000-4000-8000-000000000005",
  lifecycle: "c3000000-0000-4000-8000-000000000001",
  templateVersion: "c3000000-0000-4000-8000-000000000002",
  stageTemplate: "c3000000-0000-4000-8000-000000000003",
  project: "c4000000-0000-4000-8000-000000000001",
  plan: "c5000000-0000-4000-8000-000000000001",
  planVersion: "c5000000-0000-4000-8000-000000000002",
  projectStage: "c6000000-0000-4000-8000-000000000001",
  workflow: "c6000000-0000-4000-8000-000000000002",
  workflowStage: "c6000000-0000-4000-8000-000000000003",
  stageVersion: "c7000000-0000-4000-8000-000000000001",
  workflowVersion: "c7000000-0000-4000-8000-000000000002",
  workflowStageVersion: "c7000000-0000-4000-8000-000000000003",
  workflowStageRoleVersion: "c7000000-0000-4000-8000-000000000004",
  diseaseDictionary: "c8000000-0000-4000-8000-000000000001",
  researchDictionary: "c8000000-0000-4000-8000-000000000002",
  diseaseOption: "c9000000-0000-4000-8000-000000000001",
  researchOption: "c9000000-0000-4000-8000-000000000002",
};

describe.runIf(integrationEnabled)("Prisma workflow progress repository", () => {
  let client: ApplicationPrismaClient;
  let service: WorkflowProgressService;
  let repository: PrismaWorkflowProgressRepository;
  let attachmentRepository: PrismaAttachmentRepository;

  const pmo = { personId: id.pmo, sessionId: id.pmoSession, roleCode: "PMO" as const };
  const dean = { personId: id.dean, sessionId: id.deanSession, roleCode: "DEAN" as const };
  const reporter = { personId: id.reporter, sessionId: id.reporterSession, roleCode: "KEY_SUB_I" as const };
  const primary = { personId: id.primary, sessionId: id.primarySession, roleCode: "KEY_SUB_I" as const };
  const other = { personId: id.other, sessionId: id.otherSession, roleCode: "KEY_SUB_I" as const };

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const url = new URL(databaseUrl);
    const configuredSchema = url.searchParams.get("schema");
    if ((stage6IntegrationEnabled || explicitIntegrationSchema) && (url.hostname !== "127.0.0.1" || url.port !== "55434" || url.pathname !== "/researchflow_validation_1" || !/^(?:p2_[a-z0-9_]+|formal_web_[a-z0-9_]+)$/u.test(expectedSchema))) {
      throw new Error("Refusing progress integration test outside the approved database");
    }
    client = createPrismaClient(databaseUrl);
    const identity = await client.$queryRaw<Array<{
      databaseName: string;
      schemaName: string;
      tableName: string | null;
    }>>`
      SELECT current_database() AS "databaseName", current_schema() AS "schemaName",
             to_regclass('workflow_update')::text AS "tableName"
    `;
    const target = identity[0];
    if (
      !target ||
      target.databaseName !== "researchflow_validation_1" ||
      configuredSchema !== expectedSchema ||
      target.schemaName !== expectedSchema ||
      target.tableName !== "workflow_update"
    ) {
      throw new Error(`Refusing progress integration test outside ${expectedSchema}: ${JSON.stringify(target)}`);
    }
    await cleanup(client);
    await seed(client);
    repository = new PrismaWorkflowProgressRepository(client);
    attachmentRepository = new PrismaAttachmentRepository(client);
    service = new WorkflowProgressService(repository);
  });

  beforeEach(async () => {
    await client.businessAttachment.deleteMany({ where: { projectId: id.project } });
    await client.fileAsset.deleteMany({ where: { projectId: id.project } });
    await client.attachmentUploadSession.deleteMany({ where: { projectId: id.project } });
    await client.attachmentDraft.deleteMany({ where: { projectId: id.project } });
    await client.auditLog.deleteMany({ where: { projectId: id.project } });
    await client.workflowUpdateCorrection.deleteMany({ where: { projectId: id.project } });
    await client.workflowUpdate.deleteMany({ where: { projectId: id.project } });
    await client.projectWorkflowStage.update({
      where: { id: id.workflowStage },
      data: { executionStatus: "NOT_STARTED", actualStartAt: null, nextUpdateDueDate: null },
    });
    await client.project.update({ where: { id: id.project }, data: { status: "ACTIVE" } });
  });

  afterAll(async () => {
    if (client) {
      await cleanup(client);
      const remaining = await client.$transaction(async (transaction) => ({
        people: await transaction.person.count({ where: { id: { in: personIds } } }),
        projects: await transaction.project.count({ where: { id: id.project } }),
        progress: await transaction.workflowUpdate.count({ where: { projectId: id.project } }),
        corrections: await transaction.workflowUpdateCorrection.count({ where: { projectId: id.project } }),
        audits: await transaction.auditLog.count({ where: { projectId: id.project } }),
        drafts: await transaction.attachmentDraft.count({ where: { projectId: id.project } }),
        uploadSessions: await transaction.attachmentUploadSession.count({ where: { projectId: id.project } }),
        assets: await transaction.fileAsset.count({ where: { projectId: id.project } }),
        attachments: await transaction.businessAttachment.count({ where: { projectId: id.project } }),
      }));
      expect(remaining).toEqual({
        people: 0, projects: 0, progress: 0, corrections: 0, audits: 0,
        drafts: 0, uploadSessions: 0, assets: 0, attachments: 0,
      });
      await client.$disconnect();
    }
  });

  it("atomically submits progress, starts the node, and writes an audit record", async () => {
    const update = await service.submit(reporter, progressInput("12.5"));

    expect(update).toMatchObject({
      submittedByPersonId: id.reporter,
      effectiveBudgetAmountCny: "12.50",
      latestCorrectionSequenceNo: 0,
    });
    await expect(client.projectWorkflowStage.findUniqueOrThrow({
      where: { id: id.workflowStage },
      select: { executionStatus: true, actualStartAt: true, nextUpdateDueDate: true },
    })).resolves.toMatchObject({
      executionStatus: "ACTIVE",
      actualStartAt: expect.any(Date),
      nextUpdateDueDate: expect.any(Date),
    });
    await expect(client.auditLog.count({
      where: { actionCode: "WORKFLOW_PROGRESS_SUBMITTED", entityId: update.id },
    })).resolves.toBe(1);
  });

  it("keeps PMO and Dean read-only while any assigned Key Sub-I may submit", async () => {
    await expect(service.submit(pmo, progressInput(null))).rejects.toMatchObject({
      code: "COLLABORATION_FORBIDDEN",
    });
    await expect(service.submit(dean, progressInput(null))).rejects.toMatchObject({
      code: "COLLABORATION_FORBIDDEN",
    });
    await expect(service.submit(other, progressInput(null))).resolves.toMatchObject({
      submittedByPersonId: id.other,
    });
    await expect(client.workflowUpdate.count({ where: { projectId: id.project } })).resolves.toBe(1);
  });

  it("preserves correction history and derives one current amount for all readable roles", async () => {
    const update = await service.submit(reporter, progressInput("10"));
    await service.correct(reporter, correctionInput(update.id, 0, "SET", "12.25"));
    await service.correct(primary, correctionInput(update.id, 1, "CLEAR", null));

    await expect(service.list(pmo, id.project)).resolves.toEqual([
      expect.objectContaining({
        id: update.id,
        effectiveBudgetAmountCny: null,
        latestCorrectionSequenceNo: 2,
      }),
    ]);
    await expect(service.list(dean, id.project)).resolves.toHaveLength(1);
    await expect(service.getRecordedBudgetTotal(pmo, id.project)).resolves.toBe("0.00");
    await expect(client.workflowUpdateCorrection.count({
      where: { workflowUpdateId: update.id },
    })).resolves.toBe(2);
    await expect(service.correct(other, correctionInput(update.id, 2, "SET", "5")))
      .rejects.toMatchObject({ code: "PROGRESS_CORRECTION_FORBIDDEN" });
  });

  it("allows only one correction for the same optimistic sequence", async () => {
    const update = await service.submit(reporter, progressInput("10"));
    const results = await Promise.allSettled([
      service.correct(reporter, correctionInput(update.id, 0, "SET", "11")),
      service.correct(primary, correctionInput(update.id, 0, "SET", "12")),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({ reason: { code: "PROGRESS_CORRECTION_CONFLICT" } });
    await expect(client.workflowUpdateCorrection.count({
      where: { workflowUpdateId: update.id },
    })).resolves.toBe(1);
  });

  it("rejects new progress and correction after the project enters CLOSING", async () => {
    const update = await service.submit(reporter, progressInput(null));
    await client.project.update({ where: { id: id.project }, data: { status: "CLOSING" } });

    await expect(service.submit(reporter, progressInput(null))).rejects.toMatchObject({
      code: "PROJECT_NOT_ACTIVE",
    });
    await expect(service.correct(reporter, correctionInput(update.id, 0, "SET", "1")))
      .rejects.toMatchObject({ code: "PROJECT_NOT_ACTIVE" });
  });

  it("keeps uploaded files private until progress submission atomically binds the draft", async () => {
    const draft = await attachmentRepository.createProgressDraft({
      actor: reporter,
      projectId: id.project,
      projectWorkflowStageId: id.workflowStage,
    });
    const prepared = await attachmentRepository.prepareUpload({
      actor: reporter,
      draftId: draft.id,
      idempotencyKey: "progress-upload-1",
      fileName: "虚拟项目进展.pdf",
      declaredMediaType: "application/pdf",
      sizeBytes: 1024,
      sha256: "a".repeat(64),
      declarationVersion: "P2-S2-V1",
    });
    await attachmentRepository.markFileAvailable({
      actor: reporter,
      assetId: prepared.assetId,
      storageObjectVersion: null,
      etag: "virtual-etag",
    });

    await expect(attachmentRepository.getDownloadTarget(pmo, prepared.assetId))
      .rejects.toMatchObject({ code: "ATTACHMENT_FORBIDDEN" });
    const update = await service.submit(reporter, {
      ...progressInput("1"),
      attachmentDraftIds: [draft.id],
    });
    await expect(attachmentRepository.getDownloadTarget(pmo, prepared.assetId)).resolves.toMatchObject({
      assetId: prepared.assetId,
      status: "AVAILABLE",
    });
    await expect(client.businessAttachment.findFirstOrThrow({
      where: { fileAssetId: prepared.assetId },
    })).resolves.toMatchObject({
      workflowUpdateId: update.id,
      parentType: "WORKFLOW_UPDATE",
    });
    await expect(service.list(pmo, id.project)).resolves.toEqual([
      expect.objectContaining({
        id: update.id,
        attachments: [{
          assetId: prepared.assetId,
          fileName: "虚拟项目进展.pdf",
          mediaType: "application/pdf",
          sizeBytes: 1024,
        }],
      }),
    ]);
    await expect(service.list(dean, id.project)).resolves.toEqual([
      expect.objectContaining({ attachments: [expect.objectContaining({ assetId: prepared.assetId })] }),
    ]);
    await attachmentRepository.recordMissingObject({ actor: pmo, assetId: prepared.assetId });
    await expect(service.list(pmo, id.project)).resolves.toEqual([
      expect.objectContaining({ attachments: [] }),
    ]);
  });

  it("enforces business attachment visibility for direct downloads and missing-object updates", async () => {
    const update = await service.submit(reporter, progressInput(null));
    const assets = new Map<string, string>();
    for (const visibilityScope of ["PROJECT_SHARED", "PMO_ONLY", "PMO_AND_DEAN", "ISSUE_PARTICIPANTS"] as const) {
      const draft = await attachmentRepository.createProgressDraft({
        actor: reporter,
        projectId: id.project,
        projectWorkflowStageId: id.workflowStage,
      });
      const prepared = await attachmentRepository.prepareUpload({
        actor: reporter,
        draftId: draft.id,
        idempotencyKey: `visibility-${visibilityScope.toLowerCase()}`,
        fileName: `${visibilityScope}.pdf`,
        declaredMediaType: "application/pdf",
        sizeBytes: 1024,
        sha256: visibilityScope.charCodeAt(0).toString(16).padStart(2, "0").repeat(32),
        declarationVersion: "VISIBILITY-V1",
      });
      await attachmentRepository.markFileAvailable({
        actor: reporter,
        assetId: prepared.assetId,
        storageObjectVersion: null,
        etag: `virtual-${visibilityScope}`,
      });
      await client.businessAttachment.create({ data: {
        projectId: id.project,
        fileAssetId: prepared.assetId,
        parentType: "WORKFLOW_UPDATE",
        visibilityScope,
        purposeCode: "VISIBILITY_TEST",
        attachedByPersonId: id.reporter,
        attachedRoleCode: "KEY_SUB_I",
        attachedAt: new Date(),
        workflowUpdateId: update.id,
      } });
      assets.set(visibilityScope, prepared.assetId);
    }

    const allowed = {
      PROJECT_SHARED: [pmo, dean, reporter],
      PMO_ONLY: [pmo],
      PMO_AND_DEAN: [pmo, dean],
      ISSUE_PARTICIPANTS: [pmo, dean, reporter],
    } as const;
    const actors = [pmo, dean, reporter] as const;
    for (const [visibilityScope, assetId] of assets) {
      for (const actor of actors) {
        const operation = attachmentRepository.getDownloadTarget(actor, assetId);
        if (allowed[visibilityScope as keyof typeof allowed].includes(actor as never)) {
          await expect(operation).resolves.toMatchObject({ assetId, status: "AVAILABLE" });
        } else {
          await expect(operation).rejects.toMatchObject({ code: "ATTACHMENT_FORBIDDEN" });
        }
      }
    }

    const privateAssetId = assets.get("PMO_ONLY")!;
    await expect(attachmentRepository.recordMissingObject({ actor: dean, assetId: privateAssetId }))
      .rejects.toMatchObject({ code: "ATTACHMENT_FORBIDDEN" });
    await expect(client.fileAsset.findUniqueOrThrow({ where: { id: privateAssetId }, select: { status: true } }))
      .resolves.toEqual({ status: "AVAILABLE" });
    await attachmentRepository.recordMissingObject({ actor: pmo, assetId: privateAssetId });
    await expect(client.fileAsset.findUniqueOrThrow({ where: { id: privateAssetId }, select: { status: true } }))
      .resolves.toEqual({ status: "REMOVED" });
  });

  it("claims only unsubmitted stale drafts for cleanup", async () => {
    const draft = await attachmentRepository.createProgressDraft({
      actor: reporter,
      projectId: id.project,
      projectWorkflowStageId: id.workflowStage,
    });
    const prepared = await attachmentRepository.prepareUpload({
      actor: reporter,
      draftId: draft.id,
      idempotencyKey: "cleanup-upload-1",
      fileName: "虚拟项目进展.pdf",
      declaredMediaType: "application/pdf",
      sizeBytes: 1024,
      sha256: "b".repeat(64),
      declarationVersion: "P2-S2-V1",
    });
    await client.attachmentDraft.update({
      where: { id: draft.id },
      data: {
        createdAt: new Date("2026-07-31T00:00:00.000Z"),
        lastActivityAt: new Date("2026-08-01T00:00:00.000Z"),
        expiresAt: new Date("2026-08-02T00:00:00.000Z"),
      },
    });
    await expect(attachmentRepository.claimCleanupBatch({ limit: 20, workerId: "integration-worker", leaseMs: 60_000 })).resolves.toEqual([
      { assetId: prepared.assetId, objectKey: prepared.objectKey },
    ]);
  });
});

function progressInput(budgetAmountCny: string | null) {
  return {
    projectId: id.project,
    projectWorkflowStageId: id.workflowStage,
    progressSummary: "虚拟项目普通进展",
    basis: "虚拟项目级依据",
    expectedCompletionDate: "2026-09-20",
    budgetAmountCny,
    attachmentDraftIds: [],
  };
}

function correctionInput(
  workflowUpdateId: string,
  expectedLatestSequenceNo: number,
  budgetAmountMode: "SET" | "CLEAR",
  revisedBudgetAmountCny: string | null,
) {
  return {
    projectId: id.project,
    workflowUpdateId,
    expectedLatestSequenceNo,
    correctionReason: "虚拟项目金额纠错",
    revisedProgressSummary: null,
    revisedBasis: null,
    revisedExpectedDateMode: "KEEP" as const,
    revisedExpectedDate: null,
    budgetAmountMode,
    revisedBudgetAmountCny,
  };
}

async function seed(client: ApplicationPrismaClient): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  await client.$transaction(async (transaction) => {
    await transaction.person.createMany({ data: [
      { id: id.pmo, loginName: "s2-pmo", displayName: "虚构 PMO", accountStatus: "ACTIVE" },
      { id: id.dean, loginName: "s2-dean", displayName: "虚构院长", accountStatus: "ACTIVE" },
      { id: id.reporter, loginName: "s2-reporter", displayName: "虚构填报人", accountStatus: "ACTIVE" },
      { id: id.primary, loginName: "s2-primary", displayName: "虚构主 Key Sub-I", accountStatus: "ACTIVE" },
      { id: id.other, loginName: "s2-other", displayName: "虚构其他 Key Sub-I", accountStatus: "ACTIVE" },
    ] });
    await transaction.session.createMany({ data: [
      { id: id.pmoSession, personId: id.pmo, tokenHash: "s2-pmo-token", activeRoleCode: "PMO", expiresAt },
      { id: id.deanSession, personId: id.dean, tokenHash: "s2-dean-token", activeRoleCode: "DEAN", expiresAt },
      { id: id.reporterSession, personId: id.reporter, tokenHash: "s2-reporter-token", activeRoleCode: "KEY_SUB_I", expiresAt },
      { id: id.primarySession, personId: id.primary, tokenHash: "s2-primary-token", activeRoleCode: "KEY_SUB_I", expiresAt },
      { id: id.otherSession, personId: id.other, tokenHash: "s2-other-token", activeRoleCode: "KEY_SUB_I", expiresAt },
    ] });
    await transaction.lifecycleTemplate.create({ data: {
      id: id.lifecycle,
      templateCode: "S2_PROGRESS",
      templateName: "虚构阶段二模板",
      status: "ACTIVE",
      versions: { create: {
        id: id.templateVersion,
        versionNo: 1,
        status: "PUBLISHED",
        publishedByPersonId: id.pmo,
        publishedAt: now,
        stageTemplates: { create: {
          id: id.stageTemplate,
          stageCode: "START",
          stageName: "启动",
          sortOrder: 0,
        } },
      } },
    } });
    await transaction.dictionary.createMany({ data: [
      { id: id.diseaseDictionary, dictionaryCode: "DISEASE_AREA", dictionaryName: "虚构疾病领域", description: "阶段二隔离测试" },
      { id: id.researchDictionary, dictionaryCode: "RESEARCH_TYPE", dictionaryName: "虚构研究类型", description: "阶段二隔离测试" },
    ] });
    await transaction.dictionaryOption.createMany({ data: [
      { id: id.diseaseOption, dictionaryId: id.diseaseDictionary, dictionaryCode: "DISEASE_AREA", optionCode: "VIRTUAL", displayName: "虚构领域", sortOrder: 0 },
      { id: id.researchOption, dictionaryId: id.researchDictionary, dictionaryCode: "RESEARCH_TYPE", optionCode: "VIRTUAL", displayName: "虚构类型", sortOrder: 0 },
    ] });
    await transaction.project.create({ data: {
      id: id.project,
      applicationCode: "APP-9201",
      projectCode: "DEMO-920",
      projectName: "虚构阶段二进展项目",
      projectSummary: "仅用于隔离测试",
      normalizedNameOccupancy: "虚构阶段二进展项目",
      applicantPersonId: id.reporter,
      status: "ACTIVE",
      establishedByPersonId: id.pmo,
      establishedAt: now,
      diseaseAreaOptionId: id.diseaseOption,
      researchTypeOptionId: id.researchOption,
      plannedStartDate: new Date("2026-09-01"),
      plannedEndDate: new Date("2026-09-30"),
    } });
    await transaction.roleAssignment.createMany({ data: [
      { personId: id.pmo, roleCode: "PMO", assignmentStatus: "ACTIVE", activatedAt: now, grantedByPersonId: id.pmo },
      { personId: id.dean, roleCode: "DEAN", assignmentStatus: "ACTIVE", activatedAt: now, grantedByPersonId: id.pmo },
      { personId: id.reporter, roleCode: "KEY_SUB_I", projectId: id.project, assignmentStatus: "ACTIVE", isPrimary: false, activatedAt: now, grantedByPersonId: id.pmo },
      { personId: id.primary, roleCode: "KEY_SUB_I", projectId: id.project, assignmentStatus: "ACTIVE", isPrimary: true, activatedAt: now, grantedByPersonId: id.pmo },
      { personId: id.other, roleCode: "KEY_SUB_I", projectId: id.project, assignmentStatus: "ACTIVE", isPrimary: false, activatedAt: now, grantedByPersonId: id.pmo },
    ] });
    await transaction.projectPlan.create({ data: { id: id.plan, projectId: id.project } });
    await transaction.projectPlanVersion.create({ data: {
      id: id.planVersion,
      projectPlanId: id.plan,
      versionNo: 1,
      templateVersionId: id.templateVersion,
      status: "ACTIVE",
      createdByPersonId: id.pmo,
      activatedAt: now,
    } });
    await transaction.projectStage.create({ data: {
      id: id.projectStage,
      projectId: id.project,
      projectPlanId: id.plan,
      sourceStageTemplateId: id.stageTemplate,
    } });
    await transaction.projectStageVersion.create({ data: {
      id: id.stageVersion,
      projectPlanVersionId: id.planVersion,
      projectStageId: id.projectStage,
      stageCode: "START",
      stageName: "启动",
      sortOrder: 0,
      plannedStartDate: new Date("2026-09-01"),
      plannedEndDate: new Date("2026-09-30"),
    } });
    await transaction.projectWorkflow.create({ data: {
      id: id.workflow,
      projectId: id.project,
      projectPlanId: id.plan,
      workflowType: "PROJECT_CUSTOM",
    } });
    await transaction.projectWorkflowVersion.create({ data: {
      id: id.workflowVersion,
      projectPlanVersionId: id.planVersion,
      projectWorkflowId: id.workflow,
      workflowCode: "PREPARE",
      workflowName: "准备",
      sortOrder: 0,
    } });
    await transaction.projectWorkflowStage.create({ data: {
      id: id.workflowStage,
      projectId: id.project,
      projectPlanId: id.plan,
      projectWorkflowId: id.workflow,
      projectStageId: id.projectStage,
    } });
    await transaction.projectWorkflowStageVersion.create({ data: {
      id: id.workflowStageVersion,
      projectPlanVersionId: id.planVersion,
      projectWorkflowStageId: id.workflowStage,
      projectWorkflowId: id.workflow,
      projectStageId: id.projectStage,
      taskName: "虚构进展节点",
      taskDescription: "仅用于隔离测试",
      plannedStartDate: new Date("2026-09-01"),
      plannedEndDate: new Date("2026-09-15"),
      updateIntervalDays: 7,
      attachmentRequirement: "OPTIONAL",
      sortOrder: 0,
      roleVersions: { create: {
        id: id.workflowStageRoleVersion,
        roleCode: "KEY_SUB_I",
        sortOrder: 0,
      } },
    } });
  });
}

async function cleanup(client: ApplicationPrismaClient): Promise<void> {
  await client.$transaction(async (transaction) => {
    await transaction.businessAttachment.deleteMany({ where: { projectId: id.project } });
    await transaction.fileAsset.deleteMany({ where: { projectId: id.project } });
    await transaction.attachmentUploadSession.deleteMany({ where: { projectId: id.project } });
    await transaction.attachmentDraft.deleteMany({ where: { projectId: id.project } });
    await transaction.auditLog.deleteMany({ where: { projectId: id.project } });
    await transaction.workflowUpdateCorrection.deleteMany({ where: { projectId: id.project } });
    await transaction.workflowUpdate.deleteMany({ where: { projectId: id.project } });
    await transaction.projectWorkflowStageRoleVersion.deleteMany({ where: { id: id.workflowStageRoleVersion } });
    await transaction.projectWorkflowStageVersion.deleteMany({ where: { id: id.workflowStageVersion } });
    await transaction.projectWorkflowVersion.deleteMany({ where: { id: id.workflowVersion } });
    await transaction.projectStageVersion.deleteMany({ where: { id: id.stageVersion } });
    await transaction.projectWorkflowStage.deleteMany({ where: { id: id.workflowStage } });
    await transaction.projectWorkflow.deleteMany({ where: { id: id.workflow } });
    await transaction.projectStage.deleteMany({ where: { id: id.projectStage } });
    await transaction.projectPlanVersion.deleteMany({ where: { id: id.planVersion } });
    await transaction.projectPlan.deleteMany({ where: { id: id.plan } });
    await transaction.roleAssignment.deleteMany({ where: { personId: { in: personIds } } });
    await transaction.project.deleteMany({ where: { id: id.project } });
    await transaction.dictionaryOption.deleteMany({ where: { id: { in: [id.diseaseOption, id.researchOption] } } });
    await transaction.dictionary.deleteMany({ where: { id: { in: [id.diseaseDictionary, id.researchDictionary] } } });
    await transaction.stageTemplate.deleteMany({ where: { id: id.stageTemplate } });
    await transaction.lifecycleTemplateVersion.deleteMany({ where: { id: id.templateVersion } });
    await transaction.lifecycleTemplate.deleteMany({ where: { id: id.lifecycle } });
    await transaction.session.deleteMany({ where: { personId: { in: personIds } } });
    await transaction.person.deleteMany({ where: { id: { in: personIds } } });
  });
}

const personIds = [id.pmo, id.dean, id.reporter, id.primary, id.other];
