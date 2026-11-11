import { randomUUID } from "node:crypto";

import {
  containsProhibitedPatientData,
  normalizeProjectName,
  ProjectApplicationError,
  validateSubmission,
  validateApplicationSwimlane,
  type ApplicationFormInput,
  type ApplicationSwimlaneInput,
  type ExistingApplicationCommandInput,
  type PmoReviewCommandInput,
  type ProjectApplicationActor,
  type ProjectApplicationDetail,
  type ProjectApplicationGateway,
  type ProjectApplicationListItem,
  type ProjectApplicationFormOptions,
  type ProjectApplicationSnapshot,
  type SaveDraftInput,
  type SaveApplicationSwimlaneInput,
  type WithdrawApplicationInput,
} from "@researchflow/project-application";

import type { Prisma } from "../generated/client.js";
import type { ApplicationPrismaClient } from "./client.js";

type Transaction = Prisma.TransactionClient;

export class PrismaProjectApplicationGateway implements ProjectApplicationGateway {
  constructor(private readonly client: ApplicationPrismaClient) {}

  createDraft(input: {
    actor: ProjectApplicationActor;
    commandId: string;
    projectName: string;
    projectSummary?: string | null;
  }): Promise<ProjectApplicationSnapshot> {
    return this.run(async (transaction) => {
      await authorizeActor(transaction, input.actor, "KEY_SUB_I", true);
      const duplicate = await findIdempotentSnapshot(transaction, input.actor, input.commandId);
      if (duplicate) return duplicate;
      rejectPatientData([input.projectName, input.projectSummary]);

      const applicationCode = await nextBusinessCode(
        transaction,
        "project_application_code_sequence",
        "APP-",
        4,
      );
      const projectId = randomUUID();
      const versionId = randomUUID();
      const project = await transaction.project.create({
        data: {
          id: projectId,
          applicationCode,
          projectName: input.projectName.trim(),
          projectSummary: input.projectSummary?.trim() || null,
          applicantPersonId: input.actor.personId,
          status: "DRAFT",
        },
      });
      await transaction.projectApplicationVersion.create({
        data: {
          id: versionId,
          projectId,
          versionNo: 1,
          versionStatus: "EDITABLE",
          projectName: project.projectName,
          projectSummary: project.projectSummary,
          createdByPersonId: input.actor.personId,
        },
      });
      await transaction.project.update({
        where: { id: projectId },
        data: { currentApplicationVersionId: versionId },
      });
      const activity = await appendActivity(transaction, {
        projectId,
        applicationVersionId: versionId,
        reviewId: null,
        activityType: "DRAFT_CREATED",
        actor: input.actor,
        content: null,
      });
      await appendAudit(transaction, input.actor, input.commandId, {
        actionCode: "PROJECT_APPLICATION_DRAFT_CREATED",
        projectId,
        entityId: versionId,
        entityBusinessCode: applicationCode,
        summary: "创建项目申请草稿",
        changedFields: ["project_name"],
      });
      await recordCommand(transaction, input.actor, input.commandId, {
        actionCode: "CREATE_DRAFT",
        projectId,
        applicationVersionId: versionId,
        reviewId: null,
        resultCode: "SUCCESS",
        resultEntityId: activity.id,
      });
      return readSnapshot(transaction, projectId);
    });
  }

  saveDraft(input: SaveDraftInput): Promise<ProjectApplicationSnapshot> {
    return this.run(async (transaction) => {
      await authorizeActor(transaction, input.actor, "KEY_SUB_I", true);
      const duplicate = await findIdempotentSnapshot(transaction, input.actor, input.commandId);
      if (duplicate) return duplicate;
      const project = await lockApplicantApplication(transaction, input);
      if (!isEditableStatus(project.status)) invalidState();
      const version = requireCurrentEditableVersion(project, input.applicationVersionId);
      rejectPatientData(formText(input.form));

      await replaceEditableVersion(transaction, version.id, input.form);
      const updated = await transaction.project.updateMany({
        where: { id: project.id, rowVersion: input.expectedRowVersion },
        data: {
          projectName: input.form.projectName.trim(),
          projectSummary: input.form.projectSummary?.trim() || null,
          rowVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) conflict();
      const activity = await appendActivity(transaction, {
        projectId: project.id,
        applicationVersionId: version.id,
        reviewId: null,
        activityType: "DRAFT_SAVED",
        actor: input.actor,
        content: null,
      });
      await appendAudit(transaction, input.actor, input.commandId, {
        actionCode: "PROJECT_APPLICATION_DRAFT_SAVED",
        projectId: project.id,
        entityId: version.id,
        entityBusinessCode: project.applicationCode,
        summary: "保存项目申请草稿",
        changedFields: ["application_version"],
      });
      await recordCommand(transaction, input.actor, input.commandId, {
        actionCode: "SAVE_DRAFT",
        projectId: project.id,
        applicationVersionId: version.id,
        reviewId: null,
        resultCode: "SUCCESS",
        resultEntityId: activity.id,
      });
      return readSnapshot(transaction, project.id);
    });
  }

  saveSwimlane(input: SaveApplicationSwimlaneInput): Promise<ProjectApplicationSnapshot> {
    return this.run(async (transaction) => {
      await authorizeActor(transaction, input.actor, "KEY_SUB_I", true);
      const duplicate = await findIdempotentSnapshot(transaction, input.actor, input.commandId);
      if (duplicate) return duplicate;
      if (!validateApplicationSwimlane(input.swimlane)) {
        throw new ProjectApplicationError("PROJECT_APPLICATION_SWIMLANE_INVALID");
      }
      const project = await lockApplicantApplication(transaction, input);
      if (!isEditableStatus(project.status)) invalidState();
      const version = requireCurrentEditableVersion(project, input.applicationVersionId);
      await replaceApplicationSwimlane(transaction, version.id, input.swimlane);
      const updated = await transaction.project.updateMany({
        where: { id: project.id, rowVersion: input.expectedRowVersion },
        data: { rowVersion: { increment: 1 } },
      });
      if (updated.count !== 1) conflict();
      const activity = await appendActivity(transaction, {
        projectId: project.id,
        applicationVersionId: version.id,
        reviewId: null,
        activityType: "SWIMLANE_MODIFIED",
        actor: input.actor,
        content: null,
      });
      await appendAudit(transaction, input.actor, input.commandId, {
        actionCode: "PROJECT_APPLICATION_SWIMLANE_MODIFIED",
        projectId: project.id,
        entityId: version.id,
        entityBusinessCode: project.applicationCode,
        summary: "修改项目申请泳道",
        changedFields: ["application_swimlane"],
      });
      await recordCommand(transaction, input.actor, input.commandId, {
        actionCode: "SAVE_SWIMLANE",
        projectId: project.id,
        applicationVersionId: version.id,
        reviewId: null,
        resultCode: "SUCCESS",
        resultEntityId: activity.id,
      });
      return readSnapshot(transaction, project.id);
    });
  }

  submitApplication(input: ExistingApplicationCommandInput): Promise<ProjectApplicationSnapshot> {
    return this.run(async (transaction) => {
      await authorizeActor(transaction, input.actor, "KEY_SUB_I", true);
      const duplicate = await findIdempotentSnapshot(transaction, input.actor, input.commandId);
      if (duplicate) return duplicate;
      const project = await lockApplicantApplication(transaction, input);
      if (!isEditableStatus(project.status)) invalidState();
      const version = requireCurrentEditableVersion(project, input.applicationVersionId);
      const submission = await loadSubmissionForValidation(transaction, project.id, version.id);
      const errors = validateSubmission(submission.validation);
      if (errors.length > 0) throw new ProjectApplicationError(errors[0]);
      rejectPatientData(formText(submission.form));

      const normalizedName = normalizeProjectName(version.projectName);
      const submissionNo = (project.establishmentReviews[0]?.submissionNo ?? 0) + 1;
      const review = await transaction.projectEstablishmentReview.create({
        data: {
          projectId: project.id,
          applicationVersionId: version.id,
          submissionNo,
          submittedByPersonId: input.actor.personId,
          submittedAt: new Date(),
          decision: "PENDING",
        },
      });
      await transaction.project.update({
        where: { id: project.id },
        data: {
          status: "PENDING_ESTABLISHMENT_REVIEW",
          normalizedNameOccupancy: normalizedName,
          rowVersion: { increment: 1 },
        },
      });
      await transaction.projectApplicationVersion.update({
        where: { id: version.id },
        data: { versionStatus: "FROZEN", frozenAt: new Date() },
      });
      await registerApplicationDictionarySuggestions(
        transaction,
        version.id,
        input.actor.personId,
        submission.validation,
      );
      const activityType = project.status === "DRAFT" ? "SUBMITTED" : "RESUBMITTED";
      const activity = await appendActivity(transaction, {
        projectId: project.id,
        applicationVersionId: version.id,
        reviewId: review.id,
        activityType,
        actor: input.actor,
        content: null,
      });
      await notifyActivePmos(transaction, input.actor, project, review.id, activityType);
      await appendAudit(transaction, input.actor, input.commandId, {
        actionCode: `PROJECT_APPLICATION_${activityType}`,
        projectId: project.id,
        entityId: review.id,
        entityBusinessCode: project.applicationCode,
        summary: activityType === "SUBMITTED" ? "提交项目申请" : "重新提交项目申请",
        changedFields: ["status", "application_version", "review"],
      });
      await recordCommand(transaction, input.actor, input.commandId, {
        actionCode: activityType,
        projectId: project.id,
        applicationVersionId: version.id,
        reviewId: review.id,
        resultCode: "SUCCESS",
        resultEntityId: activity.id,
      });
      return readSnapshot(transaction, project.id);
    });
  }

  withdrawApplication(input: WithdrawApplicationInput): Promise<ProjectApplicationSnapshot> {
    return this.run(async (transaction) => {
      await authorizeActor(transaction, input.actor, "KEY_SUB_I", true);
      const duplicate = await findIdempotentSnapshot(transaction, input.actor, input.commandId);
      if (duplicate) return duplicate;
      const project = await lockApplicantApplication(transaction, input);
      if (!isWithdrawableStatus(project.status)) invalidState();
      if (project.status !== "DRAFT" && !input.reason?.trim()) validationFailed();
      const version = requireCurrentVersion(project, input.applicationVersionId);
      const openReview = project.establishmentReviews.find((review) =>
        review.decision === "PENDING" || review.decision === "PAUSED"
      );
      if (openReview) {
        if (input.reviewId !== openReview.id) conflict();
        await transaction.projectEstablishmentReview.update({
          where: { id: openReview.id },
          data: {
            decision: "WITHDRAWN",
            decidedByPersonId: input.actor.personId,
            decidedByRoleCode: "KEY_SUB_I",
            decidedAt: new Date(),
            decisionComment: input.reason?.trim() || null,
          },
        });
      }
      await transaction.project.update({
        where: { id: project.id },
        data: {
          status: "CANCELLED",
          normalizedNameOccupancy: null,
          cancelledAt: new Date(),
          cancellationReason: input.reason?.trim() || "申请人放弃草稿",
          cancelledByPersonId: input.actor.personId,
          rowVersion: { increment: 1 },
        },
      });
      const activity = await appendActivity(transaction, {
        projectId: project.id,
        applicationVersionId: version.id,
        reviewId: openReview?.id ?? null,
        activityType: "WITHDRAWN",
        actor: input.actor,
        content: input.reason?.trim() || null,
      });
      if (project.status !== "DRAFT") {
        await notifyActivePmos(transaction, input.actor, project, openReview?.id ?? null, "WITHDRAWN");
      }
      await appendAudit(transaction, input.actor, input.commandId, {
        actionCode: "PROJECT_APPLICATION_WITHDRAWN",
        projectId: project.id,
        entityId: activity.id,
        entityBusinessCode: project.applicationCode,
        summary: "撤回项目申请",
        changedFields: ["status", "cancellation_reason"],
      });
      await recordCommand(transaction, input.actor, input.commandId, {
        actionCode: "WITHDRAW",
        projectId: project.id,
        applicationVersionId: version.id,
        reviewId: openReview?.id ?? null,
        resultCode: "SUCCESS",
        resultEntityId: activity.id,
      });
      return readSnapshot(transaction, project.id);
    });
  }

  returnForRevision(input: PmoReviewCommandInput): Promise<ProjectApplicationSnapshot> {
    return this.reviewAction(input, "RETURNED");
  }

  putOnHold(input: PmoReviewCommandInput): Promise<ProjectApplicationSnapshot> {
    return this.reviewAction(input, "PAUSED");
  }

  resumeReview(input: PmoReviewCommandInput): Promise<ProjectApplicationSnapshot> {
    return this.reviewAction(input, "RESUMED");
  }

  rejectApplication(input: PmoReviewCommandInput): Promise<ProjectApplicationSnapshot> {
    return this.reviewAction(input, "REJECTED");
  }

  approveAndEstablish(input: PmoReviewCommandInput): Promise<ProjectApplicationSnapshot> {
    return this.reviewAction(input, "APPROVED");
  }

  async listMyApplications(actor: ProjectApplicationActor): Promise<ProjectApplicationListItem[]> {
    return this.readList(actor, false);
  }

  async listPmoReviewQueue(actor: ProjectApplicationActor): Promise<ProjectApplicationListItem[]> {
    return this.readList(actor, true);
  }

  getMyApplicationDetail(actor: ProjectApplicationActor, projectId: string): Promise<ProjectApplicationDetail | null> {
    return this.readDetail(actor, projectId, false);
  }

  getPmoApplicationDetail(actor: ProjectApplicationActor, projectId: string): Promise<ProjectApplicationDetail | null> {
    return this.readDetail(actor, projectId, true);
  }

  getFormOptions(actor: ProjectApplicationActor): Promise<ProjectApplicationFormOptions> {
    return this.client.$transaction(async (transaction) => {
      await authorizeActor(transaction, actor, "KEY_SUB_I", true);
      const people = await transaction.person.findMany({
          where: {
            accountStatus: "ACTIVE",
            OR: [
              { roleEligibilities: { some: { roleCode: "KEY_SUB_I", status: "ACTIVE" } } },
              { roleAssignments: { some: { roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE" } } },
            ],
          },
          orderBy: { displayName: "asc" },
          select: { id: true, displayName: true },
        });
      const directions = await listDictionaryOptions(transaction, "DISEASE_AREA");
      const researchTypes = await listDictionaryOptions(transaction, "RESEARCH_TYPE");
      const lifecycleTemplates = await transaction.lifecycleTemplateVersion.findMany({
          where: { status: "PUBLISHED", lifecycleTemplate: { status: "ACTIVE" } },
          orderBy: [{ lifecycleTemplate: { templateName: "asc" } }, { versionNo: "desc" }],
          select: {
            id: true,
            versionNo: true,
            lifecycleTemplate: { select: { id: true, templateName: true } },
            stageTemplates: {
              orderBy: { sortOrder: "asc" },
              select: { id: true, stageCode: true, stageName: true, sortOrder: true, defaultApplicability: true },
            },
            workflowTemplates: {
              where: { enabled: true },
              orderBy: [{ workflowName: "asc" }, { id: "asc" }],
              select: { id: true, workflowCode: true, workflowName: true, description: true, enabled: true },
            },
            workflowStageTemplates: {
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              select: {
                id: true,
                workflowTemplateId: true,
                stageTemplateId: true,
                defaultTask: true,
                defaultApplicability: true,
                defaultOwnerRole: true,
                defaultAttachmentRequirement: true,
                sortOrder: true,
                successorDependencies: { select: { predecessorWorkflowStageTemplateId: true } },
              },
            },
          },
        });
      const latestTemplates = lifecycleTemplates.filter((template, index) =>
        lifecycleTemplates.findIndex((candidate) => candidate.lifecycleTemplate.id === template.lifecycleTemplate.id) === index,
      );
      return {
        people,
        directions,
        researchTypes,
        lifecycleTemplates: latestTemplates.map((template) => ({
          id: template.id,
          displayName: template.lifecycleTemplate.templateName,
          description: template.workflowTemplates.map(({ description }) => description).filter(Boolean).join("；"),
          stages: template.stageTemplates.map((stage) => ({
            id: stage.id,
            code: stage.stageCode,
            displayName: stage.stageName,
            sortOrder: stage.sortOrder,
            applicability: stage.defaultApplicability,
          })),
          workflows: template.workflowTemplates.map((workflow, index) => ({
            id: workflow.id,
            code: workflow.workflowCode,
            displayName: workflow.workflowName,
            description: workflow.description,
            sortOrder: index + 1,
            enabled: workflow.enabled,
          })),
          nodes: template.workflowStageTemplates.map((node) => ({
            id: node.id,
            workflowId: node.workflowTemplateId,
            stageId: node.stageTemplateId,
            displayName: node.defaultTask,
            applicability: node.defaultApplicability,
            predecessorIds: node.successorDependencies.map(({ predecessorWorkflowStageTemplateId }) => predecessorWorkflowStageTemplateId),
            sortOrder: node.sortOrder,
            ownerRoles: node.defaultOwnerRole === "DEAN" ? [] : [node.defaultOwnerRole],
            attachmentRequirement: node.defaultAttachmentRequirement,
          })),
        })),
      };
    });
  }

  private reviewAction(
    input: PmoReviewCommandInput,
    action: "RETURNED" | "PAUSED" | "RESUMED" | "REJECTED" | "APPROVED",
  ): Promise<ProjectApplicationSnapshot> {
    return this.run(async (transaction) => {
      await authorizeActor(transaction, input.actor, "PMO", false);
      const duplicate = await findIdempotentSnapshot(transaction, input.actor, input.commandId);
      if (duplicate) return duplicate;
      const project = await lockPmoApplication(transaction, input);
      const review = project.establishmentReviews[0];
      if (!review || review.id !== input.reviewId) conflict();
      const version = requireCurrentVersion(project, input.applicationVersionId);

      if (action === "RETURNED") return executeReturn(transaction, input, project, version, review);
      if (action === "PAUSED") return executePause(transaction, input, project, version, review);
      if (action === "RESUMED") return executeResume(transaction, input, project, version, review);
      if (action === "REJECTED") return executeReject(transaction, input, project, version, review);
      return executeApproval(transaction, input, project, version, review);
    });
  }

  private async readList(actor: ProjectApplicationActor, pmo: boolean) {
    return this.client.$transaction(async (transaction) => {
      await authorizeActor(transaction, actor, pmo ? "PMO" : "KEY_SUB_I", !pmo);
      const projects = await transaction.project.findMany({
        where: {
          currentApplicationVersionId: { not: null },
          ...(pmo ? {} : { applicantPersonId: actor.personId }),
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        include: listInclude,
      });
      return projects.map(mapListItem);
    });
  }

  private async readDetail(actor: ProjectApplicationActor, projectId: string, pmo: boolean) {
    return this.client.$transaction(async (transaction) => {
      await authorizeActor(transaction, actor, pmo ? "PMO" : "KEY_SUB_I", !pmo);
      const project = await transaction.project.findFirst({
        where: { id: projectId, ...(pmo ? {} : { applicantPersonId: actor.personId }) },
        include: detailInclude,
      });
      if (!project) return null;
      const projectAccess = await hasEstablishedProjectAccess(transaction, actor, projectId);
      return mapDetail(project, projectAccess);
    });
  }

  private async run<T>(operation: (transaction: Transaction) => Promise<T>): Promise<T> {
    try {
      return await this.client.$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (error instanceof ProjectApplicationError) throw error;
      const details = databaseErrorDetails(error);
      if (details.includes("project_normalized_name_occupancy_key")) {
        throw new ProjectApplicationError("PROJECT_APPLICATION_DUPLICATE_NAME", { cause: error });
      }
      if (
        details.includes("could not serialize") ||
        /\b(?:40001|P2034)\b/u.test(details)
      ) {
        throw new ProjectApplicationError("PROJECT_APPLICATION_CONFLICT", { cause: error });
      }
      throw error;
    }
  }
}

function databaseErrorDetails(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const prismaError = error as Error & {
    code?: unknown;
    meta?: {
      driverAdapterError?: {
        cause?: { originalMessage?: unknown };
      };
    };
  };
  return [
    prismaError.message,
    String(prismaError.code ?? ""),
    String(prismaError.meta?.driverAdapterError?.cause?.originalMessage ?? ""),
  ].join("\n");
}

async function listDictionaryOptions(transaction: Transaction, dictionaryCode: string) {
  return transaction.dictionaryOption.findMany({
    where: { dictionaryCode, enabled: true, dictionary: { enabled: true } },
    orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
    select: { id: true, optionCode: true, displayName: true },
  });
}

const commandInclude = {
  currentApplicationVersion: true,
  establishmentReviews: { orderBy: { submissionNo: "desc" as const } },
} satisfies Prisma.ProjectInclude;

type CommandProject = Prisma.ProjectGetPayload<{ include: typeof commandInclude }>;

const listInclude = {
  applicant: { select: { displayName: true } },
  currentApplicationVersion: {
    include: {
      owners: {
        where: { isPrimary: true },
        include: { person: { select: { displayName: true } } },
      },
    },
  },
  establishmentReviews: { orderBy: { submissionNo: "desc" as const }, take: 1 },
} satisfies Prisma.ProjectInclude;

type ListProject = Prisma.ProjectGetPayload<{ include: typeof listInclude }>;

const detailInclude = {
  ...listInclude,
  currentApplicationVersion: {
    include: {
      owners: {
        orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
        include: { person: { select: { displayName: true } } },
      },
      swimlaneStages: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] },
      swimlaneWorkflows: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] },
      swimlaneNodes: {
        orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
        include: {
          ownerRoles: { orderBy: [{ sortOrder: "asc" as const }, { roleCode: "asc" as const }] },
          successorDependencies: { select: { predecessorNodeId: true } },
        },
      },
      diseaseAreaOption: { select: { optionCode: true } },
      researchTypeOption: { select: { optionCode: true } },
      lifecycleTemplateVersion: {
        include: {
          lifecycleTemplate: { select: { templateName: true } },
        },
      },
    },
  },
  applicationActivities: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    include: { actor: { select: { displayName: true } } },
  },
} satisfies Prisma.ProjectInclude;

type DetailProject = Prisma.ProjectGetPayload<{ include: typeof detailInclude }>;

async function authorizeActor(
  transaction: Transaction,
  actor: ProjectApplicationActor,
  requiredRole: "KEY_SUB_I" | "PMO",
  requireEligibility: boolean,
): Promise<void> {
  const sessions = await transaction.$queryRaw<Array<{
    personId: string;
    activeRoleCode: string | null;
    accountStatus: string;
    revokedAt: Date | null;
    expiresAt: Date;
  }>>`
    SELECT session."person_id" AS "personId",
           session."active_role_code"::text AS "activeRoleCode",
           person."account_status"::text AS "accountStatus",
           session."revoked_at" AS "revokedAt",
           session."expires_at" AS "expiresAt"
    FROM "session"
    JOIN "person" ON person."id" = session."person_id"
    WHERE session."id" = ${actor.sessionId}::uuid
      AND session."person_id" = ${actor.personId}::uuid
    FOR UPDATE OF session
  `;
  const session = sessions[0];
  if (
    !session ||
    session.activeRoleCode !== requiredRole ||
    session.accountStatus !== "ACTIVE" ||
    session.revokedAt !== null ||
    session.expiresAt <= new Date()
  ) {
    throw new ProjectApplicationError("PROJECT_APPLICATION_FORBIDDEN");
  }
  if (requiredRole === "PMO") {
    const count = await transaction.roleAssignment.count({
      where: {
        personId: actor.personId,
        roleCode: "PMO",
        projectId: null,
        assignmentStatus: "ACTIVE",
      },
    });
    if (count !== 1) throw new ProjectApplicationError("PROJECT_APPLICATION_FORBIDDEN");
  }
  if (requireEligibility) {
    const count = await transaction.roleEligibility.count({
      where: {
        personId: actor.personId,
        roleCode: "KEY_SUB_I",
        status: "ACTIVE",
      },
    });
    if (count !== 1) throw new ProjectApplicationError("PROJECT_APPLICATION_FORBIDDEN");
  }
}

async function lockApplicantApplication(
  transaction: Transaction,
  input: ExistingApplicationCommandInput,
): Promise<CommandProject> {
  await lockProject(transaction, input.projectId);
  const project = await transaction.project.findFirst({
    where: { id: input.projectId, applicantPersonId: input.actor.personId },
    include: commandInclude,
  });
  if (!project) notFound();
  if (project.rowVersion !== input.expectedRowVersion) conflict();
  return project;
}

async function lockPmoApplication(
  transaction: Transaction,
  input: PmoReviewCommandInput,
): Promise<CommandProject> {
  await lockProject(transaction, input.projectId);
  const project = await transaction.project.findUnique({
    where: { id: input.projectId },
    include: commandInclude,
  });
  if (!project) notFound();
  if (project.rowVersion !== input.expectedRowVersion) conflict();
  return project;
}

async function lockProject(transaction: Transaction, projectId: string): Promise<void> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "project" WHERE "id" = ${projectId}::uuid FOR UPDATE
  `;
  if (rows.length !== 1) notFound();
}

function requireCurrentVersion(project: CommandProject, versionId: string) {
  const version = project.currentApplicationVersion;
  if (!version || version.id !== versionId) conflict();
  return version;
}

function requireCurrentEditableVersion(project: CommandProject, versionId: string) {
  const version = requireCurrentVersion(project, versionId);
  if (version.versionStatus !== "EDITABLE") invalidState();
  return version;
}

function isEditableStatus(status: string): boolean {
  return status === "DRAFT" || status === "RETURNED_FOR_REVISION";
}

function isWithdrawableStatus(status: string): boolean {
  return [
    "DRAFT",
    "RETURNED_FOR_REVISION",
    "PENDING_ESTABLISHMENT_REVIEW",
    "ON_HOLD",
  ].includes(status);
}

async function replaceEditableVersion(
  transaction: Transaction,
  versionId: string,
  form: ApplicationFormInput,
): Promise<void> {
  await transaction.projectApplicationVersionOwner.deleteMany({
    where: { applicationVersionId: versionId },
  });
  await transaction.projectApplicationVersion.update({
    where: { id: versionId },
    data: {
      projectName: form.projectName.trim(),
      projectSummary: form.projectSummary?.trim() || null,
      diseaseAreaOptionId: form.directionOptionId,
      diseaseAreaOtherText: normalizeOtherText(form.directionOtherText),
      researchTypeOptionId: form.researchTypeOptionId,
      researchTypeOtherText: normalizeOtherText(form.researchTypeOtherText),
      leadOrganizationName: form.leadOrganizationName?.trim() || null,
      sponsorName: form.sponsorName?.trim() || null,
      fundingRecordAmountCny: form.fundingRecordAmountCny,
    },
  });
  if (form.owners.length > 0) {
    await transaction.projectApplicationVersionOwner.createMany({
      data: form.owners.map((owner) => ({
        applicationVersionId: versionId,
        personId: owner.personId,
        isPrimary: owner.isPrimary,
        sortOrder: owner.sortOrder,
      })),
    });
  }
}

async function replaceApplicationSwimlane(
  transaction: Transaction,
  versionId: string,
  swimlane: ApplicationSwimlaneInput,
): Promise<void> {
  const version = await transaction.projectApplicationVersion.findUnique({
    where: { id: versionId },
    include: { swimlaneStages: true, swimlaneWorkflows: true, swimlaneNodes: true },
  });
  if (!version || version.versionStatus !== "EDITABLE" || version.swimlaneRevision !== swimlane.expectedRevision) conflict();
  if (swimlane.sourceTemplateVersionId) {
    const source = await transaction.lifecycleTemplateVersion.findFirst({
      where: { id: swimlane.sourceTemplateVersionId, status: "PUBLISHED", lifecycleTemplate: { status: "ACTIVE" } },
      select: { id: true },
    });
    if (!source) throw new ProjectApplicationError("PROJECT_APPLICATION_TEMPLATE_INVALID");
  }
  const oldStageSources = new Map(version.swimlaneStages.map((item) => [item.id, item.sourceStageTemplateId]));
  const oldWorkflowSources = new Map(version.swimlaneWorkflows.map((item) => [item.id, item.sourceWorkflowTemplateId]));
  const oldNodeSources = new Map(version.swimlaneNodes.map((item) => [item.id, item.sourceWorkflowStageTemplateId]));
  const templateStageIds = swimlane.sourceTemplateVersionId ? new Set((await transaction.stageTemplate.findMany({ where: { templateVersionId: swimlane.sourceTemplateVersionId }, select: { id: true } })).map(({ id }) => id)) : new Set<string>();
  const templateWorkflowIds = swimlane.sourceTemplateVersionId ? new Set((await transaction.workflowTemplate.findMany({ where: { templateVersionId: swimlane.sourceTemplateVersionId }, select: { id: true } })).map(({ id }) => id)) : new Set<string>();
  const templateNodeIds = swimlane.sourceTemplateVersionId ? new Set((await transaction.workflowStageTemplate.findMany({ where: { templateVersionId: swimlane.sourceTemplateVersionId }, select: { id: true } })).map(({ id }) => id)) : new Set<string>();
  await transaction.projectApplicationSwimlaneDependency.deleteMany({ where: { applicationVersionId: versionId } });
  await transaction.projectApplicationSwimlaneNodeRole.deleteMany({ where: { applicationVersionId: versionId } });
  await transaction.projectApplicationSwimlaneNode.deleteMany({ where: { applicationVersionId: versionId } });
  await transaction.projectApplicationSwimlaneWorkflow.deleteMany({ where: { applicationVersionId: versionId } });
  await transaction.projectApplicationSwimlaneStage.deleteMany({ where: { applicationVersionId: versionId } });
  const stageIds = new Map(swimlane.stages.map((item) => [item.id, randomUUID()]));
  const workflowIds = new Map(swimlane.workflows.map((item) => [item.id, randomUUID()]));
  const nodeIds = new Map(swimlane.nodes.map((item) => [item.id, randomUUID()]));
  await transaction.projectApplicationSwimlaneStage.createMany({ data: swimlane.stages.map((item) => ({ id: stageIds.get(item.id)!, applicationVersionId: versionId, sourceStageTemplateId: oldStageSources.get(item.id) ?? (templateStageIds.has(item.id) ? item.id : null), stageCode: item.code, stageName: item.name.trim(), sortOrder: item.sortOrder, applicability: item.applicability, plannedStartDate: item.plannedStartDate ? isoDate(item.plannedStartDate) : null, plannedEndDate: item.plannedEndDate ? isoDate(item.plannedEndDate) : null })) });
  await transaction.projectApplicationSwimlaneWorkflow.createMany({ data: swimlane.workflows.map((item) => ({ id: workflowIds.get(item.id)!, applicationVersionId: versionId, sourceWorkflowTemplateId: oldWorkflowSources.get(item.id) ?? (templateWorkflowIds.has(item.id) ? item.id : null), workflowCode: item.code, workflowName: item.name.trim(), description: item.description.trim(), sortOrder: item.sortOrder, enabled: item.enabled })) });
  await transaction.projectApplicationSwimlaneNode.createMany({ data: swimlane.nodes.map((item) => ({ id: nodeIds.get(item.id)!, applicationVersionId: versionId, stageId: stageIds.get(item.stageId)!, workflowId: workflowIds.get(item.workflowId)!, sourceWorkflowStageTemplateId: oldNodeSources.get(item.id) ?? (templateNodeIds.has(item.id) ? item.id : null), taskName: item.taskName.trim(), taskDescription: item.taskDescription.trim(), sortOrder: item.sortOrder, applicability: item.applicability, plannedStartDate: item.plannedStartDate ? isoDate(item.plannedStartDate) : null, plannedEndDate: item.plannedEndDate ? isoDate(item.plannedEndDate) : null, updateIntervalDays: item.updateIntervalDays, overdueReminderIntervalDays: item.overdueReminderIntervalDays, attachmentRequirement: item.attachmentRequirement })) });
  await transaction.projectApplicationSwimlaneNodeRole.createMany({ data: swimlane.nodes.flatMap((node) => node.ownerRoles.map((roleCode, sortOrder) => ({ applicationVersionId: versionId, nodeId: nodeIds.get(node.id)!, roleCode, sortOrder }))) });
  const dependencies = swimlane.nodes.flatMap((node) => node.predecessorIds.map((predecessorId) => ({ applicationVersionId: versionId, predecessorNodeId: nodeIds.get(predecessorId)!, successorNodeId: nodeIds.get(node.id)! })));
  if (dependencies.length) await transaction.projectApplicationSwimlaneDependency.createMany({ data: dependencies });
  const updated = await transaction.projectApplicationVersion.updateMany({ where: { id: versionId, versionStatus: "EDITABLE", swimlaneRevision: swimlane.expectedRevision }, data: { lifecycleTemplateVersionId: swimlane.sourceTemplateVersionId, swimlaneName: swimlane.name.trim(), swimlaneRevision: { increment: 1 } } });
  if (updated.count !== 1) conflict();
}

async function cloneApplicationSwimlane(
  transaction: Transaction,
  source: {
    swimlaneStages: Array<{ id: string; sourceStageTemplateId: string | null; stageCode: string; stageName: string; sortOrder: number; applicability: "REQUIRED" | "OPTIONAL" | "NOT_APPLICABLE"; plannedStartDate: Date | null; plannedEndDate: Date | null }>;
    swimlaneWorkflows: Array<{ id: string; sourceWorkflowTemplateId: string | null; workflowCode: string; workflowName: string; description: string; sortOrder: number; enabled: boolean }>;
    swimlaneNodes: Array<{ id: string; stageId: string; workflowId: string; sourceWorkflowStageTemplateId: string | null; taskName: string; taskDescription: string; sortOrder: number; applicability: "REQUIRED" | "OPTIONAL" | "NOT_APPLICABLE"; plannedStartDate: Date | null; plannedEndDate: Date | null; updateIntervalDays: number | null; overdueReminderIntervalDays: number; attachmentRequirement: "NONE" | "OPTIONAL" | "REQUIRED"; ownerRoles: Array<{ roleCode: "DEAN" | "PMO" | "KEY_SUB_I" | "CRC" | "STATISTICIAN" | "COLLABORATION_LEAD"; sortOrder: number }>; successorDependencies: Array<{ predecessorNodeId: string }> }>;
  },
  targetVersionId: string,
) {
  const stageIds = new Map(source.swimlaneStages.map(({ id }) => [id, randomUUID()]));
  const workflowIds = new Map(source.swimlaneWorkflows.map(({ id }) => [id, randomUUID()]));
  const nodeIds = new Map(source.swimlaneNodes.map(({ id }) => [id, randomUUID()]));
  if (source.swimlaneStages.length) await transaction.projectApplicationSwimlaneStage.createMany({ data: source.swimlaneStages.map((item) => ({ id: stageIds.get(item.id)!, applicationVersionId: targetVersionId, sourceStageTemplateId: item.sourceStageTemplateId, stageCode: item.stageCode, stageName: item.stageName, sortOrder: item.sortOrder, applicability: item.applicability, plannedStartDate: item.plannedStartDate, plannedEndDate: item.plannedEndDate })) });
  if (source.swimlaneWorkflows.length) await transaction.projectApplicationSwimlaneWorkflow.createMany({ data: source.swimlaneWorkflows.map((item) => ({ id: workflowIds.get(item.id)!, applicationVersionId: targetVersionId, sourceWorkflowTemplateId: item.sourceWorkflowTemplateId, workflowCode: item.workflowCode, workflowName: item.workflowName, description: item.description, sortOrder: item.sortOrder, enabled: item.enabled })) });
  if (source.swimlaneNodes.length) await transaction.projectApplicationSwimlaneNode.createMany({ data: source.swimlaneNodes.map((item) => ({ id: nodeIds.get(item.id)!, applicationVersionId: targetVersionId, stageId: stageIds.get(item.stageId)!, workflowId: workflowIds.get(item.workflowId)!, sourceWorkflowStageTemplateId: item.sourceWorkflowStageTemplateId, taskName: item.taskName, taskDescription: item.taskDescription, sortOrder: item.sortOrder, applicability: item.applicability, plannedStartDate: item.plannedStartDate, plannedEndDate: item.plannedEndDate, updateIntervalDays: item.updateIntervalDays, overdueReminderIntervalDays: item.overdueReminderIntervalDays, attachmentRequirement: item.attachmentRequirement })) });
  const roles = source.swimlaneNodes.flatMap((node) => node.ownerRoles.map((role) => ({ applicationVersionId: targetVersionId, nodeId: nodeIds.get(node.id)!, roleCode: role.roleCode, sortOrder: role.sortOrder })));
  if (roles.length) await transaction.projectApplicationSwimlaneNodeRole.createMany({ data: roles });
  const dependencies = source.swimlaneNodes.flatMap((node) => node.successorDependencies.map((dependency) => ({ applicationVersionId: targetVersionId, predecessorNodeId: nodeIds.get(dependency.predecessorNodeId)!, successorNodeId: nodeIds.get(node.id)! })));
  if (dependencies.length) await transaction.projectApplicationSwimlaneDependency.createMany({ data: dependencies });
}

async function loadSubmissionForValidation(
  transaction: Transaction,
  projectId: string,
  versionId: string,
) {
  const version = await transaction.projectApplicationVersion.findUnique({
    where: { id: versionId },
    include: {
      project: { select: { applicantPersonId: true } },
      owners: {
        include: {
          person: {
            select: {
              accountStatus: true,
              roleEligibilities: {
                where: { roleCode: "KEY_SUB_I", status: "ACTIVE" },
                select: { id: true },
              },
              roleAssignments: {
                where: { roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE" },
                select: { id: true },
              },
            },
          },
        },
      },
      swimlaneStages: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      swimlaneWorkflows: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      swimlaneNodes: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: {
          ownerRoles: { orderBy: [{ sortOrder: "asc" }, { roleCode: "asc" }] },
          successorDependencies: { select: { predecessorNodeId: true } },
        },
      },
      diseaseAreaOption: { select: { optionCode: true } },
      researchTypeOption: { select: { optionCode: true } },
      lifecycleTemplateVersion: {
        include: {
          lifecycleTemplate: { select: { status: true } },
        },
      },
    },
  });
  if (!version || version.projectId !== projectId) conflict();
  if (version.lifecycleTemplateVersion?.status !== "PUBLISHED" || version.lifecycleTemplateVersion.lifecycleTemplate.status !== "ACTIVE") {
    throw new ProjectApplicationError("PROJECT_APPLICATION_TEMPLATE_INVALID");
  }
  const form = versionToForm(version);
  return {
    form,
    validation: {
      applicantPersonId: version.project.applicantPersonId,
      projectName: version.projectName,
      projectSummary: version.projectSummary ?? "",
      directionOptionId: version.diseaseAreaOptionId ?? "",
      directionOptionCode: version.diseaseAreaOption?.optionCode ?? "",
      directionOtherText: version.diseaseAreaOtherText,
      researchTypeOptionId: version.researchTypeOptionId ?? "",
      researchTypeOptionCode: version.researchTypeOption?.optionCode ?? "",
      researchTypeOtherText: version.researchTypeOtherText,
      fundingRecordAmountCny: version.fundingRecordAmountCny?.toFixed(2) ?? null,
      owners: version.owners.map((owner) => ({
        personId: owner.personId,
        isPrimary: owner.isPrimary,
        activeKeySubI:
          owner.person.accountStatus === "ACTIVE" &&
          (owner.person.roleEligibilities.length > 0 || owner.person.roleAssignments.length > 0),
      })),
      hasValidSwimlane: validateApplicationSwimlane(versionToSwimlane(version)),
    },
  };
}

async function findIdempotentSnapshot(
  transaction: Transaction,
  actor: ProjectApplicationActor,
  commandId: string,
): Promise<ProjectApplicationSnapshot | null> {
  const command = await transaction.projectApplicationCommand.findUnique({
    where: {
      actorPersonId_commandId: {
        actorPersonId: actor.personId,
        commandId,
      },
    },
    select: { projectId: true },
  });
  return command ? readSnapshot(transaction, command.projectId) : null;
}

async function readSnapshot(
  transaction: Transaction,
  projectId: string,
): Promise<ProjectApplicationSnapshot> {
  const project = await transaction.project.findUnique({
    where: { id: projectId },
    include: {
      currentApplicationVersion: true,
      establishmentReviews: {
        orderBy: { submissionNo: "desc" },
        take: 1,
      },
    },
  });
  if (!project?.currentApplicationVersion) notFound();
  const review = project.establishmentReviews[0] ?? null;
  return {
    projectId: project.id,
    applicationCode: project.applicationCode,
    projectCode: project.projectCode,
    projectName: project.currentApplicationVersion.projectName,
    status: applicationStatus(project.status),
    rowVersion: project.rowVersion,
    applicationVersionId: project.currentApplicationVersion.id,
    applicationVersionNo: project.currentApplicationVersion.versionNo,
    reviewId: review?.id ?? null,
    reviewSubmissionNo: review?.submissionNo ?? null,
  };
}

async function nextBusinessCode(
  transaction: Transaction,
  sequence: "project_application_code_sequence" | "project_code_sequence",
  prefix: string,
  minimumDigits: number,
): Promise<string> {
  const values = sequence === "project_application_code_sequence"
    ? await transaction.$queryRaw<Array<{ value: bigint }>>`
        SELECT nextval('project_application_code_sequence') AS value
      `
    : await transaction.$queryRaw<Array<{ value: bigint }>>`
        SELECT nextval('project_code_sequence') AS value
      `;
  const value = values[0]?.value;
  if (value === undefined) {
    throw new ProjectApplicationError("PROJECT_APPLICATION_ESTABLISHMENT_FAILED");
  }
  return `${prefix}${value.toString().padStart(minimumDigits, "0")}`;
}

async function appendActivity(
  transaction: Transaction,
  input: {
    projectId: string;
    applicationVersionId: string | null;
    reviewId: string | null;
    activityType:
      | "DRAFT_CREATED"
      | "DRAFT_SAVED"
      | "SWIMLANE_MODIFIED"
      | "SUBMITTED"
      | "RESUBMITTED"
      | "RETURNED"
      | "PAUSED"
      | "REVIEW_RESUMED"
      | "REJECTED"
      | "WITHDRAWN"
      | "APPROVED";
    actor: ProjectApplicationActor;
    content: string | null;
  },
) {
  return transaction.projectApplicationActivity.create({
    data: {
      projectId: input.projectId,
      applicationVersionId: input.applicationVersionId,
      reviewId: input.reviewId,
      activityType: input.activityType,
      actorPersonId: input.actor.personId,
      actorRoleCode: input.actor.roleCode,
      content: input.content,
    },
  });
}

async function appendAudit(
  transaction: Transaction,
  actor: ProjectApplicationActor,
  correlationId: string,
  input: {
    actionCode: string;
    projectId: string;
    entityId: string;
    entityBusinessCode: string;
    summary: string;
    changedFields: string[];
  },
): Promise<void> {
  await transaction.auditLog.create({
    data: {
      actorPersonId: actor.personId,
      actorRoleCode: actor.roleCode,
      sessionId: actor.sessionId,
      actionCode: input.actionCode,
      result: "SUCCESS",
      projectId: input.projectId,
      entityType: "PROJECT_APPLICATION",
      entityId: input.entityId,
      entityBusinessCode: input.entityBusinessCode,
      summary: input.summary,
      changedFields: input.changedFields,
      correlationId,
    },
  });
}

async function recordCommand(
  transaction: Transaction,
  actor: ProjectApplicationActor,
  commandId: string,
  input: {
    actionCode: string;
    projectId: string;
    applicationVersionId: string | null;
    reviewId: string | null;
    resultCode: string;
    resultEntityId: string | null;
  },
): Promise<void> {
  await transaction.projectApplicationCommand.create({
    data: {
      actorPersonId: actor.personId,
      commandId,
      actionCode: input.actionCode,
      projectId: input.projectId,
      applicationVersionId: input.applicationVersionId,
      reviewId: input.reviewId,
      resultCode: input.resultCode,
      resultEntityId: input.resultEntityId,
    },
  });
}

async function notifyActivePmos(
  transaction: Transaction,
  actor: ProjectApplicationActor,
  project: { id: string; applicationCode: string; projectName: string },
  reviewId: string | null,
  event: string,
): Promise<void> {
  if (!reviewId) return;
  const pmos = await transaction.roleAssignment.findMany({
    where: {
      roleCode: "PMO",
      projectId: null,
      assignmentStatus: "ACTIVE",
      person: { accountStatus: "ACTIVE" },
    },
    distinct: ["personId"],
    select: { personId: true },
  });
  for (const pmo of pmos) {
    await transaction.notification.create({
      data: {
        recipientPersonId: pmo.personId,
        recipientRoleCode: "PMO",
        notificationType: "PROJECT_REVIEW_NOTICE",
        eventCode: `PROJECT_APPLICATION_${event}`,
        triggeredByPersonId: actor.personId,
        triggeredByRoleCode: actor.roleCode,
        projectId: project.id,
        projectEstablishmentReviewId: reviewId,
        title: `项目申请 ${project.applicationCode}`,
        content: project.projectName,
        eventKey: `${project.id}:${reviewId}:${event}:${pmo.personId}`,
      },
    });
  }
}

async function notifyApplicant(
  transaction: Transaction,
  actor: ProjectApplicationActor,
  project: { id: string; applicantPersonId: string; applicationCode: string; projectName: string },
  reviewId: string,
  event: string,
): Promise<void> {
  await transaction.notification.create({
    data: {
      recipientPersonId: project.applicantPersonId,
      recipientRoleCode: "KEY_SUB_I",
      notificationType: "PROJECT_REVIEW_NOTICE",
      eventCode: `PROJECT_APPLICATION_${event}`,
      triggeredByPersonId: actor.personId,
      triggeredByRoleCode: actor.roleCode,
      projectId: project.id,
      projectEstablishmentReviewId: reviewId,
      title: `项目申请 ${project.applicationCode}`,
      content: project.projectName,
      eventKey: `${project.id}:${reviewId}:${event}`,
    },
  });
}

function rejectPatientData(values: Array<string | null | undefined>): void {
  if (values.some((value) => containsProhibitedPatientData(value ?? ""))) {
    throw new ProjectApplicationError("PROJECT_APPLICATION_PATIENT_DATA_PROHIBITED");
  }
}

function formText(form: ApplicationFormInput): Array<string | null | undefined> {
  return [
    form.projectName,
    form.projectSummary,
    form.leadOrganizationName,
    form.sponsorName,
    form.directionOtherText,
    form.researchTypeOtherText,
  ];
}

function normalizeOtherText(value: string | null): string | null {
  const normalized = value?.normalize("NFKC").trim() ?? "";
  return normalized || null;
}

async function registerApplicationDictionarySuggestions(
  transaction: Transaction,
  applicationVersionId: string,
  submittedByPersonId: string,
  submission: {
    directionOptionCode: string;
    directionOtherText: string | null;
    researchTypeOptionCode: string;
    researchTypeOtherText: string | null;
  },
): Promise<void> {
  const candidates = [
    {
      dictionaryCode: "DISEASE_AREA",
      fieldCode: "DISEASE_AREA",
      optionCode: submission.directionOptionCode,
      proposedDisplayName: normalizeOtherText(submission.directionOtherText),
    },
    {
      dictionaryCode: "RESEARCH_TYPE",
      fieldCode: "RESEARCH_TYPE",
      optionCode: submission.researchTypeOptionCode,
      proposedDisplayName: normalizeOtherText(submission.researchTypeOtherText),
    },
  ].filter((candidate): candidate is typeof candidate & { proposedDisplayName: string } =>
    candidate.optionCode === "OTHER" && candidate.proposedDisplayName !== null);

  for (const candidate of candidates) {
    const normalizedName = candidate.proposedDisplayName.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
    const formalOption = await transaction.dictionaryOption.findFirst({
      where: {
        dictionaryCode: candidate.dictionaryCode,
        enabled: true,
        displayName: { equals: candidate.proposedDisplayName, mode: "insensitive" },
        optionCode: { not: "OTHER" },
      },
      select: { id: true },
    });
    if (formalOption) {
      throw new ProjectApplicationError("PROJECT_APPLICATION_VALIDATION_FAILED");
    }
    const suggestion = await transaction.dictionaryOptionSuggestion.upsert({
      where: {
        dictionaryCode_normalizedName: {
          dictionaryCode: candidate.dictionaryCode,
          normalizedName,
        },
      },
      create: {
        dictionaryCode: candidate.dictionaryCode,
        proposedDisplayName: candidate.proposedDisplayName,
        normalizedName,
      },
      update: {},
      select: { id: true },
    });
    const existingSource = await transaction.dictionaryOptionSuggestionSource.findFirst({
      where: { applicationVersionId, fieldCode: candidate.fieldCode },
      select: { id: true },
    });
    if (!existingSource) {
      await transaction.dictionaryOptionSuggestionSource.create({
        data: {
          suggestionId: suggestion.id,
          applicationVersionId,
          fieldCode: candidate.fieldCode,
          submittedByPersonId,
        },
      });
    }
  }
}

function isoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function applicationStatus(status: string): ProjectApplicationSnapshot["status"] {
  if (status === "CLOSING" || status === "COMPLETED" || status === "ARCHIVED") {
    return "ACTIVE";
  }
  if (
    status === "DRAFT" ||
    status === "PENDING_ESTABLISHMENT_REVIEW" ||
    status === "RETURNED_FOR_REVISION" ||
    status === "ON_HOLD" ||
    status === "ACTIVE" ||
    status === "REJECTED" ||
    status === "CANCELLED"
  ) return status;
  throw new ProjectApplicationError("PROJECT_APPLICATION_INVALID_STATE");
}

function notFound(): never {
  throw new ProjectApplicationError("PROJECT_APPLICATION_NOT_FOUND");
}

function conflict(): never {
  throw new ProjectApplicationError("PROJECT_APPLICATION_CONFLICT");
}

function invalidState(): never {
  throw new ProjectApplicationError("PROJECT_APPLICATION_INVALID_STATE");
}

function validationFailed(): never {
  throw new ProjectApplicationError("PROJECT_APPLICATION_VALIDATION_FAILED");
}

type ReviewRecord = CommandProject["establishmentReviews"][number];
type VersionRecord = NonNullable<CommandProject["currentApplicationVersion"]>;

async function executeReturn(
  transaction: Transaction,
  input: PmoReviewCommandInput,
  project: CommandProject,
  version: VersionRecord,
  review: ReviewRecord,
): Promise<ProjectApplicationSnapshot> {
  if (project.status !== "PENDING_ESTABLISHMENT_REVIEW" || review.decision !== "PENDING") {
    invalidState();
  }
  if (!input.comment?.trim()) validationFailed();
  const source = await transaction.projectApplicationVersion.findUnique({
    where: { id: version.id },
    include: { owners: true, swimlaneStages: true, swimlaneWorkflows: true, swimlaneNodes: { include: { ownerRoles: true, successorDependencies: true } } },
  });
  if (!source) conflict();
  const newVersionId = randomUUID();
  await transaction.projectApplicationVersion.create({
    data: {
      id: newVersionId,
      projectId: project.id,
      versionNo: source.versionNo + 1,
      versionStatus: "EDITABLE",
      projectName: source.projectName,
      projectSummary: source.projectSummary,
      leadOrganizationName: source.leadOrganizationName,
      sponsorName: source.sponsorName,
      fundingRecordAmountCny: source.fundingRecordAmountCny,
      diseaseAreaOptionId: source.diseaseAreaOptionId,
      diseaseAreaOtherText: source.diseaseAreaOtherText,
      researchTypeOptionId: source.researchTypeOptionId,
      researchTypeOtherText: source.researchTypeOtherText,
      lifecycleTemplateVersionId: source.lifecycleTemplateVersionId,
      swimlaneName: source.swimlaneName,
      swimlaneRevision: 0,
      createdByPersonId: project.applicantPersonId,
    },
  });
  if (source.owners.length > 0) {
    await transaction.projectApplicationVersionOwner.createMany({
      data: source.owners.map((owner) => ({
        applicationVersionId: newVersionId,
        personId: owner.personId,
        isPrimary: owner.isPrimary,
        sortOrder: owner.sortOrder,
      })),
    });
  }
  await cloneApplicationSwimlane(transaction, source, newVersionId);
  await transaction.projectEstablishmentReview.update({
    where: { id: review.id },
    data: {
      decision: "RETURNED",
      decidedByPersonId: input.actor.personId,
      decidedByRoleCode: "PMO",
      decidedAt: new Date(),
      decisionComment: input.comment.trim(),
    },
  });
  await transaction.project.update({
    where: { id: project.id },
    data: {
      status: "RETURNED_FOR_REVISION",
      currentApplicationVersionId: newVersionId,
      rowVersion: { increment: 1 },
    },
  });
  return finalizeReviewAction(transaction, input, project, {
    versionId: newVersionId,
    reviewId: review.id,
    activityType: "RETURNED",
    actionCode: "RETURN_FOR_REVISION",
    summary: "退回项目申请修改",
  });
}

async function executePause(
  transaction: Transaction,
  input: PmoReviewCommandInput,
  project: CommandProject,
  version: VersionRecord,
  review: ReviewRecord,
): Promise<ProjectApplicationSnapshot> {
  if (project.status !== "PENDING_ESTABLISHMENT_REVIEW" || review.decision !== "PENDING") {
    invalidState();
  }
  if (!input.comment?.trim()) validationFailed();
  await transaction.projectEstablishmentReview.update({
    where: { id: review.id },
    data: {
      decision: "PAUSED",
      decidedByPersonId: input.actor.personId,
      decidedByRoleCode: "PMO",
      decidedAt: new Date(),
      decisionComment: input.comment.trim(),
    },
  });
  await transaction.project.update({
    where: { id: project.id },
    data: { status: "ON_HOLD", rowVersion: { increment: 1 } },
  });
  return finalizeReviewAction(transaction, input, project, {
    versionId: version.id,
    reviewId: review.id,
    activityType: "PAUSED",
    actionCode: "PUT_ON_HOLD",
    summary: "暂缓项目申请审核",
  });
}

async function executeResume(
  transaction: Transaction,
  input: PmoReviewCommandInput,
  project: CommandProject,
  version: VersionRecord,
  review: ReviewRecord,
): Promise<ProjectApplicationSnapshot> {
  if (project.status !== "ON_HOLD" || review.decision !== "PAUSED") invalidState();
  await transaction.projectEstablishmentReview.update({
    where: { id: review.id },
    data: {
      decision: "PENDING",
      decidedByPersonId: null,
      decidedByRoleCode: null,
      decidedAt: null,
      decisionComment: null,
    },
  });
  await transaction.project.update({
    where: { id: project.id },
    data: { status: "PENDING_ESTABLISHMENT_REVIEW", rowVersion: { increment: 1 } },
  });
  return finalizeReviewAction(transaction, input, project, {
    versionId: version.id,
    reviewId: review.id,
    activityType: "REVIEW_RESUMED",
    actionCode: "RESUME_REVIEW",
    summary: "恢复项目申请审核",
  });
}

async function executeReject(
  transaction: Transaction,
  input: PmoReviewCommandInput,
  project: CommandProject,
  version: VersionRecord,
  review: ReviewRecord,
): Promise<ProjectApplicationSnapshot> {
  if (
    !["PENDING_ESTABLISHMENT_REVIEW", "ON_HOLD"].includes(project.status) ||
    !["PENDING", "PAUSED"].includes(review.decision)
  ) invalidState();
  if (!input.comment?.trim()) validationFailed();
  await transaction.projectEstablishmentReview.update({
    where: { id: review.id },
    data: {
      decision: "REJECTED",
      decidedByPersonId: input.actor.personId,
      decidedByRoleCode: "PMO",
      decidedAt: new Date(),
      decisionComment: input.comment.trim(),
    },
  });
  await transaction.project.update({
    where: { id: project.id },
    data: {
      status: "REJECTED",
      normalizedNameOccupancy: null,
      rowVersion: { increment: 1 },
    },
  });
  return finalizeReviewAction(transaction, input, project, {
    versionId: version.id,
    reviewId: review.id,
    activityType: "REJECTED",
    actionCode: "REJECT_APPLICATION",
    summary: "拒绝项目申请",
  });
}

async function finalizeReviewAction(
  transaction: Transaction,
  input: PmoReviewCommandInput,
  project: CommandProject,
  action: {
    versionId: string;
    reviewId: string;
    activityType: "RETURNED" | "PAUSED" | "REVIEW_RESUMED" | "REJECTED";
    actionCode: string;
    summary: string;
  },
): Promise<ProjectApplicationSnapshot> {
  const activity = await appendActivity(transaction, {
    projectId: project.id,
    applicationVersionId: action.versionId,
    reviewId: action.reviewId,
    activityType: action.activityType,
    actor: input.actor,
    content: input.comment?.trim() || null,
  });
  await notifyApplicant(transaction, input.actor, project, action.reviewId, action.activityType);
  await appendAudit(transaction, input.actor, input.commandId, {
    actionCode: `PROJECT_APPLICATION_${action.actionCode}`,
    projectId: project.id,
    entityId: action.reviewId,
    entityBusinessCode: project.applicationCode,
    summary: action.summary,
    changedFields: ["status", "review"],
  });
  await recordCommand(transaction, input.actor, input.commandId, {
    actionCode: action.actionCode,
    projectId: project.id,
    applicationVersionId: action.versionId,
    reviewId: action.reviewId,
    resultCode: "SUCCESS",
    resultEntityId: activity.id,
  });
  return readSnapshot(transaction, project.id);
}

async function executeApproval(
  transaction: Transaction,
  input: PmoReviewCommandInput,
  project: CommandProject,
  version: VersionRecord,
  review: ReviewRecord,
): Promise<ProjectApplicationSnapshot> {
  if (project.status !== "PENDING_ESTABLISHMENT_REVIEW" || review.decision !== "PENDING") {
    invalidState();
  }
  const submission = await loadSubmissionForValidation(transaction, project.id, version.id);
  const errors = validateSubmission(submission.validation);
  if (errors.length > 0) throw new ProjectApplicationError(errors[0]);
  rejectPatientData(formText(submission.form));

  const approved = await transaction.projectApplicationVersion.findUnique({
    where: { id: version.id },
    include: {
      owners: {
        include: {
          person: {
            select: {
              accountStatus: true,
              roleEligibilities: {
                where: { roleCode: "KEY_SUB_I", status: "ACTIVE" },
                select: { id: true },
              },
              roleAssignments: {
                where: { roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE" },
                select: { id: true },
              },
            },
          },
        },
      },
      swimlaneStages: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      swimlaneWorkflows: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      swimlaneNodes: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { ownerRoles: { orderBy: [{ sortOrder: "asc" }, { roleCode: "asc" }] }, successorDependencies: true } },
      lifecycleTemplateVersion: {
        include: {
          lifecycleTemplate: { select: { templateName: true } },
        },
      },
    },
  });
  if (
    !approved ||
    approved.versionStatus !== "FROZEN" ||
    !approved.lifecycleTemplateVersion || (approved.lifecycleTemplateVersion.status !== "PUBLISHED" && approved.lifecycleTemplateVersion.status !== "RETIRED") ||
    approved.owners.some((owner) =>
      owner.person.accountStatus !== "ACTIVE" ||
      (owner.person.roleEligibilities.length === 0 && owner.person.roleAssignments.length === 0)
    )
  ) {
    throw new ProjectApplicationError("PROJECT_APPLICATION_ESTABLISHMENT_FAILED");
  }
  const primary = approved.owners.find((owner) => owner.isPrimary);
  if (!primary || approved.owners.filter((owner) => owner.isPrimary).length !== 1) {
    throw new ProjectApplicationError("PROJECT_APPLICATION_PRIMARY_OWNER_INVALID");
  }
  const template = approved.lifecycleTemplateVersion;
  if (!validateApplicationSwimlane(versionToSwimlane(approved))) {
    throw new ProjectApplicationError("PROJECT_APPLICATION_SWIMLANE_INVALID");
  }

  const projectCode = await nextBusinessCode(
    transaction,
    "project_code_sequence",
    "DEMO-",
    3,
  );
  const plan = await transaction.projectPlan.create({
    data: { projectId: project.id },
  });
  const planVersion = await transaction.projectPlanVersion.create({
    data: {
      projectPlanId: plan.id,
      versionNo: 1,
      templateVersionId: template.id,
      swimlaneName: approved.swimlaneName,
      status: "ACTIVE",
      createdByPersonId: input.actor.personId,
      activatedAt: new Date(),
    },
  });

  const projectStageByApplicationId = new Map<string, string>();
  for (const applicationStage of approved.swimlaneStages) {
    const projectStage = await transaction.projectStage.create({
      data: {
        projectId: project.id,
        projectPlanId: plan.id,
        sourceStageTemplateId: applicationStage.sourceStageTemplateId,
      },
    });
    projectStageByApplicationId.set(applicationStage.id, projectStage.id);
    await transaction.projectStageVersion.create({
      data: {
        projectPlanVersionId: planVersion.id,
        projectStageId: projectStage.id,
        stageCode: applicationStage.stageCode,
        stageName: applicationStage.stageName,
        sortOrder: applicationStage.sortOrder,
        applicability: applicationStage.applicability,
        plannedStartDate: applicationStage.plannedStartDate,
        plannedEndDate: applicationStage.plannedEndDate,
      },
    });
  }

  const projectWorkflowByApplicationId = new Map<string, string>();
  for (const applicationWorkflow of approved.swimlaneWorkflows) {
    const workflow = await transaction.projectWorkflow.create({
      data: {
        projectId: project.id,
        projectPlanId: plan.id,
        sourceWorkflowTemplateId: applicationWorkflow.sourceWorkflowTemplateId,
        workflowType: applicationWorkflow.sourceWorkflowTemplateId ? "STANDARD" : "PROJECT_CUSTOM",
      },
    });
    projectWorkflowByApplicationId.set(applicationWorkflow.id, workflow.id);
    await transaction.projectWorkflowVersion.create({
      data: {
        projectPlanVersionId: planVersion.id,
        projectWorkflowId: workflow.id,
        workflowCode: applicationWorkflow.workflowCode,
        workflowName: applicationWorkflow.workflowName,
        description: applicationWorkflow.description,
        sortOrder: applicationWorkflow.sortOrder,
        enabled: applicationWorkflow.enabled,
      },
    });
  }
  const projectNodeByApplicationId = new Map<string, string>();
  for (const applicationNode of approved.swimlaneNodes) {
      const projectStageId = projectStageByApplicationId.get(applicationNode.stageId);
      const projectWorkflowId = projectWorkflowByApplicationId.get(applicationNode.workflowId);
      if (!projectStageId || !projectWorkflowId) throw new ProjectApplicationError("PROJECT_APPLICATION_SWIMLANE_INVALID");
      const workflowStage = await transaction.projectWorkflowStage.create({
        data: {
          projectId: project.id,
          projectPlanId: plan.id,
          projectWorkflowId,
          projectStageId,
          executionStatus: "NOT_STARTED",
        },
      });
      projectNodeByApplicationId.set(applicationNode.id, workflowStage.id);
      const workflowStageVersion = await transaction.projectWorkflowStageVersion.create({
        data: {
          projectPlanVersionId: planVersion.id,
          projectWorkflowStageId: workflowStage.id,
          projectWorkflowId,
          projectStageId,
          taskName: applicationNode.taskName,
          taskDescription: applicationNode.taskDescription,
          plannedStartDate: applicationNode.plannedStartDate,
          plannedEndDate: applicationNode.plannedEndDate,
          updateIntervalDays: applicationNode.updateIntervalDays,
          overdueReminderIntervalDays: applicationNode.overdueReminderIntervalDays,
          sortOrder: applicationNode.sortOrder,
          applicability: applicationNode.applicability,
          attachmentRequirement: applicationNode.attachmentRequirement,
        },
      });
      if (applicationNode.ownerRoles.length) await transaction.projectWorkflowStageRoleVersion.createMany({
        data: applicationNode.ownerRoles.map((role) => ({
          projectWorkflowStageVersionId: workflowStageVersion.id,
          roleCode: role.roleCode,
          sortOrder: role.sortOrder,
        })),
      });
  }
  const dependencyRows = approved.swimlaneNodes.flatMap((node) => node.successorDependencies.map((dependency) => ({ projectId: project.id, projectPlanVersionId: planVersion.id, predecessorProjectWorkflowStageId: projectNodeByApplicationId.get(dependency.predecessorNodeId)!, successorProjectWorkflowStageId: projectNodeByApplicationId.get(node.id)! })));
  if (dependencyRows.length) await transaction.projectWorkflowStageDependencyVersion.createMany({ data: dependencyRows });

  const assignment = await transaction.roleAssignment.create({
    data: {
      personId: primary.personId,
      roleCode: "KEY_SUB_I",
      projectId: project.id,
      assignmentStatus: "ACTIVE",
      isPrimary: true,
      grantSource: "PMO_ACTION",
      grantedByPersonId: input.actor.personId,
      activatedAt: new Date(),
    },
  });
  await transaction.projectPrimaryKeySubIChange.create({
    data: {
      projectId: project.id,
      newRoleAssignmentId: assignment.id,
      changeReason: "项目建档激活首任主 Key Sub-I",
      changedByPersonId: input.actor.personId,
    },
  });
  await transaction.projectEstablishmentReview.update({
    where: { id: review.id },
    data: {
      decision: "APPROVED",
      decidedByPersonId: input.actor.personId,
      decidedByRoleCode: "PMO",
      decidedAt: new Date(),
      decisionComment: input.comment?.trim() || null,
    },
  });
  const activity = await appendActivity(transaction, {
    projectId: project.id,
    applicationVersionId: version.id,
    reviewId: review.id,
    activityType: "APPROVED",
    actor: input.actor,
    content: input.comment?.trim() || null,
  });
  await notifyApplicant(transaction, input.actor, project, review.id, "APPROVED");
  if (primary.personId !== project.applicantPersonId) {
    await notifyApprovalRecipient(
      transaction,
      input.actor,
      project,
      review.id,
      primary.personId,
    );
  }
  const dates = approved.swimlaneStages.map(({ plannedEndDate }) => plannedEndDate).filter((date): date is Date => Boolean(date));
  const plannedEndDate = dates.length ? new Date(Math.max(...dates.map((date) => date.valueOf()))) : null;
  await transaction.project.update({
    where: { id: project.id },
    data: {
      projectCode,
      projectName: approved.projectName,
      projectSummary: approved.projectSummary,
      diseaseAreaOptionId: approved.diseaseAreaOptionId,
      diseaseAreaOtherText: approved.diseaseAreaOtherText,
      researchTypeOptionId: approved.researchTypeOptionId,
      researchTypeOtherText: approved.researchTypeOtherText,
      leadOrganizationName: approved.leadOrganizationName,
      sponsorName: approved.sponsorName,
      fundingRecordAmountCny: approved.fundingRecordAmountCny,
      plannedStartDate: null,
      plannedEndDate,
      status: "ACTIVE",
      establishedByPersonId: input.actor.personId,
      establishedAt: new Date(),
      rowVersion: { increment: 1 },
    },
  });
  await appendAudit(transaction, input.actor, input.commandId, {
    actionCode: "PROJECT_APPLICATION_APPROVED",
    projectId: project.id,
    entityId: review.id,
    entityBusinessCode: projectCode,
    summary: "批准项目申请并原子建档",
    changedFields: ["project_code", "status", "project_plan", "primary_key_sub_i"],
  });
  await recordCommand(transaction, input.actor, input.commandId, {
    actionCode: "APPROVE_AND_ESTABLISH",
    projectId: project.id,
    applicationVersionId: version.id,
    reviewId: review.id,
    resultCode: "SUCCESS",
    resultEntityId: activity.id,
  });
  return readSnapshot(transaction, project.id);
}

async function notifyApprovalRecipient(
  transaction: Transaction,
  actor: ProjectApplicationActor,
  project: { id: string; applicationCode: string; projectName: string },
  reviewId: string,
  recipientPersonId: string,
): Promise<void> {
  await transaction.notification.create({
    data: {
      recipientPersonId,
      recipientRoleCode: "KEY_SUB_I",
      notificationType: "PROJECT_REVIEW_NOTICE",
      eventCode: "PROJECT_APPLICATION_APPROVED",
      triggeredByPersonId: actor.personId,
      triggeredByRoleCode: actor.roleCode,
      projectId: project.id,
      projectEstablishmentReviewId: reviewId,
      title: `项目申请 ${project.applicationCode} 已通过`,
      content: project.projectName,
      eventKey: `${project.id}:${reviewId}:APPROVED`,
    },
  });
}

function mapListItem(project: ListProject): ProjectApplicationListItem {
  const version = project.currentApplicationVersion;
  if (!version) notFound();
  const review = project.establishmentReviews[0] ?? null;
  const primary = version.owners[0] ?? null;
  return {
    projectId: project.id,
    applicationCode: project.applicationCode,
    projectCode: project.projectCode,
    projectName: version.projectName,
    status: applicationStatus(project.status),
    rowVersion: project.rowVersion,
    applicationVersionId: version.id,
    applicationVersionNo: version.versionNo,
    reviewId: review?.id ?? null,
    reviewSubmissionNo: review?.submissionNo ?? null,
    applicantPersonId: project.applicantPersonId,
    applicantDisplayName: project.applicant.displayName,
    primaryOwnerDisplayName: primary?.person.displayName ?? null,
    submittedAt: review?.submittedAt.toISOString() ?? null,
    updatedAt: project.updatedAt.toISOString(),
  };
}

function mapDetail(
  project: DetailProject,
  canAccessEstablishedProject: boolean,
): ProjectApplicationDetail {
  const base = mapListItem(project);
  const version = project.currentApplicationVersion;
  if (!version) notFound();
  const review = project.establishmentReviews[0] ?? null;
  const template = version.lifecycleTemplateVersion;
  return {
    ...base,
    form: versionToForm(version),
    swimlane: { ...versionToSwimlane(version), sourceTemplateName: template?.lifecycleTemplate.templateName ?? null },
    reviewDecision: review?.decision ?? null,
    reviewComment: review?.decisionComment ?? null,
    activities: project.applicationActivities.map((activity) => ({
      activityType: activity.activityType,
      actorDisplayName: activity.actor.displayName,
      content: activity.content,
      createdAt: activity.createdAt.toISOString(),
    })),
    canAccessEstablishedProject,
    canWithdraw: isWithdrawableStatus(project.status),
  };
}

function versionToForm(version: {
  projectName: string;
  projectSummary: string | null;
  diseaseAreaOptionId: string | null;
  diseaseAreaOtherText: string | null;
  diseaseAreaOption?: { optionCode: string } | null;
  researchTypeOptionId: string | null;
  researchTypeOtherText: string | null;
  researchTypeOption?: { optionCode: string } | null;
  lifecycleTemplateVersionId: string | null;
  leadOrganizationName: string | null;
  sponsorName: string | null;
  fundingRecordAmountCny: { toFixed(fractionDigits?: number): string } | null;
  owners: Array<{ personId: string; isPrimary: boolean; sortOrder: number }>;
}): ApplicationFormInput {
  return {
    projectName: version.projectName,
    projectSummary: version.projectSummary,
    directionOptionId: version.diseaseAreaOptionId,
    directionOptionCode: version.diseaseAreaOption?.optionCode ?? null,
    directionOtherText: version.diseaseAreaOtherText,
    researchTypeOptionId: version.researchTypeOptionId,
    researchTypeOptionCode: version.researchTypeOption?.optionCode ?? null,
    researchTypeOtherText: version.researchTypeOtherText,
    leadOrganizationName: version.leadOrganizationName,
    sponsorName: version.sponsorName,
    fundingRecordAmountCny: version.fundingRecordAmountCny?.toFixed(2) ?? null,
    owners: version.owners.map((owner) => ({
      personId: owner.personId,
      isPrimary: owner.isPrimary,
      sortOrder: owner.sortOrder,
    })),
  };
}

function versionToSwimlane(version: {
  lifecycleTemplateVersionId: string | null;
  swimlaneName: string;
  swimlaneRevision: number;
  swimlaneStages: Array<{ id: string; stageCode: string; stageName: string; sortOrder: number; applicability: "REQUIRED" | "OPTIONAL" | "NOT_APPLICABLE"; plannedStartDate: Date | null; plannedEndDate: Date | null }>;
  swimlaneWorkflows: Array<{ id: string; workflowCode: string; workflowName: string; description: string; sortOrder: number; enabled: boolean }>;
  swimlaneNodes: Array<{ id: string; workflowId: string; stageId: string; taskName: string; taskDescription: string; sortOrder: number; applicability: "REQUIRED" | "OPTIONAL" | "NOT_APPLICABLE"; plannedStartDate: Date | null; plannedEndDate: Date | null; updateIntervalDays: number | null; overdueReminderIntervalDays: number; attachmentRequirement: "NONE" | "OPTIONAL" | "REQUIRED"; ownerRoles: Array<{ roleCode: "DEAN" | "PMO" | "KEY_SUB_I" | "CRC" | "STATISTICIAN" | "COLLABORATION_LEAD" }>; successorDependencies: Array<{ predecessorNodeId: string }> }>;
}): ApplicationSwimlaneInput {
  return {
    name: version.swimlaneName,
    expectedRevision: version.swimlaneRevision,
    sourceTemplateVersionId: version.lifecycleTemplateVersionId,
    stages: version.swimlaneStages.map((stage) => ({ id: stage.id, code: stage.stageCode, name: stage.stageName, sortOrder: stage.sortOrder, applicability: stage.applicability, plannedStartDate: stage.plannedStartDate ? dateOnly(stage.plannedStartDate) : null, plannedEndDate: stage.plannedEndDate ? dateOnly(stage.plannedEndDate) : null })),
    workflows: version.swimlaneWorkflows.map((workflow) => ({ id: workflow.id, code: workflow.workflowCode, name: workflow.workflowName, description: workflow.description, sortOrder: workflow.sortOrder, enabled: workflow.enabled })),
    nodes: version.swimlaneNodes.map((node) => ({ id: node.id, workflowId: node.workflowId, stageId: node.stageId, taskName: node.taskName, taskDescription: node.taskDescription, sortOrder: node.sortOrder, applicability: node.applicability, plannedStartDate: node.plannedStartDate ? dateOnly(node.plannedStartDate) : null, plannedEndDate: node.plannedEndDate ? dateOnly(node.plannedEndDate) : null, updateIntervalDays: node.updateIntervalDays, overdueReminderIntervalDays: node.overdueReminderIntervalDays, attachmentRequirement: node.attachmentRequirement, ownerRoles: node.ownerRoles.map(({ roleCode }) => roleCode).filter((roleCode): roleCode is "PMO" | "KEY_SUB_I" | "CRC" | "STATISTICIAN" | "COLLABORATION_LEAD" => roleCode !== "DEAN"), predecessorIds: node.successorDependencies.map(({ predecessorNodeId }) => predecessorNodeId) })),
  };
}

async function hasEstablishedProjectAccess(
  transaction: Transaction,
  actor: ProjectApplicationActor,
  projectId: string,
): Promise<boolean> {
  if (actor.roleCode === "PMO") return true;
  return (await transaction.roleAssignment.count({
    where: {
      personId: actor.personId,
      projectId,
      roleCode: actor.roleCode,
      assignmentStatus: "ACTIVE",
    },
  })) > 0;
}
