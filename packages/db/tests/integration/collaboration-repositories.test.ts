import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CollaborationError,
  CollaborationService,
  DEFAULT_COLLABORATION_TIME_LIMITS,
  DictionaryService,
  ProjectBasicInformationService,
  ProjectSwimlaneService,
} from "@researchflow/collaboration";

import {
  createPrismaClient,
  ensureDefaultCollaborationTimeLimits,
  PrismaCollaborationRepository,
  PrismaDictionaryRepository,
  PrismaProjectBasicInformationRepository,
  PrismaProjectSwimlaneRepository,
  type ApplicationPrismaClient,
} from "../../src/index.js";

const stage6IntegrationEnabled = process.env.RF_PHASE2_STAGE6_TEST_DATABASE === "1";
const explicitIntegrationSchema = process.env.RF_REPOSITORY_TEST_SCHEMA?.trim();
const integrationEnabled = process.env.RF_PHASE2_STAGE1_TEST_DATABASE === "1" || stage6IntegrationEnabled || Boolean(explicitIntegrationSchema);
const expectedSchema = explicitIntegrationSchema || (stage6IntegrationEnabled ? "p2_s6_repository_v1" : "p2_s1_repository_v1");

const id = {
    pmo: "b1000000-0000-4000-8000-000000000001",
    dean: "b1000000-0000-4000-8000-000000000002",
    keySubI: "b1000000-0000-4000-8000-000000000003",
    otherKeySubI: "b1000000-0000-4000-8000-000000000004",
    pmoSession: "b2000000-0000-4000-8000-000000000001",
    deanSession: "b2000000-0000-4000-8000-000000000002",
    keySession: "b2000000-0000-4000-8000-000000000003",
    otherSession: "b2000000-0000-4000-8000-000000000004",
    revokedSession: "b2000000-0000-4000-8000-000000000005",
    lifecycle: "b3000000-0000-4000-8000-000000000001",
    templateVersion: "b3000000-0000-4000-8000-000000000002",
    stageTemplate: "b3000000-0000-4000-8000-000000000003",
    project1: "b4000000-0000-4000-8000-000000000001",
    project2: "b4000000-0000-4000-8000-000000000002",
    plan1: "b5000000-0000-4000-8000-000000000001",
    plan2: "b5000000-0000-4000-8000-000000000002",
    planVersion1: "b5000000-0000-4000-8000-000000000003",
    planVersion2: "b5000000-0000-4000-8000-000000000004",
    projectStage: "b6000000-0000-4000-8000-000000000001",
    workflow: "b6000000-0000-4000-8000-000000000002",
    workflowStage: "b6000000-0000-4000-8000-000000000003",
    keyAssignment: "b7000000-0000-4000-8000-000000000003",
    stageVersion: "b8000000-0000-4000-8000-000000000001",
    workflowVersion: "b8000000-0000-4000-8000-000000000002",
    workflowStageVersion: "b8000000-0000-4000-8000-000000000003",
    workflowStageRoleVersion: "b8000000-0000-4000-8000-000000000004",
    addedStage: "b6000000-0000-4000-8000-000000000011",
    addedWorkflow: "b6000000-0000-4000-8000-000000000012",
    addedWorkflowStage: "b6000000-0000-4000-8000-000000000013",
    diseaseDictionary: "b9000000-0000-4000-8000-000000000001",
    researchDictionary: "b9000000-0000-4000-8000-000000000002",
    diseaseOption: "ba000000-0000-4000-8000-000000000001",
    researchOption: "ba000000-0000-4000-8000-000000000002",
    diseaseOtherOption: "ba000000-0000-4000-8000-000000000003",
    deletableDiseaseOption: "ba000000-0000-4000-8000-000000000004",
};

describe.runIf(integrationEnabled)("Prisma collaboration repository", () => {
  let client: ApplicationPrismaClient;
  let service: CollaborationService;

  const pmo = { personId: id.pmo, sessionId: id.pmoSession, roleCode: "PMO" as const };
  const dean = { personId: id.dean, sessionId: id.deanSession, roleCode: "DEAN" as const };
  const keySubI = { personId: id.keySubI, sessionId: id.keySession, roleCode: "KEY_SUB_I" as const };
  const otherKeySubI = { personId: id.otherKeySubI, sessionId: id.otherSession, roleCode: "KEY_SUB_I" as const };

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const url = new URL(databaseUrl);
    const configuredSchema = url.searchParams.get("schema");
    if ((stage6IntegrationEnabled || explicitIntegrationSchema) && (url.hostname !== "127.0.0.1" || url.port !== "55434" || !/^\/researchflow_validation_[12]$/u.test(url.pathname) || !/^(?:p2_[a-z0-9_]+|formal_web_[a-z0-9_]+)$/u.test(expectedSchema))) {
      throw new Error("Refusing collaboration integration test outside the approved database");
    }
    client = createPrismaClient(databaseUrl);
    const identity = await client.$queryRaw<Array<{ databaseName: string; schemaName: string; tableName: string | null }>>`
      SELECT current_database() AS "databaseName", current_schema() AS "schemaName",
             to_regclass('collaboration_time_limit_setting')::text AS "tableName"
    `;
    const target = identity[0];
    if (
      !target ||
      !/(test|validation|scratch)/iu.test(target.databaseName) ||
      configuredSchema !== expectedSchema ||
      target.schemaName !== expectedSchema ||
      target.tableName !== "collaboration_time_limit_setting"
    ) {
      throw new Error(`Refusing collaboration integration test outside ${expectedSchema}: ${JSON.stringify(target)}`);
    }
    await cleanup(client);
    await seed(client);
    service = new CollaborationService(new PrismaCollaborationRepository(client));
  });

  afterAll(async () => {
    if (client) {
      await cleanup(client);
      await client.$disconnect();
    }
  });

  it("enforces PMO, Dean, and Key Sub-I project scopes", async () => {
    await expect(service.listProjects(pmo)).resolves.toHaveLength(2);
    await expect(service.listProjects(dean)).resolves.toHaveLength(2);
    await expect(service.listProjects(keySubI)).resolves.toEqual([
      expect.objectContaining({ projectId: id.project1, projectCode: "DEMO-901" }),
    ]);
    await expect(service.getOverview(keySubI, id.project2)).resolves.toBeNull();
    await expect(service.getOverview(otherKeySubI, id.project1)).resolves.toBeNull();
  });

  it("returns the active plan, stage, node, role, and dependency projection", async () => {
    const overview = await service.getOverview(pmo, id.project1);
    expect(overview).toMatchObject({
      projectId: id.project1,
      swimlaneName: "项目生命周期泳道",
      canEditSwimlane: true,
      stages: [{
        stageCode: "START",
        applicability: "REQUIRED",
        workflows: [{
          workflowCode: "PREPARE",
          ownerRoles: ["KEY_SUB_I"],
          attachmentRequirement: "NONE",
          executionStatus: "NOT_STARTED",
        }],
      }],
    });
  });

  it("removes access immediately when the project grant ends", async () => {
    await client.roleAssignment.update({
      where: { id: id.keyAssignment },
      data: { assignmentStatus: "ENDED", isPrimary: false, endedAt: new Date() },
    });
    await expect(service.listProjects(keySubI)).resolves.toEqual([]);
    await client.roleAssignment.update({
      where: { id: id.keyAssignment },
      data: { assignmentStatus: "ACTIVE", isPrimary: true, endedAt: null },
    });
  });

  it("removes PMO access immediately when the global grant ends", async () => {
    const assignment = await client.roleAssignment.findFirstOrThrow({
      where: { personId: id.pmo, roleCode: "PMO", projectId: null, assignmentStatus: "ACTIVE" },
    });
    await client.roleAssignment.update({
      where: { id: assignment.id },
      data: { assignmentStatus: "ENDED", endedAt: new Date() },
    });
    await expect(service.listProjects(pmo)).rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
    await client.roleAssignment.update({
      where: { id: assignment.id },
      data: { assignmentStatus: "ACTIVE", endedAt: null },
    });
  });

  it("rejects revoked sessions even when their role assignment remains active", async () => {
    await expect(service.listProjects({ ...pmo, sessionId: id.revokedSession })).rejects.toMatchObject({
      code: "COLLABORATION_FORBIDDEN",
    });
  });

  it("lets PMO configure a project time limit atomically with an audit record", async () => {
    const setting = await service.configureTimeLimit(pmo, {
      projectId: id.project1,
      responsibilityType: "WORKFLOW_COMPLETION_PMO_REVIEW",
      timeLimitDays: 4,
      reminderIntervalDays: 1,
    });
    expect(setting).toMatchObject({ projectId: id.project1, timeLimitDays: 4 });
    await expect(client.auditLog.count({
      where: { actorPersonId: id.pmo, entityId: setting.id, actionCode: "COLLABORATION_TIME_LIMIT_CONFIGURED" },
    })).resolves.toBe(1);
  });

  it("initializes every global default once and exposes the PMO-only global list", async () => {
    await ensureDefaultCollaborationTimeLimits(client, {
      updatedByPersonId: id.pmo,
      correlationId: "phase-2-stage-1-defaults",
    });
    await ensureDefaultCollaborationTimeLimits(client, {
      updatedByPersonId: id.pmo,
      correlationId: "phase-2-stage-1-defaults-repeat",
    });

    const settings = await service.listGlobalTimeLimits(pmo);
    expect(settings).toHaveLength(DEFAULT_COLLABORATION_TIME_LIMITS.length);
    expect(settings.map(({ responsibilityType, timeLimitDays, reminderIntervalDays }) => ({
      responsibilityType,
      timeLimitDays,
      reminderIntervalDays,
    }))).toEqual(DEFAULT_COLLABORATION_TIME_LIMITS);
    expect(() => service.listGlobalTimeLimits(dean)).toThrow(
      expect.objectContaining({ code: "COLLABORATION_FORBIDDEN" }),
    );
    await expect(client.auditLog.count({
      where: { actionCode: "COLLABORATION_TIME_LIMIT_DEFAULTS_INITIALIZED" },
    })).resolves.toBe(1);
  });

  it("keeps Dean and Key Sub-I configuration read-only", async () => {
    const input = {
      projectId: id.project1,
      responsibilityType: "PROJECT_COMPLETION_PMO_REVIEW" as const,
      timeLimitDays: 4,
      reminderIntervalDays: 1,
    };
    await expect(service.configureTimeLimit(dean, input)).rejects.toBeInstanceOf(CollaborationError);
    await expect(service.configureTimeLimit(keySubI, input)).rejects.toBeInstanceOf(CollaborationError);
  });

  it("deletes only unreferenced ordinary dictionary options with audit and concurrency protection", async () => {
    const dictionaries = new DictionaryService(new PrismaDictionaryRepository(client));
    const workspace = await dictionaries.listWorkspace(pmo, "DISEASE_AREA");
    expect(workspace.options.at(-1)).toMatchObject({ optionCode: "OTHER", displayName: "其它", sortOrder: 9999, systemReserved: true });
    expect(workspace.options.find(({ id: optionId }) => optionId === id.diseaseOption)?.referenceCount).toBeGreaterThan(0);
    const deletable = workspace.options.find(({ id: optionId }) => optionId === id.deletableDiseaseOption)!;
    expect(deletable.referenceCount).toBe(0);

    expect(() => dictionaries.deleteOption(dean, "DISEASE_AREA", deletable.id, deletable.expectedUpdatedAt))
      .toThrow(expect.objectContaining({ code: "COLLABORATION_FORBIDDEN" }));
    await expect(dictionaries.deleteOption(pmo, "DISEASE_AREA", id.diseaseOption, workspace.options.find(({ id: optionId }) => optionId === id.diseaseOption)!.expectedUpdatedAt))
      .rejects.toMatchObject({ code: "DICTIONARY_OPTION_IN_USE" });
    await expect(dictionaries.deleteOption(pmo, "DISEASE_AREA", id.diseaseOtherOption, workspace.options.at(-1)!.expectedUpdatedAt))
      .rejects.toMatchObject({ code: "DICTIONARY_OPTION_RESERVED" });
    await expect(dictionaries.deleteOption(pmo, "DISEASE_AREA", deletable.id, "2026-01-01T00:00:00.000Z"))
      .rejects.toMatchObject({ code: "DICTIONARY_CONFLICT" });

    await dictionaries.deleteOption(pmo, "DISEASE_AREA", deletable.id, deletable.expectedUpdatedAt);
    await expect(client.dictionaryOption.findUnique({ where: { id: deletable.id } })).resolves.toBeNull();
    await expect(client.auditLog.count({ where: { actorPersonId: id.pmo, entityId: deletable.id, actionCode: "DICTIONARY_OPTION_DELETED" } })).resolves.toBe(1);
  });

  it("applies a project swimlane snapshot atomically, protects completed nodes, and rejects stale revisions", async () => {
    const swimlanes = new ProjectSwimlaneService(new PrismaProjectSwimlaneRepository(client));
    const editable = await swimlanes.getEditable(pmo, id.project1);
    expect(editable).toMatchObject({ expectedRevision: id.planVersion1, canEdit: true, name: "项目生命周期泳道" });
    await expect(swimlanes.apply(dean, { ...editable, expectedRevision: editable.expectedRevision, reason: "院长不得修改" }))
      .rejects.toMatchObject({ code: "PROJECT_SWIMLANE_FORBIDDEN" });

    await client.projectWorkflowStage.update({ where: { id: id.workflowStage }, data: { executionStatus: "COMPLETED", actualEndAt: new Date() } });
    await expect(swimlanes.apply(pmo, { ...editable, reason: "越界修改正式完成节点", nodes: editable.nodes.map((node) => ({ ...node, applicability: "NOT_APPLICABLE" as const })) }))
      .rejects.toMatchObject({ code: "PROJECT_SWIMLANE_COMPLETED_NODE_RESTRICTED" });
    await client.projectWorkflowStage.update({ where: { id: id.workflowStage }, data: { executionStatus: "NOT_STARTED", actualEndAt: null } });

    const result = await swimlanes.apply(pmo, {
      ...editable,
      name: "虚构项目独立泳道",
      reason: "新增虚构阶段、工作流和节点",
      stages: [...editable.stages, { id: id.addedStage, code: "VIRTUAL_FOLLOW_UP", name: "虚构随访阶段", sortOrder: 1, applicability: "REQUIRED", plannedStartDate: null, plannedEndDate: null }],
      workflows: [...editable.workflows, { id: id.addedWorkflow, code: "VIRTUAL_FOLLOW_UP", name: "虚构随访工作流", description: "仅用于集成测试", sortOrder: 1, enabled: true }],
      nodes: [...editable.nodes, { id: id.addedWorkflowStage, workflowId: id.addedWorkflow, stageId: id.addedStage, taskName: "虚构随访节点", taskDescription: "验证新增结构直接生效", sortOrder: 0, applicability: "REQUIRED", plannedStartDate: null, plannedEndDate: null, updateIntervalDays: null, overdueReminderIntervalDays: 7, attachmentRequirement: "NONE", ownerRoles: ["KEY_SUB_I"], predecessorIds: [], executionStatus: "NOT_STARTED", hasExecutionHistory: false }],
    });
    expect(result.swimlaneName).toBe("虚构项目独立泳道");
    await expect(client.projectPlanVersion.findFirstOrThrow({ where: { projectPlanId: id.plan1, status: "ACTIVE" }, select: { swimlaneName: true, baseVersionId: true } }))
      .resolves.toEqual({ swimlaneName: "虚构项目独立泳道", baseVersionId: id.planVersion1 });
    await expect(client.projectPlanVersion.findUniqueOrThrow({ where: { id: id.planVersion1 }, select: { status: true } })).resolves.toEqual({ status: "SUPERSEDED" });
    await expect(client.projectStageVersion.findFirst({ where: { projectPlanVersion: { projectPlanId: id.plan1, status: "ACTIVE" }, projectStageId: id.addedStage }, select: { stageName: true } })).resolves.toEqual({ stageName: "虚构随访阶段" });
    await expect(client.projectWorkflowStageVersion.findFirst({ where: { projectPlanVersion: { projectPlanId: id.plan1, status: "ACTIVE" }, projectWorkflowStageId: id.addedWorkflowStage }, select: { taskName: true } })).resolves.toEqual({ taskName: "虚构随访节点" });
    await expect(client.notification.count({ where: { projectId: id.project1, eventCode: "PROJECT_SWIMLANE_UPDATED", recipientPersonId: id.keySubI, messageKind: "INFORMATIONAL", actionStatus: "NOT_APPLICABLE" } })).resolves.toBe(1);
    await expect(client.notification.count({ where: { projectId: id.project1, eventCode: "PROJECT_SWIMLANE_UPDATED", recipientPersonId: id.dean } })).resolves.toBe(0);
    await expect(swimlanes.apply(pmo, { ...editable, name: "并发覆盖应失败", reason: "验证乐观并发" })).rejects.toMatchObject({ code: "PROJECT_SWIMLANE_CONFLICT" });
  });

  it("enforces the two-way basic-information review and persists stale requests", async () => {
    const basicInformation = new ProjectBasicInformationService(new PrismaProjectBasicInformationRepository(client));
    const otherDirectionRequest = await basicInformation.submit(pmo, {
      commandId: "c1000000-0000-4000-8000-000000000001",
      projectId: id.project1,
      projectName: "虚构协作项目一",
      projectSummary: "虚构项目级说明 yixiegenggai",
      diseaseAreaOptionId: id.diseaseOtherOption,
      diseaseAreaOptionCode: "OTHER",
      diseaseAreaOtherText: "yixiefangx",
      researchTypeOptionId: id.researchOption,
      researchTypeOptionCode: "VIRTUAL",
      researchTypeOtherText: null,
      leadOrganizationName: null,
      sponsorName: null,
      fundingRecordAmountCny: null,
      reason: "na",
    });
    await expect(basicInformation.submit(pmo, {
      commandId: "c1000000-0000-4000-8000-000000000001",
      projectId: id.project1,
      projectName: "虚构协作项目一",
      projectSummary: "虚构项目级说明 yixiegenggai",
      diseaseAreaOptionId: id.diseaseOtherOption,
      diseaseAreaOptionCode: "OTHER",
      diseaseAreaOtherText: "yixiefangx",
      researchTypeOptionId: id.researchOption,
      researchTypeOptionCode: "VIRTUAL",
      researchTypeOtherText: null,
      leadOrganizationName: null,
      sponsorName: null,
      fundingRecordAmountCny: null,
      reason: "na",
    })).resolves.toEqual(otherDirectionRequest);
    await expect(client.projectFieldChangeRequest.count({ where: { projectId: id.project1, status: "PENDING_PRIMARY_KEY_SUB_I_REVIEW" } })).resolves.toBe(1);
    await basicInformation.decide(keySubI, { projectId: id.project1, requestId: otherDirectionRequest.requestId, decision: "APPLY", note: null });
    await expect(client.project.findUniqueOrThrow({ where: { id: id.project1 }, select: { diseaseAreaOptionId: true, diseaseAreaOtherText: true } }))
      .resolves.toEqual({ diseaseAreaOptionId: id.diseaseOtherOption, diseaseAreaOtherText: "yixiefangx" });
    const command = {
      commandId: "c1000000-0000-4000-8000-000000000002",
      projectId: id.project1,
      projectName: "虚构协作项目一（更新）",
      projectSummary: "虚构项目级说明更新",
      diseaseAreaOptionId: id.diseaseOption,
      diseaseAreaOptionCode: "VIRTUAL",
      diseaseAreaOtherText: null,
      researchTypeOptionId: id.researchOption,
      researchTypeOptionCode: "VIRTUAL",
      researchTypeOtherText: null,
      leadOrganizationName: "虚构研究中心",
      sponsorName: null,
      fundingRecordAmountCny: "100000.00",
      reason: "验证主负责人提交后由 PMO 审核",
    };

    await expect(basicInformation.getWorkspace(dean, id.project1)).resolves.toMatchObject({ canSubmit: false });
    await expect(basicInformation.getWorkspace(otherKeySubI, id.project1)).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    await expect(basicInformation.getWorkspace({ ...pmo, sessionId: id.revokedSession }, id.project1)).rejects.toMatchObject({ code: "PROJECT_BASIC_INFORMATION_FORBIDDEN" });

    const keyRequest = await basicInformation.submit(keySubI, command);
    await expect(basicInformation.getWorkspace(pmo, id.project1)).resolves.toMatchObject({ activeRequest: { requestId: keyRequest.requestId, canApply: true, status: "PENDING_PMO_REVIEW" } });
    await expect(basicInformation.getWorkspace(dean, id.project1)).resolves.toMatchObject({ activeRequest: { requestId: keyRequest.requestId, canApply: false } });
    await expect(basicInformation.decide(dean, { projectId: id.project1, requestId: keyRequest.requestId, decision: "APPLY", note: null })).rejects.toMatchObject({ code: "PROJECT_BASIC_INFORMATION_FORBIDDEN" });
    await basicInformation.decide(pmo, { projectId: id.project1, requestId: keyRequest.requestId, decision: "APPLY", note: null });
    const appliedProject = await client.project.findUniqueOrThrow({ where: { id: id.project1 }, select: { projectName: true, fundingRecordAmountCny: true } });
    expect(appliedProject.projectName).toBe("虚构协作项目一(更新)");
    expect(appliedProject.fundingRecordAmountCny?.toFixed(2)).toBe("100000.00");

    const pmoRequest = await basicInformation.submit(pmo, { ...command, commandId: "c1000000-0000-4000-8000-000000000003", sponsorName: "虚构申办方", reason: "验证 PMO 提交后由主负责人确认" });
    await expect(basicInformation.decide(pmo, { projectId: id.project1, requestId: pmoRequest.requestId, decision: "APPLY", note: null })).rejects.toMatchObject({ code: "PROJECT_BASIC_INFORMATION_FORBIDDEN" });
    await basicInformation.decide(keySubI, { projectId: id.project1, requestId: pmoRequest.requestId, decision: "APPLY", note: null });

    const staleRequest = await basicInformation.submit(keySubI, { ...command, commandId: "c1000000-0000-4000-8000-000000000004", projectSummary: "并发后不得覆盖", sponsorName: "虚构申办方", reason: "验证项目行变化使申请失效" });
    await client.project.update({ where: { id: id.project1 }, data: { rowVersion: { increment: 1 } } });
    await expect(basicInformation.decide(pmo, { projectId: id.project1, requestId: staleRequest.requestId, decision: "APPLY", note: null })).rejects.toMatchObject({ code: "PROJECT_BASIC_INFORMATION_CONFLICT" });
    await expect(client.projectFieldChangeRequest.findUniqueOrThrow({ where: { id: staleRequest.requestId }, select: { status: true } })).resolves.toEqual({ status: "STALE" });
    await expect(client.notification.count({ where: { projectId: id.project1, recipientPersonId: id.dean, eventCode: { startsWith: "PROJECT_BASIC_INFORMATION" } } })).resolves.toBe(0);
    await expect(client.auditLog.count({ where: { projectId: id.project1, actionCode: "PROJECT_BASIC_INFORMATION_CHANGE_STALE" } })).resolves.toBe(1);
  });
});

async function seed(client: ApplicationPrismaClient): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  await client.$transaction(async (transaction) => {
    for (const [personId, loginName, displayName] of [
      [id.pmo, "s1-pmo", "虚构 PMO"],
      [id.dean, "s1-dean", "虚构院长"],
      [id.keySubI, "s1-key", "虚构 Key Sub-I"],
      [id.otherKeySubI, "s1-other-key", "虚构其他 Key Sub-I"],
    ] as const) {
      await transaction.person.create({ data: { id: personId, loginName, displayName, accountStatus: "ACTIVE" } });
    }
    await transaction.session.createMany({ data: [
      { id: id.pmoSession, personId: id.pmo, tokenHash: "s1-pmo-token", activeRoleCode: "PMO", expiresAt },
      { id: id.deanSession, personId: id.dean, tokenHash: "s1-dean-token", activeRoleCode: "DEAN", expiresAt },
      { id: id.keySession, personId: id.keySubI, tokenHash: "s1-key-token", activeRoleCode: "KEY_SUB_I", expiresAt },
      { id: id.otherSession, personId: id.otherKeySubI, tokenHash: "s1-other-token", activeRoleCode: "KEY_SUB_I", expiresAt },
      { id: id.revokedSession, personId: id.pmo, tokenHash: "s1-revoked-token", activeRoleCode: "PMO", expiresAt, revokedAt: now },
    ] });
    await transaction.lifecycleTemplate.create({ data: {
      id: id.lifecycle, templateCode: "S1_TEMPLATE", templateName: "虚构阶段一模板", status: "ACTIVE",
      versions: { create: {
        id: id.templateVersion, versionNo: 1, status: "PUBLISHED", publishedByPersonId: id.pmo, publishedAt: now,
        stageTemplates: { create: { id: id.stageTemplate, stageCode: "START", stageName: "启动", sortOrder: 0 } },
      } },
    } });
    await transaction.dictionary.createMany({ data: [
      { id: id.diseaseDictionary, dictionaryCode: "DISEASE_AREA", dictionaryName: "虚构疾病领域", description: "阶段一集成测试" },
      { id: id.researchDictionary, dictionaryCode: "RESEARCH_TYPE", dictionaryName: "虚构研究类型", description: "阶段一集成测试" },
    ] });
    await transaction.dictionaryOption.createMany({ data: [
      { id: id.diseaseOption, dictionaryId: id.diseaseDictionary, dictionaryCode: "DISEASE_AREA", optionCode: "VIRTUAL", displayName: "虚构领域", sortOrder: 0 },
      { id: id.researchOption, dictionaryId: id.researchDictionary, dictionaryCode: "RESEARCH_TYPE", optionCode: "VIRTUAL", displayName: "虚构类型", sortOrder: 0 },
      { id: id.diseaseOtherOption, dictionaryId: id.diseaseDictionary, dictionaryCode: "DISEASE_AREA", optionCode: "OTHER", displayName: "其它", sortOrder: 9999 },
      { id: id.deletableDiseaseOption, dictionaryId: id.diseaseDictionary, dictionaryCode: "DISEASE_AREA", optionCode: "VIRTUAL_UNUSED", displayName: "虚构未引用方向", sortOrder: 10 },
    ] });
    await transaction.project.createMany({ data: [
      { id: id.project1, applicationCode: "APP-9101", projectCode: "DEMO-901", projectName: "虚构协作项目一", projectSummary: "虚构项目级说明", normalizedNameOccupancy: "虚构协作项目一", applicantPersonId: id.keySubI, status: "ACTIVE", establishedByPersonId: id.pmo, establishedAt: now, diseaseAreaOptionId: id.diseaseOption, researchTypeOptionId: id.researchOption, plannedStartDate: new Date("2026-09-01"), plannedEndDate: new Date("2026-09-30") },
      { id: id.project2, applicationCode: "APP-9102", projectCode: "DEMO-902", projectName: "虚构协作项目二", projectSummary: "虚构项目级说明", normalizedNameOccupancy: "虚构协作项目二", applicantPersonId: id.otherKeySubI, status: "ACTIVE", establishedByPersonId: id.pmo, establishedAt: now, diseaseAreaOptionId: id.diseaseOption, researchTypeOptionId: id.researchOption, plannedStartDate: new Date("2026-09-01"), plannedEndDate: new Date("2026-09-30") },
    ] });
    await transaction.roleAssignment.createMany({ data: [
      { id: "b7000000-0000-4000-8000-000000000001", personId: id.pmo, roleCode: "PMO", assignmentStatus: "ACTIVE", activatedAt: now, grantedByPersonId: id.pmo },
      { id: "b7000000-0000-4000-8000-000000000002", personId: id.dean, roleCode: "DEAN", assignmentStatus: "ACTIVE", activatedAt: now, grantedByPersonId: id.pmo },
      { id: id.keyAssignment, personId: id.keySubI, roleCode: "KEY_SUB_I", projectId: id.project1, assignmentStatus: "ACTIVE", isPrimary: true, activatedAt: now, grantedByPersonId: id.pmo },
      { id: "b7000000-0000-4000-8000-000000000004", personId: id.otherKeySubI, roleCode: "KEY_SUB_I", projectId: id.project2, assignmentStatus: "ACTIVE", isPrimary: true, activatedAt: now, grantedByPersonId: id.pmo },
    ] });
    await transaction.projectPlan.createMany({ data: [
      { id: id.plan1, projectId: id.project1 },
      { id: id.plan2, projectId: id.project2 },
    ] });
    await transaction.projectPlanVersion.createMany({ data: [
      { id: id.planVersion1, projectPlanId: id.plan1, versionNo: 1, templateVersionId: id.templateVersion, status: "ACTIVE", createdByPersonId: id.pmo, activatedAt: now },
      { id: id.planVersion2, projectPlanId: id.plan2, versionNo: 1, templateVersionId: id.templateVersion, status: "ACTIVE", createdByPersonId: id.pmo, activatedAt: now },
    ] });
    await transaction.projectStage.create({ data: { id: id.projectStage, projectId: id.project1, projectPlanId: id.plan1, sourceStageTemplateId: id.stageTemplate } });
    await transaction.projectStageVersion.create({ data: { id: id.stageVersion, projectPlanVersionId: id.planVersion1, projectStageId: id.projectStage, stageCode: "START", stageName: "启动", sortOrder: 0, plannedStartDate: new Date("2026-09-01"), plannedEndDate: new Date("2026-09-30") } });
    await transaction.projectWorkflow.create({ data: { id: id.workflow, projectId: id.project1, projectPlanId: id.plan1, workflowType: "PROJECT_CUSTOM" } });
    await transaction.projectWorkflowVersion.create({ data: { id: id.workflowVersion, projectPlanVersionId: id.planVersion1, projectWorkflowId: id.workflow, workflowCode: "PREPARE", workflowName: "准备", sortOrder: 0 } });
    await transaction.projectWorkflowStage.create({ data: { id: id.workflowStage, projectId: id.project1, projectPlanId: id.plan1, projectWorkflowId: id.workflow, projectStageId: id.projectStage } });
    await transaction.projectWorkflowStageVersion.create({ data: { id: id.workflowStageVersion, projectPlanVersionId: id.planVersion1, projectWorkflowStageId: id.workflowStage, projectWorkflowId: id.workflow, projectStageId: id.projectStage, taskName: "准备材料", taskDescription: "虚构只读节点", plannedStartDate: new Date("2026-09-01"), plannedEndDate: new Date("2026-09-15"), sortOrder: 0, roleVersions: { create: { id: id.workflowStageRoleVersion, roleCode: "KEY_SUB_I", sortOrder: 0 } } } });
  });
}

async function cleanup(client: ApplicationPrismaClient): Promise<void> {
  await client.$transaction(async (transaction) => {
    await transaction.auditLog.deleteMany({ where: { actorPersonId: { in: [id.pmo, id.dean, id.keySubI, id.otherKeySubI] } } });
    await transaction.notification.deleteMany({ where: { projectId: { in: [id.project1, id.project2] } } });
    await transaction.projectFieldChangeActivity.deleteMany({ where: { request: { projectId: { in: [id.project1, id.project2] } } } });
    await transaction.projectFieldChangeItem.deleteMany({ where: { request: { projectId: { in: [id.project1, id.project2] } } } });
    await transaction.projectFieldChangeRequest.deleteMany({ where: { projectId: { in: [id.project1, id.project2] } } });
    await transaction.projectPlanChangeActivity.deleteMany({ where: { request: { projectId: { in: [id.project1, id.project2] } } } });
    await transaction.projectPlanChangeRequest.deleteMany({ where: { projectId: { in: [id.project1, id.project2] } } });
    await transaction.collaborationTimeLimitSetting.deleteMany({ where: { updatedByPersonId: { in: [id.pmo, id.dean, id.keySubI, id.otherKeySubI] } } });
    await transaction.projectWorkflowStageDependencyVersion.deleteMany({ where: { projectId: { in: [id.project1, id.project2] } } });
    await transaction.projectWorkflowStageRoleVersion.deleteMany({ where: { projectWorkflowStageVersion: { projectPlanVersion: { projectPlan: { projectId: { in: [id.project1, id.project2] } } } } } });
    await transaction.projectWorkflowStageVersion.deleteMany({ where: { projectPlanVersion: { projectPlan: { projectId: { in: [id.project1, id.project2] } } } } });
    await transaction.projectWorkflowVersion.deleteMany({ where: { projectPlanVersion: { projectPlan: { projectId: { in: [id.project1, id.project2] } } } } });
    await transaction.projectStageVersion.deleteMany({ where: { projectPlanVersion: { projectPlan: { projectId: { in: [id.project1, id.project2] } } } } });
    await transaction.projectWorkflowStage.deleteMany({ where: { projectId: { in: [id.project1, id.project2] } } });
    await transaction.projectWorkflow.deleteMany({ where: { projectId: { in: [id.project1, id.project2] } } });
    await transaction.projectStage.deleteMany({ where: { projectId: { in: [id.project1, id.project2] } } });
    await transaction.projectPlanVersion.deleteMany({ where: { projectPlanId: { in: [id.plan1, id.plan2] } } });
    await transaction.projectPlan.deleteMany({ where: { id: { in: [id.plan1, id.plan2] } } });
    await transaction.roleAssignment.deleteMany({ where: { personId: { in: [id.pmo, id.dean, id.keySubI, id.otherKeySubI] } } });
    await transaction.project.deleteMany({ where: { id: { in: [id.project1, id.project2] } } });
    await transaction.dictionaryOption.deleteMany({ where: { id: { in: [id.diseaseOption, id.researchOption, id.diseaseOtherOption, id.deletableDiseaseOption] } } });
    await transaction.dictionary.deleteMany({ where: { id: { in: [id.diseaseDictionary, id.researchDictionary] } } });
    await transaction.stageTemplate.deleteMany({ where: { id: id.stageTemplate } });
    await transaction.lifecycleTemplateVersion.deleteMany({ where: { id: id.templateVersion } });
    await transaction.lifecycleTemplate.deleteMany({ where: { id: id.lifecycle } });
    await transaction.session.deleteMany({ where: { personId: { in: [id.pmo, id.dean, id.keySubI, id.otherKeySubI] } } });
    await transaction.person.deleteMany({ where: { id: { in: [id.pmo, id.dean, id.keySubI, id.otherKeySubI] } } });
  });
}
