import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ProjectApplicationError,
  type ApplicationFormInput,
  type ProjectApplicationActor,
  type ProjectApplicationSnapshot,
} from "@researchflow/project-application";

import {
  createPrismaClient,
  PrismaNotificationRepository,
  PrismaProjectApplicationGateway,
  type ApplicationPrismaClient,
} from "../../src/index.js";

const stage6IntegrationEnabled = process.env.RF_PHASE2_STAGE6_TEST_DATABASE === "1";
const explicitIntegrationSchema = process.env.RF_REPOSITORY_TEST_SCHEMA?.trim();
const integrationEnabled = process.env.RF_PROJECT_APPLICATION_TEST_DATABASE === "1" || stage6IntegrationEnabled || Boolean(explicitIntegrationSchema);

describe.runIf(integrationEnabled)("Prisma project application gateway", () => {
  let client: ApplicationPrismaClient;
  let gateway: PrismaProjectApplicationGateway;

  const ids = {
    pmo: "a1000000-0000-4000-8000-000000000001",
    applicant: "a1000000-0000-4000-8000-000000000002",
    other: "a1000000-0000-4000-8000-000000000003",
    pmoSession: "a2000000-0000-4000-8000-000000000001",
    applicantSession: "a2000000-0000-4000-8000-000000000002",
    otherSession: "a2000000-0000-4000-8000-000000000003",
    lifecycle: "a3000000-0000-4000-8000-000000000001",
    lifecycleVersion: "a3000000-0000-4000-8000-000000000002",
    stage: "a3000000-0000-4000-8000-000000000003",
    workflow: "a3000000-0000-4000-8000-000000000004",
    workflowStage: "a3000000-0000-4000-8000-000000000005",
    formalOnlyProject: "a6000000-0000-4000-8000-000000000001",
    formalOnlyPlan: "a6000000-0000-4000-8000-000000000002",
    formalOnlyPlanVersion: "a6000000-0000-4000-8000-000000000003",
    formalOnlyAssignment: "a6000000-0000-4000-8000-000000000004",
  };

  const pmoActor = { personId: ids.pmo, roleCode: "PMO" as const, sessionId: ids.pmoSession };
  const applicantActor = { personId: ids.applicant, roleCode: "KEY_SUB_I" as const, sessionId: ids.applicantSession };
  const otherActor = { personId: ids.other, roleCode: "KEY_SUB_I" as const, sessionId: ids.otherSession };

  let optionIds: Record<string, string>;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const url = new URL(databaseUrl);
    const configuredSchema = url.searchParams.get("schema");
    if ((stage6IntegrationEnabled || explicitIntegrationSchema) && (url.hostname !== "127.0.0.1" || url.port !== "55434" || url.pathname !== "/researchflow_validation_1" || (explicitIntegrationSchema && !/^(?:p2_[a-z0-9_]+|formal_web_[a-z0-9_]+|prod_pilot_[a-z0-9_]+)$/u.test(explicitIntegrationSchema)))) {
      throw new Error("Refusing project application integration test outside the approved database");
    }
    const allowedSchemas = new Set([
      "project_application_empty_20260818",
      "p2_s1_project_application_v1",
      ...(stage6IntegrationEnabled ? ["p2_s6_repository_v1"] : []),
      ...(explicitIntegrationSchema ? [explicitIntegrationSchema] : []),
    ]);
    client = createPrismaClient(databaseUrl);
    const identity = await client.$queryRaw<Array<{
      databaseName: string;
      schemaName: string;
      applicationTable: string | null;
    }>>`
      SELECT
        current_database() AS "databaseName",
        current_schema() AS "schemaName",
        to_regclass('project_application_command')::text AS "applicationTable"
    `;
    const target = identity[0];
    if (
      !target ||
      !/(test|validation|scratch)/iu.test(target.databaseName) ||
      !configuredSchema ||
      !allowedSchemas.has(configuredSchema) ||
      target.schemaName !== configuredSchema ||
      target.applicationTable !== "project_application_command"
    ) {
      throw new Error(
        `Refusing project application integration test outside its isolated schema: ${JSON.stringify({
          databaseName: target?.databaseName,
          configuredSchema,
          currentSchema: target?.schemaName,
          applicationTable: target?.applicationTable,
        })}`,
      );
    }
    gateway = new PrismaProjectApplicationGateway(client);
    await resetFixtureData(client);
    optionIds = await seedFixture(client, ids);
  });

  afterAll(async () => {
    if (client) {
      await resetFixtureData(client);
      await client.$disconnect();
    }
  }, 30_000);

  it("runs create, return/resubmit, pause/resume, and atomic establishment", async () => {
    const created = await gateway.createDraft({
      actor: applicantActor,
      commandId: "create-1",
      projectName: "虚构脑健康协作项目",
    });
    expect(created).toMatchObject({ status: "DRAFT", applicationCode: expect.stringMatching(/^APP-/u) });

    const form = applicationForm(ids, optionIds);
    const saved = await gateway.saveDraft({
      actor: applicantActor,
      commandId: "save-1",
      projectId: created.projectId,
      applicationVersionId: created.applicationVersionId,
      expectedRowVersion: created.rowVersion,
      form,
    });
    const swimlaneSaved = await gateway.saveSwimlane({
      ...command(saved, applicantActor, "swimlane-1"),
      swimlane: expandedApplicationSwimlane(ids, 0),
    });
    const submitted = await gateway.submitApplication({
      actor: applicantActor,
      commandId: "submit-1",
      projectId: swimlaneSaved.projectId,
      applicationVersionId: swimlaneSaved.applicationVersionId,
      expectedRowVersion: swimlaneSaved.rowVersion,
    });
    expect(submitted.status).toBe("PENDING_ESTABLISHMENT_REVIEW");

    const returned = await gateway.returnForRevision({
      actor: pmoActor,
      commandId: "return-1",
      projectId: submitted.projectId,
      applicationVersionId: submitted.applicationVersionId,
      expectedRowVersion: submitted.rowVersion,
      reviewId: submitted.reviewId!,
      comment: "请补充后重提",
    });
    expect(returned).toMatchObject({ status: "RETURNED_FOR_REVISION", applicationVersionNo: 2 });
    const returnedDetail = await gateway.getMyApplicationDetail(applicantActor, returned.projectId);
    expect(returnedDetail?.swimlane).toMatchObject({ name: "虚构自定义申请泳道", expectedRevision: 0 });
    expect(returnedDetail?.swimlane.stages).toHaveLength(2);
    expect(returnedDetail?.swimlane.workflows).toHaveLength(2);
    expect(returnedDetail?.swimlane.nodes).toHaveLength(2);
    expect(returnedDetail?.swimlane.nodes.find(({ taskName }) => taskName === "完成自定义复核")?.predecessorIds).toHaveLength(1);

    const resaved = await gateway.saveDraft({
      actor: applicantActor,
      commandId: "save-2",
      projectId: returned.projectId,
      applicationVersionId: returned.applicationVersionId,
      expectedRowVersion: returned.rowVersion,
      form,
    });
    const resubmitted = await gateway.submitApplication({
      actor: applicantActor,
      commandId: "submit-2",
      projectId: resaved.projectId,
      applicationVersionId: resaved.applicationVersionId,
      expectedRowVersion: resaved.rowVersion,
    });

    const paused = await gateway.putOnHold({
      actor: pmoActor,
      commandId: "pause-1",
      projectId: resubmitted.projectId,
      applicationVersionId: resubmitted.applicationVersionId,
      expectedRowVersion: resubmitted.rowVersion,
      reviewId: resubmitted.reviewId!,
      comment: "等待治理确认",
    });
    expect(paused.status).toBe("ON_HOLD");
    const resumed = await gateway.resumeReview({
      actor: pmoActor,
      commandId: "resume-1",
      projectId: paused.projectId,
      applicationVersionId: paused.applicationVersionId,
      expectedRowVersion: paused.rowVersion,
      reviewId: paused.reviewId!,
      comment: null,
    });
    const approved = await gateway.approveAndEstablish({
      actor: pmoActor,
      commandId: "approve-1",
      projectId: resumed.projectId,
      applicationVersionId: resumed.applicationVersionId,
      expectedRowVersion: resumed.rowVersion,
      reviewId: resumed.reviewId!,
      comment: "批准建档",
    });
    expect(approved).toMatchObject({ status: "ACTIVE", projectCode: expect.stringMatching(/^DEMO-/u) });

    const repeated = await gateway.approveAndEstablish({
      actor: pmoActor,
      commandId: "approve-1",
      projectId: resumed.projectId,
      applicationVersionId: resumed.applicationVersionId,
      expectedRowVersion: resumed.rowVersion,
      reviewId: resumed.reviewId!,
      comment: "批准建档",
    });
    expect(repeated.projectCode).toBe(approved.projectCode);
    expect(await client.projectPlan.count({ where: { projectId: approved.projectId } })).toBe(1);
    expect(await client.projectStage.count({ where: { projectId: approved.projectId } })).toBe(2);
    expect(await client.projectWorkflow.count({ where: { projectId: approved.projectId } })).toBe(2);
    expect(await client.projectWorkflowStage.count({ where: { projectId: approved.projectId } })).toBe(2);
    expect(await client.projectWorkflowStageDependencyVersion.count({ where: { projectId: approved.projectId } })).toBe(1);
    expect(await client.projectPlanVersion.findFirstOrThrow({ where: { projectPlan: { projectId: approved.projectId } }, select: { swimlaneName: true } })).toEqual({ swimlaneName: "虚构自定义申请泳道" });
    expect(await client.roleAssignment.count({ where: { projectId: approved.projectId, assignmentStatus: "ACTIVE" } })).toBe(1);
  });

  it("keeps a draft editable after preset retirement but blocks submission until reselection", async () => {
    const created = await gateway.createDraft({ actor: applicantActor, commandId: "retired-template-create", projectName: "虚构预设删除草稿" });
    const saved = await gateway.saveDraft({ actor: applicantActor, commandId: "retired-template-save", projectId: created.projectId, applicationVersionId: created.applicationVersionId, expectedRowVersion: created.rowVersion, form: applicationForm(ids, optionIds) });
    const swimlaneSaved = await gateway.saveSwimlane({ ...command(saved, applicantActor, "retired-template-swimlane"), swimlane: applicationSwimlane(ids, 0) });
    await client.lifecycleTemplate.update({ where: { id: ids.lifecycle }, data: { status: "RETIRED" } });
    try {
      const resaved = await gateway.saveDraft({ actor: applicantActor, commandId: "retired-template-resave", projectId: swimlaneSaved.projectId, applicationVersionId: swimlaneSaved.applicationVersionId, expectedRowVersion: swimlaneSaved.rowVersion, form: { ...applicationForm(ids, optionIds), projectSummary: "删除预设后仍允许保存的虚构项目级内容" } });
      expect(resaved).toMatchObject({ status: "DRAFT" });
      await expect(gateway.submitApplication({ actor: applicantActor, commandId: "retired-template-submit", projectId: resaved.projectId, applicationVersionId: resaved.applicationVersionId, expectedRowVersion: resaved.rowVersion })).rejects.toEqual(new ProjectApplicationError("PROJECT_APPLICATION_TEMPLATE_INVALID"));
    } finally {
      await client.lifecycleTemplate.update({ where: { id: ids.lifecycle }, data: { status: "ACTIVE" } });
    }
  });

  it("rejects every application-swimlane child write after the version is frozen", async () => {
    const saved = await createSavedApplication({
      gateway,
      actor: applicantActor,
      ids,
      optionIds,
      commandPrefix: "frozen-swimlane",
      projectName: "虚构冻结泳道保护项目",
    });
    const submitted = await gateway.submitApplication(
      command(saved, applicantActor, "frozen-swimlane-submit"),
    );
    const stage = await client.projectApplicationSwimlaneStage.findFirstOrThrow({
      where: { applicationVersionId: submitted.applicationVersionId },
    });
    const workflow = await client.projectApplicationSwimlaneWorkflow.findFirstOrThrow({
      where: { applicationVersionId: submitted.applicationVersionId },
    });
    const node = await client.projectApplicationSwimlaneNode.findFirstOrThrow({
      where: { applicationVersionId: submitted.applicationVersionId },
    });
    const role = await client.projectApplicationSwimlaneNodeRole.findFirstOrThrow({
      where: { applicationVersionId: submitted.applicationVersionId },
    });

    for (const write of [
      () => client.projectApplicationSwimlaneStage.update({ where: { id: stage.id }, data: { stageName: "禁止修改" } }),
      () => client.projectApplicationSwimlaneWorkflow.update({ where: { id: workflow.id }, data: { workflowName: "禁止修改" } }),
      () => client.projectApplicationSwimlaneNode.update({ where: { id: node.id }, data: { taskName: "禁止修改" } }),
      () => client.projectApplicationSwimlaneNodeRole.delete({ where: { applicationVersionId_nodeId_roleCode: { applicationVersionId: role.applicationVersionId, nodeId: role.nodeId, roleCode: role.roleCode } } }),
      () => client.projectApplicationSwimlaneDependency.create({ data: { applicationVersionId: submitted.applicationVersionId, predecessorNodeId: node.id, successorNodeId: node.id } }),
    ]) {
      await expect(write()).rejects.toThrow(/frozen application version children are immutable/u);
    }
  });

  it("rejects cross-version node, role, and dependency references", async () => {
    const first = await createSavedApplication({ gateway, actor: applicantActor, ids, optionIds, commandPrefix: "scope-a", projectName: "虚构泳道范围项目甲" });
    const second = await createSavedApplication({ gateway, actor: applicantActor, ids, optionIds, commandPrefix: "scope-b", projectName: "虚构泳道范围项目乙" });
    const firstNode = await client.projectApplicationSwimlaneNode.findFirstOrThrow({ where: { applicationVersionId: first.applicationVersionId } });
    const secondStage = await client.projectApplicationSwimlaneStage.findFirstOrThrow({ where: { applicationVersionId: second.applicationVersionId } });
    const secondWorkflow = await client.projectApplicationSwimlaneWorkflow.findFirstOrThrow({ where: { applicationVersionId: second.applicationVersionId } });
    const secondNode = await client.projectApplicationSwimlaneNode.findFirstOrThrow({ where: { applicationVersionId: second.applicationVersionId } });

    await expect(client.projectApplicationSwimlaneNode.create({ data: {
      applicationVersionId: first.applicationVersionId,
      stageId: secondStage.id,
      workflowId: secondWorkflow.id,
      taskName: "禁止跨版本节点",
      taskDescription: "虚构项目级测试",
      sortOrder: 99,
      applicability: "REQUIRED",
      overdueReminderIntervalDays: 7,
      attachmentRequirement: "NONE",
    } })).rejects.toThrow(/application_swimlane_node_(?:stage|workflow)_fkey/u);
    await expect(client.projectApplicationSwimlaneNodeRole.create({ data: {
      applicationVersionId: first.applicationVersionId,
      nodeId: secondNode.id,
      roleCode: "KEY_SUB_I",
    } })).rejects.toThrow(/application_swimlane_node_role_node_fkey/u);
    await expect(client.projectApplicationSwimlaneDependency.create({ data: {
      applicationVersionId: first.applicationVersionId,
      predecessorNodeId: firstNode.id,
      successorNodeId: secondNode.id,
    } })).rejects.toThrow(/application_swimlane_dependency_successor_fkey/u);
  });

  it("keeps applicant scope in the database query", async () => {
    await client.project.create({
      data: {
        id: ids.formalOnlyProject,
        applicationCode: "APP-9901",
        projectName: "虚构既有正式项目",
        projectSummary: "没有项目申请版本的既有正式项目",
        applicantPersonId: ids.applicant,
        diseaseAreaOptionId: optionIds.DISEASE_AREA,
        researchTypeOptionId: optionIds.RESEARCH_TYPE,
        plannedStartDate: new Date("2026-09-01"),
        plannedEndDate: new Date("2026-09-30"),
      },
    });
    await client.projectPlan.create({ data: { id: ids.formalOnlyPlan, projectId: ids.formalOnlyProject } });
    await client.projectPlanVersion.create({
      data: {
        id: ids.formalOnlyPlanVersion,
        projectPlanId: ids.formalOnlyPlan,
        versionNo: 1,
        templateVersionId: ids.lifecycleVersion,
        status: "ACTIVE",
        createdByPersonId: ids.pmo,
        activatedAt: new Date(),
      },
    });
    await client.roleAssignment.create({
      data: {
        id: ids.formalOnlyAssignment,
        personId: ids.applicant,
        roleCode: "KEY_SUB_I",
        projectId: ids.formalOnlyProject,
        assignmentStatus: "ACTIVE",
        isPrimary: true,
        grantSource: "PMO_ACTION",
        grantedByPersonId: ids.pmo,
        activatedAt: new Date(),
      },
    });
    await client.project.update({
      where: { id: ids.formalOnlyProject },
      data: {
        projectCode: "DEMO-990",
        status: "ACTIVE",
        normalizedNameOccupancy: "虚构既有正式项目",
        establishedByPersonId: ids.pmo,
        establishedAt: new Date(),
      },
    });
    const mine = await gateway.listMyApplications(applicantActor);
    const established = mine.find(({ projectName }) => projectName === "虚构脑健康协作项目");
    expect(established).toBeDefined();
    expect(mine).not.toContainEqual(expect.objectContaining({ projectId: ids.formalOnlyProject }));
    await expect(gateway.listPmoReviewQueue(pmoActor)).resolves.not.toContainEqual(
      expect.objectContaining({ projectId: ids.formalOnlyProject }),
    );
    await expect(gateway.getMyApplicationDetail(otherActor, established!.projectId))
      .resolves.toBeNull();
  });

  it("supports rejection and applicant withdrawal without retaining the name", async () => {
    const rejectedSubmission = await createSubmittedApplication({
      gateway,
      actor: applicantActor,
      ids,
      optionIds,
      commandPrefix: "reject",
      projectName: "虚构拒绝后复用项目",
    });
    const rejected = await gateway.rejectApplication({
      actor: pmoActor,
      commandId: "reject-review",
      projectId: rejectedSubmission.projectId,
      applicationVersionId: rejectedSubmission.applicationVersionId,
      expectedRowVersion: rejectedSubmission.rowVersion,
      reviewId: rejectedSubmission.reviewId!,
      comment: "虚构拒绝原因",
    });
    expect(rejected.status).toBe("REJECTED");

    const replacement = await createSubmittedApplication({
      gateway,
      actor: otherActor,
      ids,
      optionIds,
      commandPrefix: "replacement",
      projectName: " 虚构拒绝后复用项目 ",
    });
    expect(replacement.status).toBe("PENDING_ESTABLISHMENT_REVIEW");

    const withdrawn = await gateway.withdrawApplication({
      actor: otherActor,
      commandId: "replacement-withdraw",
      projectId: replacement.projectId,
      applicationVersionId: replacement.applicationVersionId,
      expectedRowVersion: replacement.rowVersion,
      reviewId: replacement.reviewId,
      reason: "虚构申请人撤回原因",
    });
    expect(withdrawn.status).toBe("CANCELLED");
    const review = await client.projectEstablishmentReview.findUniqueOrThrow({
      where: { id: replacement.reviewId! },
      select: { decision: true },
    });
    expect(review.decision).toBe("WITHDRAWN");
  });

  it("allows the applicant to withdraw an application while PMO review is on hold", async () => {
    const submitted = await createSubmittedApplication({
      gateway,
      actor: applicantActor,
      ids,
      optionIds,
      commandPrefix: "held-withdrawal",
      projectName: "虚构暂缓状态撤回项目",
    });
    const held = await gateway.putOnHold({
      actor: pmoActor,
      commandId: "held-withdrawal-pause",
      projectId: submitted.projectId,
      applicationVersionId: submitted.applicationVersionId,
      expectedRowVersion: submitted.rowVersion,
      reviewId: submitted.reviewId!,
      comment: "虚构暂缓原因",
    });
    const withdrawn = await gateway.withdrawApplication({
      actor: applicantActor,
      commandId: "held-withdrawal-withdraw",
      projectId: held.projectId,
      applicationVersionId: held.applicationVersionId,
      expectedRowVersion: held.rowVersion,
      reviewId: held.reviewId,
      reason: "虚构申请人撤回原因",
    });
    expect(withdrawn.status).toBe("CANCELLED");
  });

  it("allows only one concurrent normalized-name submission", async () => {
    const first = await createSavedApplication({
      gateway,
      actor: applicantActor,
      ids,
      optionIds,
      commandPrefix: "same-name-a",
      projectName: "虚构 同名  并发项目",
    });
    const second = await createSavedApplication({
      gateway,
      actor: otherActor,
      ids,
      optionIds,
      commandPrefix: "same-name-b",
      projectName: "虚构 同名 并发项目",
    });
    const results = await Promise.allSettled([
      gateway.submitApplication(command(first, applicantActor, "same-name-submit-a")),
      gateway.submitApplication(command(second, otherActor, "same-name-submit-b")),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const failure = results.find(({ status }) => status === "rejected");
    expect(failure?.status).toBe("rejected");
    if (failure?.status === "rejected") {
      expect(failure.reason).toBeInstanceOf(ProjectApplicationError);
      expect((failure.reason as ProjectApplicationError).code).toBe(
        "PROJECT_APPLICATION_DUPLICATE_NAME",
      );
    }
  });

  it("serializes concurrent PMO decisions so only one establishment commits", async () => {
    const submitted = await createSubmittedApplication({
      gateway,
      actor: applicantActor,
      ids,
      optionIds,
      commandPrefix: "concurrent-pmo",
      projectName: "虚构并发审核项目",
    });
    const reviewInput = {
      actor: pmoActor,
      projectId: submitted.projectId,
      applicationVersionId: submitted.applicationVersionId,
      expectedRowVersion: submitted.rowVersion,
      reviewId: submitted.reviewId!,
      comment: "虚构并发批准",
    };
    const results = await Promise.allSettled([
      gateway.approveAndEstablish({ ...reviewInput, commandId: "concurrent-pmo-a" }),
      gateway.approveAndEstablish({ ...reviewInput, commandId: "concurrent-pmo-b" }),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const failure = results.find(({ status }) => status === "rejected");
    expect(failure?.status).toBe("rejected");
    if (failure?.status === "rejected") {
      expect(failure.reason).toBeInstanceOf(ProjectApplicationError);
      expect((failure.reason as ProjectApplicationError).code).toBe(
        "PROJECT_APPLICATION_CONFLICT",
      );
    }
    expect(await client.projectPlan.count({ where: { projectId: submitted.projectId } })).toBe(1);
    expect(await client.roleAssignment.count({
      where: { projectId: submitted.projectId, roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE" },
    })).toBe(1);
  });

  it("revalidates a different proposed primary owner and rolls back when eligibility ends", async () => {
    const saved = await createSavedApplication({
      gateway,
      actor: applicantActor,
      ids,
      optionIds,
      commandPrefix: "owner-invalid",
      projectName: "虚构负责人失效项目",
      primaryOwnerPersonId: ids.other,
    });
    const submitted = await gateway.submitApplication(
      command(saved, applicantActor, "owner-invalid-submit"),
    );
    await client.roleEligibility.updateMany({
      where: { personId: ids.other, roleCode: "KEY_SUB_I", status: "ACTIVE" },
      data: { status: "ENDED", endedAt: new Date(), endedByPersonId: ids.pmo },
    });

    await expect(gateway.approveAndEstablish({
      actor: pmoActor,
      commandId: "owner-invalid-approve",
      projectId: submitted.projectId,
      applicationVersionId: submitted.applicationVersionId,
      expectedRowVersion: submitted.rowVersion,
      reviewId: submitted.reviewId!,
      comment: null,
    })).rejects.toMatchObject({ code: "PROJECT_APPLICATION_OWNER_INACTIVE" });
    await expectNoEstablishmentArtifacts(client, submitted.projectId);

    await client.roleEligibility.updateMany({
      where: { personId: ids.other, roleCode: "KEY_SUB_I", status: "ENDED" },
      data: { status: "ACTIVE", endedAt: null, endedByPersonId: null },
    });
  });

  it("resubmits a returned application when the applicant is not the primary owner", async () => {
    const saved = await createSavedApplication({
      gateway,
      actor: applicantActor,
      ids,
      optionIds,
      commandPrefix: "different-primary-return",
      projectName: "虚构非申请人主负责人重提项目",
      primaryOwnerPersonId: ids.other,
    });
    const submitted = await gateway.submitApplication(
      command(saved, applicantActor, "different-primary-return-submit"),
    );
    const returned = await gateway.returnForRevision({
      actor: pmoActor,
      commandId: "different-primary-return-review",
      projectId: submitted.projectId,
      applicationVersionId: submitted.applicationVersionId,
      expectedRowVersion: submitted.rowVersion,
      reviewId: submitted.reviewId!,
      comment: "虚构退回补充要求",
    });
    const returnedForm = applicationForm(ids, optionIds, ids.other);
    returnedForm.projectName = "虚构非申请人主负责人重提项目";
    const resaved = await gateway.saveDraft({
      ...command(returned, applicantActor, "different-primary-return-save-2"),
      form: returnedForm,
    });
    const resubmitted = await gateway.submitApplication(
      command(resaved, applicantActor, "different-primary-return-submit-2"),
    );
    expect(resubmitted).toMatchObject({
      status: "PENDING_ESTABLISHMENT_REVIEW",
      applicationVersionNo: 2,
      reviewSubmissionNo: 2,
    });
  });

  it("lets the applicant open pre-establishment application messages without granting formal project access", async () => {
    const submitted = await createSubmittedApplication({
      gateway,
      actor: applicantActor,
      ids,
      optionIds,
      commandPrefix: "notification-navigation",
      projectName: "虚构申请消息跳转项目",
    });
    const notifications = new PrismaNotificationRepository(client);

    const pmoMessage = (await notifications.listForRecipient(pmoActor)).items.find(
      (item) => item.projectId === submitted.projectId && item.eventCode === "PROJECT_APPLICATION_SUBMITTED",
    );
    expect(pmoMessage?.navigation).toEqual({
      kind: "PROJECT_APPLICATION",
      projectId: submitted.projectId,
      perspective: "PMO_REVIEW",
    });

    const returned = await gateway.returnForRevision({
      actor: pmoActor,
      commandId: "notification-navigation-return",
      projectId: submitted.projectId,
      applicationVersionId: submitted.applicationVersionId,
      expectedRowVersion: submitted.rowVersion,
      reviewId: submitted.reviewId!,
      comment: "虚构退回说明",
    });
    expect(await client.roleAssignment.count({ where: { projectId: submitted.projectId } })).toBe(0);

    const applicantMessage = (await notifications.listForRecipient(applicantActor)).items.find(
      (item) => item.projectId === submitted.projectId && item.eventCode === "PROJECT_APPLICATION_RETURNED",
    );
    expect(applicantMessage).toMatchObject({
      readStatus: "UNREAD",
      navigation: {
        kind: "PROJECT_APPLICATION",
        projectId: returned.projectId,
        perspective: "APPLICANT",
      },
    });
    await expect(notifications.open(applicantActor, applicantMessage!.id)).resolves.toEqual({
      kind: "PROJECT_APPLICATION",
      projectId: returned.projectId,
      perspective: "APPLICANT",
    });
    await expect(client.notification.findUniqueOrThrow({
      where: { id: applicantMessage!.id },
      select: { readStatus: true, readAt: true },
    })).resolves.toMatchObject({ readStatus: "READ", readAt: expect.any(Date) });
    expect((await notifications.listForRecipient(otherActor)).items.some((item) => item.id === applicantMessage!.id)).toBe(false);
  });

  it("rolls back late establishment writes when notification persistence fails", async () => {
    const submitted = await createSubmittedApplication({
      gateway,
      actor: applicantActor,
      ids,
      optionIds,
      commandPrefix: "late-failure",
      projectName: "虚构建档回滚项目",
    });
    await client.notification.create({
      data: {
        recipientPersonId: ids.applicant,
        recipientRoleCode: "KEY_SUB_I",
        notificationType: "PROJECT_REVIEW_NOTICE",
        eventCode: "PROJECT_APPLICATION_APPROVED",
        triggeredByPersonId: ids.pmo,
        triggeredByRoleCode: "PMO",
        projectId: submitted.projectId,
        projectEstablishmentReviewId: submitted.reviewId,
        title: "虚构冲突通知",
        content: "用于验证事务回滚",
        eventKey: `${submitted.projectId}:${submitted.reviewId}:APPROVED`,
      },
    });

    await expect(gateway.approveAndEstablish({
      actor: pmoActor,
      commandId: "late-failure-approve",
      projectId: submitted.projectId,
      applicationVersionId: submitted.applicationVersionId,
      expectedRowVersion: submitted.rowVersion,
      reviewId: submitted.reviewId!,
      comment: "虚构批准说明",
    })).rejects.toBeTruthy();
    await expectNoEstablishmentArtifacts(client, submitted.projectId);
    expect(await client.projectApplicationActivity.count({
      where: { projectId: submitted.projectId, activityType: "APPROVED" },
    })).toBe(0);
    expect(await client.auditLog.count({
      where: { projectId: submitted.projectId, actionCode: "PROJECT_APPLICATION_APPROVED" },
    })).toBe(0);
    expect(await client.projectApplicationCommand.count({
      where: { projectId: submitted.projectId, actionCode: "APPROVE_AND_ESTABLISH" },
    })).toBe(0);
  });
});

function applicationForm(
  ids: Record<string, string>,
  optionIds: Record<string, string>,
  primaryOwnerPersonId = ids.applicant!,
): ApplicationFormInput {
  const owners = primaryOwnerPersonId === ids.applicant
    ? [{ personId: ids.applicant!, isPrimary: true, sortOrder: 0 }]
    : [
        { personId: ids.applicant!, isPrimary: false, sortOrder: 0 },
        { personId: primaryOwnerPersonId, isPrimary: true, sortOrder: 1 },
      ];
  return {
    projectName: "虚构脑健康协作项目",
    projectSummary: "仅用于项目级集成测试，不含人员明细。",
    directionOptionId: optionIds.DISEASE_AREA!,
    directionOtherText: null,
    researchTypeOptionId: optionIds.RESEARCH_TYPE!,
    researchTypeOtherText: null,
    fundingRecordAmountCny: "120000.00",
    owners,
  };
}

function applicationSwimlane(ids: Record<string, string>, expectedRevision: number) {
  return {
    name: "虚构项目模板",
    expectedRevision,
    sourceTemplateVersionId: ids.lifecycleVersion!,
    stages: [{ id: ids.stage!, code: "START", name: "启动", sortOrder: 0, applicability: "REQUIRED" as const, plannedStartDate: null, plannedEndDate: "2026-09-30" }],
    workflows: [{ id: ids.workflow!, code: "PREPARE", name: "准备", description: "虚构工作流", sortOrder: 0, enabled: true }],
    nodes: [{ id: ids.workflowStage!, workflowId: ids.workflow!, stageId: ids.stage!, taskName: "完成准备", taskDescription: "虚构任务", sortOrder: 0, applicability: "REQUIRED" as const, plannedStartDate: null, plannedEndDate: null, updateIntervalDays: null, overdueReminderIntervalDays: 7, attachmentRequirement: "NONE" as const, ownerRoles: ["KEY_SUB_I" as const], predecessorIds: [] }],
  };
}

function expandedApplicationSwimlane(ids: Record<string, string>, expectedRevision: number) {
  const base = applicationSwimlane(ids, expectedRevision);
  const stageId = "a7000000-0000-4000-8000-000000000001";
  const workflowId = "a7000000-0000-4000-8000-000000000002";
  const nodeId = "a7000000-0000-4000-8000-000000000003";
  return {
    ...base,
    name: "虚构自定义申请泳道",
    stages: [...base.stages, { id: stageId, code: "CUSTOM_REVIEW", name: "自定义复核", sortOrder: 1, applicability: "REQUIRED" as const, plannedStartDate: "2026-10-01", plannedEndDate: "2026-10-31" }],
    workflows: [...base.workflows, { id: workflowId, code: "CUSTOM_GOVERNANCE", name: "自定义治理", description: "申请人增加的虚构工作流", sortOrder: 1, enabled: true }],
    nodes: [...base.nodes, { id: nodeId, workflowId, stageId, taskName: "完成自定义复核", taskDescription: "申请人增加的虚构节点", sortOrder: 0, applicability: "REQUIRED" as const, plannedStartDate: "2026-10-01", plannedEndDate: "2026-10-20", updateIntervalDays: 14, overdueReminderIntervalDays: 3, attachmentRequirement: "OPTIONAL" as const, ownerRoles: ["PMO" as const, "KEY_SUB_I" as const], predecessorIds: [ids.workflowStage!] }],
  };
}

async function createSavedApplication(input: {
  gateway: PrismaProjectApplicationGateway;
  actor: ProjectApplicationActor;
  ids: Record<string, string>;
  optionIds: Record<string, string>;
  commandPrefix: string;
  projectName: string;
  primaryOwnerPersonId?: string;
}) {
  const created = await input.gateway.createDraft({
    actor: input.actor,
    commandId: `${input.commandPrefix}-create`,
    projectName: input.projectName,
  });
  const form = applicationForm(
    { ...input.ids, applicant: input.actor.personId },
    input.optionIds,
    input.primaryOwnerPersonId ?? input.actor.personId,
  );
  form.projectName = input.projectName;
  const saved = await input.gateway.saveDraft({
    ...command(created, input.actor, `${input.commandPrefix}-save`),
    form,
  });
  return input.gateway.saveSwimlane({
    ...command(saved, input.actor, `${input.commandPrefix}-swimlane`),
    swimlane: applicationSwimlane(input.ids, 0),
  });
}

async function createSubmittedApplication(
  input: Parameters<typeof createSavedApplication>[0],
) {
  const saved = await createSavedApplication(input);
  return input.gateway.submitApplication(
    command(saved, input.actor, `${input.commandPrefix}-submit`),
  );
}

function command(
  snapshot: ProjectApplicationSnapshot,
  actor: ProjectApplicationActor,
  commandId: string,
) {
  return {
    actor,
    commandId,
    projectId: snapshot.projectId,
    applicationVersionId: snapshot.applicationVersionId,
    expectedRowVersion: snapshot.rowVersion,
  };
}

async function expectNoEstablishmentArtifacts(
  client: ApplicationPrismaClient,
  projectId: string,
) {
  const project = await client.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { status: true, projectCode: true, establishedAt: true },
  });
  expect(project).toEqual({
    status: "PENDING_ESTABLISHMENT_REVIEW",
    projectCode: null,
    establishedAt: null,
  });
  expect(await client.projectPlan.count({ where: { projectId } })).toBe(0);
  expect(await client.roleAssignment.count({ where: { projectId } })).toBe(0);
}

async function resetFixtureData(client: ApplicationPrismaClient) {
  await client.$executeRaw`
    TRUNCATE TABLE "person", "dictionary", "lifecycle_template", "project" CASCADE
  `;
}

async function seedFixture(client: ApplicationPrismaClient, ids: Record<string, string>) {
  await client.person.createMany({
    data: [
      { id: ids.pmo!, displayName: "虚构 PMO", loginName: "project-test-pmo", accountStatus: "ACTIVE", mustChangePassword: false },
      { id: ids.applicant!, displayName: "虚构申请人", loginName: "project-test-applicant", accountStatus: "ACTIVE", mustChangePassword: false },
      { id: ids.other!, displayName: "虚构其他人员", loginName: "project-test-other", accountStatus: "ACTIVE", mustChangePassword: false },
    ],
  });
  await client.roleAssignment.create({
    data: { personId: ids.pmo!, roleCode: "PMO", projectId: null, assignmentStatus: "ACTIVE", isPrimary: false, grantSource: "PMO_ACTION", grantedByPersonId: ids.pmo!, activatedAt: new Date() },
  });
  await client.roleEligibility.createMany({
    data: [ids.applicant!, ids.other!].map((personId) => ({
      personId,
      roleCode: "KEY_SUB_I" as const,
      status: "ACTIVE" as const,
      grantedByPersonId: ids.pmo!,
      reason: "虚构项目申请资格",
    })),
  });
  await client.session.createMany({
    data: [
      { id: ids.pmoSession!, personId: ids.pmo!, tokenHash: "project-test-pmo-token", activeRoleCode: "PMO", expiresAt: new Date("2099-01-01T00:00:00.000Z") },
      { id: ids.applicantSession!, personId: ids.applicant!, tokenHash: "project-test-applicant-token", activeRoleCode: "KEY_SUB_I", expiresAt: new Date("2099-01-01T00:00:00.000Z") },
      { id: ids.otherSession!, personId: ids.other!, tokenHash: "project-test-other-token", activeRoleCode: "KEY_SUB_I", expiresAt: new Date("2099-01-01T00:00:00.000Z") },
    ],
  });
  const optionIds: Record<string, string> = {};
  for (const [index, code] of ["DISEASE_AREA", "RESEARCH_TYPE"].entries()) {
    const dictionaryId = `a4000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const optionId = `a5000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    optionIds[code] = optionId;
    await client.dictionary.create({
      data: { id: dictionaryId, dictionaryCode: code, dictionaryName: `虚构 ${code}`, description: "集成测试", options: { create: { id: optionId, optionCode: "VIRTUAL", displayName: "虚构选项" } } },
    });
  }
  await client.lifecycleTemplate.create({
    data: {
      id: ids.lifecycle!,
      templateCode: "PROJECT_TEST",
      templateName: "虚构项目模板",
      status: "ACTIVE",
      versions: {
        create: {
          id: ids.lifecycleVersion!,
          versionNo: 1,
          status: "PUBLISHED",
          publishedByPersonId: ids.pmo!,
          publishedAt: new Date(),
          stageTemplates: { create: { id: ids.stage!, stageCode: "START", stageName: "启动", sortOrder: 0 } },
          workflowTemplates: {
            create: {
              id: ids.workflow!,
              workflowCode: "PREPARE",
              workflowName: "准备",
              description: "虚构工作流",
              workflowStageTemplates: { create: { id: ids.workflowStage!, templateVersionId: ids.lifecycleVersion!, stageTemplateId: ids.stage!, sortOrder: 0, defaultTask: "完成准备", defaultOwnerRole: "KEY_SUB_I" } },
            },
          },
        },
      },
    },
  });
  return optionIds;
}
