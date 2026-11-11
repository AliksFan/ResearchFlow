import { Argon2idPasswordHasher } from "@researchflow/auth";
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  assertTestSeedAllowed,
  createPrismaClient,
  ensureDefaultCollaborationTimeLimits,
} from "@researchflow/db";

export const E2E_PASSWORD = "虚拟端到端安全口令 2026";
export const E2E_PERSON_IDS = {
  pmo: "e2000000-0000-4000-8000-000000000001",
  dean: "e2000000-0000-4000-8000-000000000002",
  key: "e2000000-0000-4000-8000-000000000003",
  crc: "e2000000-0000-4000-8000-000000000004",
  statistician: "e2000000-0000-4000-8000-000000000005",
  collaborationLead: "e2000000-0000-4000-8000-000000000006",
  multi: "e2000000-0000-4000-8000-000000000007",
  zero: "e2000000-0000-4000-8000-000000000008",
  forced: "e2000000-0000-4000-8000-000000000009",
  secondKey: "e2000000-0000-4000-8000-000000000010",
  proposedPrimary: "e2000000-0000-4000-8000-000000000011",
  secondPmo: "e2000000-0000-4000-8000-000000000012",
} as const;
export const E2E_PROJECT_IDS = [
  "e3000000-0000-4000-8000-000000000001",
  "e3000000-0000-4000-8000-000000000002",
] as const;
export const E2E_WORKFLOW_STAGE_ID = "ed000000-0000-4000-8000-000000000005";
export const E2E_SUCCESSOR_WORKFLOW_STAGE_ID = "ee000000-0000-4000-8000-000000000005";
export const E2E_ISSUE_TYPE_OPTION_ID = "e5000000-0000-4000-8000-000000000004";
const E2E_DICTIONARY_IDS = [
  "e4000000-0000-4000-8000-000000000001",
  "e4000000-0000-4000-8000-000000000002",
  "e4000000-0000-4000-8000-000000000004",
] as const;
const E2E_DICTIONARY_OPTION_IDS = [
  "e5000000-0000-4000-8000-000000000001",
  "e5000000-0000-4000-8000-000000000002",
  E2E_ISSUE_TYPE_OPTION_ID,
] as const;
const E2E_DICTIONARY_OTHER_OPTION_IDS = [
  "e5100000-0000-4000-8000-000000000001",
  "e5100000-0000-4000-8000-000000000002",
  "e5100000-0000-4000-8000-000000000004",
] as const;

export function getE2eClient() {
  assertE2eEnvironment();
  return createPrismaClient(process.env.DATABASE_URL!);
}

export async function seedE2eFixture() {
  const client = getE2eClient();
  const hash = await new Argon2idPasswordHasher().hash(E2E_PASSWORD);
  await cleanupE2eFixture(client);
  await client.person.createMany({
    data: [
      [E2E_PERSON_IDS.pmo, "e2e-pmo", "虚拟 E2E PMO", false],
      [E2E_PERSON_IDS.dean, "e2e-dean", "虚拟 E2E 院长", false],
      [E2E_PERSON_IDS.key, "e2e-key-sub-i", "虚拟 E2E Key Sub-I", false],
      [E2E_PERSON_IDS.crc, "e2e-crc", "虚拟 E2E CRC", false],
      [E2E_PERSON_IDS.statistician, "e2e-statistician", "虚拟 E2E 统计师", false],
      [E2E_PERSON_IDS.collaborationLead, "e2e-collaboration-lead", "虚拟 E2E 协作负责人", false],
      [E2E_PERSON_IDS.multi, "e2e-multi-role", "虚拟 E2E 多角色", false],
      [E2E_PERSON_IDS.zero, "e2e-zero-role", "虚拟 E2E 零角色", false],
      [E2E_PERSON_IDS.forced, "e2e-forced-pmo", "虚拟 E2E 强制改密 PMO", true],
      [E2E_PERSON_IDS.secondKey, "e2e-second-key-sub-i", "虚拟 E2E 第二申请人", false],
      [E2E_PERSON_IDS.proposedPrimary, "e2e-proposed-primary", "虚拟 E2E 拟任负责人", false],
      [E2E_PERSON_IDS.secondPmo, "e2e-second-pmo", "虚拟 E2E 第二 PMO", false],
    ].map(([id, loginName, displayName, mustChangePassword]) => ({
      id: id as string,
      loginName: loginName as string,
      displayName: displayName as string,
      passwordHash: hash,
      accountStatus: "ACTIVE" as const,
      mustChangePassword: mustChangePassword as boolean,
      passwordChangedAt: new Date(),
    })),
  });
  const dictionaries = [
    ["DISEASE_AREA", E2E_DICTIONARY_IDS[0], E2E_DICTIONARY_OPTION_IDS[0]],
    ["RESEARCH_TYPE", E2E_DICTIONARY_IDS[1], E2E_DICTIONARY_OPTION_IDS[1]],
    ["ISSUE_TYPE", E2E_DICTIONARY_IDS[2], E2E_DICTIONARY_OPTION_IDS[2]],
  ] as const;
  for (const [index, [code, dictionaryId, optionId]] of dictionaries.entries()) {
    await client.dictionary.create({
      data: {
        id: dictionaryId,
        dictionaryCode: code,
        dictionaryName: `虚拟 E2E ${code}`,
        description: "仅用于认证授权 E2E",
        options: {
          create: [
            { id: optionId, optionCode: "VIRTUAL", displayName: "虚拟选项" },
            {
              id: E2E_DICTIONARY_OTHER_OPTION_IDS[index],
              optionCode: "OTHER",
              displayName: "其它",
              sortOrder: 9999,
            },
          ],
        },
      },
    });
  }
  for (const [index, projectId] of E2E_PROJECT_IDS.entries()) {
    await client.project.create({
      data: {
        id: projectId,
        applicationCode: `APP-${9001 + index}`,
        projectCode: null,
        projectName: `虚拟 E2E 项目 ${index + 1}`,
        projectSummary: "仅用于项目范围授权验证",
        applicantPersonId: E2E_PERSON_IDS.key,
        diseaseAreaOptionId: dictionaries[0][2],
        researchTypeOptionId: dictionaries[1][2],
        plannedStartDate: new Date("2026-09-01"),
        plannedEndDate: new Date("2026-09-30"),
      },
    });
  }
  const assignments = [
    [E2E_PERSON_IDS.pmo, "PMO", null],
    [E2E_PERSON_IDS.dean, "DEAN", null],
    [E2E_PERSON_IDS.key, "KEY_SUB_I", E2E_PROJECT_IDS[0]],
    [E2E_PERSON_IDS.secondKey, "KEY_SUB_I", E2E_PROJECT_IDS[1]],
    [E2E_PERSON_IDS.crc, "CRC", E2E_PROJECT_IDS[0]],
    [E2E_PERSON_IDS.statistician, "STATISTICIAN", E2E_PROJECT_IDS[0]],
    [E2E_PERSON_IDS.collaborationLead, "COLLABORATION_LEAD", E2E_PROJECT_IDS[0]],
    [E2E_PERSON_IDS.multi, "PMO", null],
    [E2E_PERSON_IDS.multi, "DEAN", null],
    [E2E_PERSON_IDS.forced, "PMO", null],
    [E2E_PERSON_IDS.secondPmo, "PMO", null],
  ] as const;
  await client.roleAssignment.createMany({
    data: assignments.map(([personId, roleCode, projectId], index) => ({
      id: `e6000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      personId,
      roleCode,
      projectId,
      assignmentStatus: "ACTIVE" as const,
      isPrimary: roleCode === "KEY_SUB_I",
      grantSource: "PMO_ACTION" as const,
      grantedByPersonId: E2E_PERSON_IDS.pmo,
      activatedAt: new Date(),
    })),
  });
  await client.roleEligibility.createMany({
    data: [E2E_PERSON_IDS.key, E2E_PERSON_IDS.secondKey, E2E_PERSON_IDS.proposedPrimary].map(
      (personId, index) => ({
        id: `e7000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        personId,
        roleCode: "KEY_SUB_I" as const,
        status: "ACTIVE" as const,
        grantedByPersonId: E2E_PERSON_IDS.pmo,
        reason: "虚拟 E2E 自主申请资格",
      }),
    ),
  });
  await client.lifecycleTemplate.create({
    data: {
      id: "e8000000-0000-4000-8000-000000000001",
      templateCode: "E2E_PROJECT_APPLICATION",
      templateName: "虚拟 E2E 项目生命周期",
      status: "ACTIVE",
      versions: {
        create: {
          id: "e8000000-0000-4000-8000-000000000002",
          versionNo: 1,
          status: "PUBLISHED",
          publishedByPersonId: E2E_PERSON_IDS.pmo,
          publishedAt: new Date(),
          stageTemplates: {
            create: {
              id: "e8000000-0000-4000-8000-000000000003",
              stageCode: "START",
              stageName: "启动阶段",
              sortOrder: 1,
            },
          },
          workflowTemplates: {
            create: {
              id: "e8000000-0000-4000-8000-000000000004",
              workflowCode: "PREPARE",
              workflowName: "准备工作流",
              description: "虚拟 E2E 工作流",
              workflowStageTemplates: {
                create: {
                  id: "e8000000-0000-4000-8000-000000000005",
                  templateVersionId: "e8000000-0000-4000-8000-000000000002",
                  stageTemplateId: "e8000000-0000-4000-8000-000000000003",
                  sortOrder: 1,
                  defaultTask: "完成准备",
                  defaultOwnerRole: "KEY_SUB_I",
                },
              },
            },
          },
        },
      },
    },
  });
  await client.workflowTemplate.create({ data: {
    id: "e8000000-0000-4000-8000-000000000006",
    templateVersionId: "e8000000-0000-4000-8000-000000000002",
    workflowCode: "VERIFY",
    workflowName: "核验工作流",
    description: "虚构 E2E 后继工作流",
    workflowStageTemplates: { create: {
      id: "e8000000-0000-4000-8000-000000000007",
      templateVersionId: "e8000000-0000-4000-8000-000000000002",
      stageTemplateId: "e8000000-0000-4000-8000-000000000003",
      sortOrder: 2,
      defaultTask: "完成核验",
      defaultOwnerRole: "KEY_SUB_I",
      defaultAttachmentRequirement: "REQUIRED",
    } },
  } });
  await client.workflowStageTemplateDependency.create({ data: {
    id: "e8000000-0000-4000-8000-000000000008",
    templateVersionId: "e8000000-0000-4000-8000-000000000002",
    predecessorWorkflowStageTemplateId: "e8000000-0000-4000-8000-000000000005",
    successorWorkflowStageTemplateId: "e8000000-0000-4000-8000-000000000007",
  } });
  await ensureDefaultCollaborationTimeLimits(client, {
    updatedByPersonId: E2E_PERSON_IDS.pmo,
    correlationId: "phase-2-stage-1-e2e-defaults",
  });
  const globalWorkflowReviewLimit = await client.collaborationTimeLimitSetting.findFirstOrThrow({
    where: { projectId: null, responsibilityType: "WORKFLOW_COMPLETION_PMO_REVIEW" },
  });
  await client.collaborationTimeLimitSetting.create({ data: {
    projectId: E2E_PROJECT_IDS[0],
    responsibilityType: "WORKFLOW_COMPLETION_PMO_REVIEW",
    timeLimitDays: globalWorkflowReviewLimit.timeLimitDays,
    reminderIntervalDays: globalWorkflowReviewLimit.reminderIntervalDays,
    updatedByPersonId: E2E_PERSON_IDS.pmo,
  } });
  await client.$transaction(async (transaction) => {
    const now = new Date();
    for (const [index, projectId] of E2E_PROJECT_IDS.entries()) {
      const planId = `eb000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      const planVersionId = `ec000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      await transaction.projectPlan.create({ data: { id: planId, projectId } });
      await transaction.projectPlanVersion.create({ data: {
        id: planVersionId,
        projectPlanId: planId,
        versionNo: 1,
        templateVersionId: "e8000000-0000-4000-8000-000000000002",
        swimlaneName: "虚拟 E2E 项目泳道",
        status: "ACTIVE",
        createdByPersonId: E2E_PERSON_IDS.pmo,
        activatedAt: now,
      } });
      if (index === 0) {
        await transaction.projectStage.create({ data: { id: "ed000000-0000-4000-8000-000000000001", projectId, projectPlanId: planId, sourceStageTemplateId: "e8000000-0000-4000-8000-000000000003" } });
        await transaction.projectStageVersion.create({ data: { id: "ed000000-0000-4000-8000-000000000002", projectPlanVersionId: planVersionId, projectStageId: "ed000000-0000-4000-8000-000000000001", stageCode: "START", stageName: "启动阶段", sortOrder: 1, plannedStartDate: new Date("2026-09-01"), plannedEndDate: new Date("2026-09-30") } });
        await transaction.projectWorkflow.create({ data: { id: "ed000000-0000-4000-8000-000000000003", projectId, projectPlanId: planId, sourceWorkflowTemplateId: "e8000000-0000-4000-8000-000000000004", workflowType: "STANDARD" } });
        await transaction.projectWorkflowVersion.create({ data: { id: "ed000000-0000-4000-8000-000000000004", projectPlanVersionId: planVersionId, projectWorkflowId: "ed000000-0000-4000-8000-000000000003", workflowCode: "PREPARE", workflowName: "准备工作流", sortOrder: 1 } });
        await transaction.projectWorkflowStage.create({ data: { id: E2E_WORKFLOW_STAGE_ID, projectId, projectPlanId: planId, projectWorkflowId: "ed000000-0000-4000-8000-000000000003", projectStageId: "ed000000-0000-4000-8000-000000000001" } });
        await transaction.projectWorkflowStageVersion.create({ data: { id: "ed000000-0000-4000-8000-000000000006", projectPlanVersionId: planVersionId, projectWorkflowStageId: E2E_WORKFLOW_STAGE_ID, projectWorkflowId: "ed000000-0000-4000-8000-000000000003", projectStageId: "ed000000-0000-4000-8000-000000000001", taskName: "完成准备", taskDescription: "虚构阶段二进展节点", plannedStartDate: new Date("2026-09-01"), plannedEndDate: new Date("2026-09-15"), updateIntervalDays: 7, attachmentRequirement: "OPTIONAL", sortOrder: 1, roleVersions: { create: { id: "ed000000-0000-4000-8000-000000000007", roleCode: "KEY_SUB_I", sortOrder: 1 } } } });
        await transaction.projectWorkflow.create({ data: { id: "ee000000-0000-4000-8000-000000000003", projectId, projectPlanId: planId, sourceWorkflowTemplateId: "e8000000-0000-4000-8000-000000000006", workflowType: "STANDARD" } });
        await transaction.projectWorkflowVersion.create({ data: { id: "ee000000-0000-4000-8000-000000000004", projectPlanVersionId: planVersionId, projectWorkflowId: "ee000000-0000-4000-8000-000000000003", workflowCode: "VERIFY", workflowName: "核验工作流", sortOrder: 2 } });
        await transaction.projectWorkflowStage.create({ data: { id: E2E_SUCCESSOR_WORKFLOW_STAGE_ID, projectId, projectPlanId: planId, projectWorkflowId: "ee000000-0000-4000-8000-000000000003", projectStageId: "ed000000-0000-4000-8000-000000000001" } });
        await transaction.projectWorkflowStageVersion.create({ data: { id: "ee000000-0000-4000-8000-000000000006", projectPlanVersionId: planVersionId, projectWorkflowStageId: E2E_SUCCESSOR_WORKFLOW_STAGE_ID, projectWorkflowId: "ee000000-0000-4000-8000-000000000003", projectStageId: "ed000000-0000-4000-8000-000000000001", taskName: "完成核验", taskDescription: "虚构阶段三后继节点", plannedStartDate: new Date("2026-09-16"), plannedEndDate: new Date("2026-09-30"), attachmentRequirement: "REQUIRED", sortOrder: 2, roleVersions: { create: { id: "ee000000-0000-4000-8000-000000000007", roleCode: "KEY_SUB_I", sortOrder: 1 } } } });
        await transaction.projectWorkflowStageDependencyVersion.create({ data: { id: "ee000000-0000-4000-8000-000000000008", projectId, projectPlanVersionId: planVersionId, predecessorProjectWorkflowStageId: E2E_WORKFLOW_STAGE_ID, successorProjectWorkflowStageId: E2E_SUCCESSOR_WORKFLOW_STAGE_ID } });
        if (process.env.RF_PHASE2_STAGE5_E2E === "1") {
          await transaction.projectWorkflowStage.updateMany({
            where: { id: { in: [E2E_WORKFLOW_STAGE_ID, E2E_SUCCESSOR_WORKFLOW_STAGE_ID] } },
            data: { executionStatus: "COMPLETED", actualEndAt: now },
          });
        }
      }
      await transaction.project.update({ where: { id: projectId }, data: {
        projectCode: `DEMO-${901 + index}`,
        normalizedNameOccupancy: `虚拟 e2e 项目 ${index + 1}`,
        status: "ACTIVE",
        establishedByPersonId: E2E_PERSON_IDS.pmo,
        establishedAt: now,
      } });
    }
  });
  await client.$disconnect();
}

export async function cleanupE2eFixture(existingClient?: ReturnType<typeof getE2eClient>) {
  const client = existingClient ?? getE2eClient();
  try {
    await client.$executeRaw`
      TRUNCATE TABLE "person", "dictionary", "lifecycle_template", "project", "auth_rate_limit", "reminder_run", "attachment_cleanup_run" CASCADE
    `;
    const remaining = await client.$transaction(async (transaction) => ({
      people: await transaction.person.count(),
      projects: await transaction.project.count(),
      progress: await transaction.workflowUpdate.count(),
      corrections: await transaction.workflowUpdateCorrection.count(),
      audits: await transaction.auditLog.count(),
      drafts: await transaction.attachmentDraft.count(),
      uploadSessions: await transaction.attachmentUploadSession.count(),
      assets: await transaction.fileAsset.count(),
      attachments: await transaction.businessAttachment.count(),
      notifications: await transaction.notification.count(),
      outboxes: await transaction.notificationOutbox.count(),
      reminderRuns: await transaction.reminderRun.count(),
      cleanupRuns: await transaction.attachmentCleanupRun.count(),
    }));
    if (Object.values(remaining).some((count) => count !== 0)) {
      throw new Error(`E2E database teardown left fixture data: ${JSON.stringify(remaining)}`);
    }
  } finally {
    if (!existingClient) await client.$disconnect();
  }
}

export async function prepareE2eObjectStorage() {
  if (!usesPhase2ObjectStorage()) return;
  const { client, bucket } = getE2eStorageClient();
  try {
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") throw error;
    }
    await removeAllE2eObjects(client, bucket);
  } finally {
    client.destroy();
  }
}

export async function cleanupE2eObjectStorage() {
  if (!usesPhase2ObjectStorage()) return;
  const { client, bucket } = getE2eStorageClient();
  try {
    await removeAllE2eObjects(client, bucket);
    const remaining = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    if ((remaining.Contents?.length ?? 0) !== 0) {
      throw new Error("E2E object storage teardown left fixture objects");
    }
  } finally {
    client.destroy();
  }
}

function usesPhase2ObjectStorage() {
  return [
    "RF_PHASE2_STAGE2_E2E",
    "RF_PHASE2_STAGE3_E2E",
    "RF_PHASE2_STAGE4_E2E",
    "RF_PHASE2_STAGE5_E2E",
    "RF_PHASE2_STAGE6_E2E",
  ].some((name) => process.env[name] === "1");
}

function assertE2eEnvironment() {
  assertTestSeedAllowed(process.env);
  if (process.env.RF_E2E_DATABASE !== "1") throw new Error("RF_E2E_DATABASE is required");
  const stage1 = process.env.RF_PHASE2_STAGE1_E2E === "1";
  const stage2 = process.env.RF_PHASE2_STAGE2_E2E === "1";
  const stage3 = process.env.RF_PHASE2_STAGE3_E2E === "1";
  const stage4 = process.env.RF_PHASE2_STAGE4_E2E === "1";
  const stage5 = process.env.RF_PHASE2_STAGE5_E2E === "1";
  const stage6 = process.env.RF_PHASE2_STAGE6_E2E === "1";
  if ([stage1, stage2, stage3, stage4, stage5, stage6].filter(Boolean).length !== 1) throw new Error("Exactly one phase 2 E2E stage flag is required");
  const databaseUrl = process.env.DATABASE_URL;
  const databaseName = databaseUrl?.match(/\/([^/?]+)(?:\?|$)/)?.[1];
  if (!databaseName?.startsWith("researchflow_validation_")) {
    throw new Error("E2E requires an explicitly named isolated validation database");
  }
  const parsedDatabaseUrl = new URL(databaseUrl!);
  if (
    (stage4 || stage5 || stage6) &&
    (parsedDatabaseUrl.hostname !== "127.0.0.1" ||
      parsedDatabaseUrl.port !== "55434" ||
      parsedDatabaseUrl.pathname !== "/researchflow_validation_1")
  ) {
    throw new Error("Phase 2 Stage 4/5/6 E2E requires the exact approved isolated validation database");
  }
  const configuredSchema = process.env.RF_E2E_EXPECTED_SCHEMA?.trim();
  const expectedSchema = configuredSchema || (stage6 ? "p2_s6_repository_v1" : stage5 ? "p2_s5_repository_v1" : stage4 ? "p2_s4_repository_v1" : stage3 ? "p2_s3_repository_v1" : stage2 ? "p2_s2_repository_v1" : "p2_s1_e2e_v1");
  if (configuredSchema && !/^(?:p2_[a-z0-9_]+|formal_web_[a-z0-9_]+|prod_pilot_[a-z0-9_]+)$/u.test(configuredSchema)) {
    throw new Error("RF_E2E_EXPECTED_SCHEMA is not an approved isolated schema name");
  }
  if (parsedDatabaseUrl.searchParams.get("schema") !== expectedSchema) {
    throw new Error(`E2E requires the ${expectedSchema} schema`);
  }
}

function getE2eStorageClient() {
  const endpoint = requiredStorageEnvironment("ATTACHMENT_S3_ENDPOINT");
  const configuredEndpoint = process.env.RF_E2E_EXPECTED_S3_ENDPOINT?.trim();
  const bucket = requiredStorageEnvironment("ATTACHMENT_S3_BUCKET");
  const configuredBucket = process.env.RF_E2E_EXPECTED_BUCKET?.trim();
  const expectedBucket = configuredBucket || (process.env.RF_PHASE2_STAGE6_E2E === "1"
    ? "researchflow-p2-s6-validation"
    : process.env.RF_PHASE2_STAGE5_E2E === "1"
    ? "researchflow-p2-s5-manual"
    : process.env.RF_PHASE2_STAGE4_E2E === "1"
      ? "researchflow-p2-s4-manual"
      : process.env.RF_PHASE2_STAGE3_E2E === "1"
        ? "researchflow-p2-s3-validation"
        : "researchflow-p2-s2-validation");
  if (configuredBucket && !/^researchflow-[a-z0-9-]+$/u.test(configuredBucket)) {
    throw new Error("RF_E2E_EXPECTED_BUCKET is not an approved isolated bucket name");
  }
  const expectedEndpoint = configuredEndpoint || "http://127.0.0.1:9100";
  if (configuredEndpoint && !/^http:\/\/127\.0\.0\.1:\d{4,5}$/u.test(configuredEndpoint)) {
    throw new Error("RF_E2E_EXPECTED_S3_ENDPOINT must be an explicit loopback HTTP endpoint");
  }
  if (endpoint !== expectedEndpoint || bucket !== expectedBucket) {
    throw new Error("Phase 2 E2E requires the exact stage-isolated local object store");
  }
  const accessKeyId = requiredStorageEnvironment("ATTACHMENT_S3_ACCESS_KEY_ID");
  const secretAccessKey = requiredStorageEnvironment("ATTACHMENT_S3_SECRET_ACCESS_KEY");
  return {
    bucket,
    client: new S3Client({
      endpoint,
      region: requiredStorageEnvironment("ATTACHMENT_S3_REGION"),
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    }),
  };
}

async function removeAllE2eObjects(client: S3Client, bucket: string) {
  let continuationToken: string | undefined;
  do {
    const listed = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
    }));
    const objects = (listed.Contents ?? []).flatMap(({ Key }) => Key ? [{ Key }] : []);
    if (objects.length > 0) {
      await client.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: objects, Quiet: true },
      }));
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}

function requiredStorageEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for stage 2 E2E`);
  return value;
}
