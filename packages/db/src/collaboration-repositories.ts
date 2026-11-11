import { randomUUID } from "node:crypto";

import {
  CollaborationError,
  aggregateOpenIssueRisk,
  type CollaborationActor,
  type CollaborationRepository,
  type CollaborationResponsibilityType,
  type CollaborationTimeLimit,
  type GlobalTimeLimitChange,
  type ProjectExecutionListItem,
  type ProjectExecutionOverview,
  type ProjectTimeLimitChange,
} from "@researchflow/collaboration";

import type { Prisma } from "../generated/client.js";
import type { ApplicationPrismaClient } from "./client.js";

type Transaction = Prisma.TransactionClient;
type DatabaseClient = ApplicationPrismaClient | Transaction;
const visibleProjectStatuses = ["ACTIVE", "CLOSING", "COMPLETED", "ARCHIVED"] as const;

export class PrismaCollaborationRepository implements CollaborationRepository {
  constructor(private readonly client: ApplicationPrismaClient) {}

  async listAccessibleProjects(actor: CollaborationActor): Promise<ProjectExecutionListItem[]> {
    return this.client.$transaction(
      async (transaction) => {
        const where = await projectScope(transaction, actor);
        const projects = await transaction.project.findMany({
          where,
          orderBy: [{ updatedAt: "desc" }, { projectCode: "asc" }],
          select: { id: true, projectCode: true, projectName: true, status: true },
        });
        return projects.flatMap((project) =>
          project.projectCode
            ? [{
                projectId: project.id,
                projectCode: project.projectCode,
                projectName: project.projectName,
                projectStatus: project.status as ProjectExecutionListItem["projectStatus"],
              }]
            : [],
        );
      },
      { isolationLevel: "Serializable" },
    );
  }

  async getExecutionOverview(
    actor: CollaborationActor,
    projectId: string,
  ): Promise<ProjectExecutionOverview | null> {
    return this.client.$transaction(
      (transaction) => findExecutionOverview(transaction, actor, projectId),
      { isolationLevel: "Serializable" },
    );
  }

  async listTimeLimits(
    actor: CollaborationActor,
    projectId: string,
  ): Promise<CollaborationTimeLimit[]> {
    return this.client.$transaction(
      async (transaction) => {
        if (!(await findExecutionOverview(transaction, actor, projectId))) {
          throw new CollaborationError("PROJECT_NOT_FOUND");
        }
        const settings = await transaction.collaborationTimeLimitSetting.findMany({
          where: { OR: [{ projectId: null }, { projectId }] },
          orderBy: [{ responsibilityType: "asc" }, { projectId: "asc" }],
        });
        return settings.map(mapTimeLimit);
      },
      { isolationLevel: "Serializable" },
    );
  }

  async listGlobalTimeLimits(actor: CollaborationActor): Promise<CollaborationTimeLimit[]> {
    return this.client.$transaction(
      async (transaction) => {
        await requireActiveSession(transaction, actor);
        await requireActiveGlobalRole(transaction, actor, "PMO");
        const settings = await transaction.collaborationTimeLimitSetting.findMany({
          where: { projectId: null },
          orderBy: { responsibilityType: "asc" },
        });
        return settings.map(mapTimeLimit);
      },
      { isolationLevel: "Serializable" },
    );
  }

  async saveGlobalTimeLimits(input: {
    actor: CollaborationActor;
    changes: GlobalTimeLimitChange[];
  }): Promise<void> {
    try {
      await this.client.$transaction(async (transaction) => {
        await requireActiveSession(transaction, input.actor);
        await requireActiveGlobalRole(transaction, input.actor, "PMO");
        const changedTypes: CollaborationResponsibilityType[] = [];
        for (const change of input.changes) {
          const existing = await transaction.collaborationTimeLimitSetting.findFirst({
            where: { projectId: null, responsibilityType: change.responsibilityType },
          });
          if ((change.expectedUpdatedAt === null) !== (existing === null)
              || (change.expectedUpdatedAt !== null && existing?.updatedAt.toISOString() !== change.expectedUpdatedAt)) {
            throw new CollaborationError("TIME_LIMIT_CONFLICT");
          }
          if (existing
              && existing.timeLimitDays === change.timeLimitDays
              && existing.reminderIntervalDays === change.reminderIntervalDays) continue;
          if (existing) {
            await transaction.collaborationTimeLimitSetting.update({
              where: { id: existing.id },
              data: {
                timeLimitDays: change.timeLimitDays,
                reminderIntervalDays: change.reminderIntervalDays,
                updatedByPersonId: input.actor.personId,
              },
            });
          } else {
            await transaction.collaborationTimeLimitSetting.create({ data: {
              projectId: null,
              responsibilityType: change.responsibilityType,
              timeLimitDays: change.timeLimitDays,
              reminderIntervalDays: change.reminderIntervalDays,
              updatedByPersonId: input.actor.personId,
            } });
          }
          changedTypes.push(change.responsibilityType);
        }
        if (changedTypes.length) await transaction.auditLog.create({ data: {
          actorPersonId: input.actor.personId,
          actorRoleCode: input.actor.roleCode,
          sessionId: input.actor.sessionId,
          actionCode: "GLOBAL_COLLABORATION_TIME_LIMITS_SAVED",
          result: "SUCCESS",
          entityType: "COLLABORATION_TIME_LIMIT_SETTING",
          summary: "批量保存全局协作时限差异",
          changedFields: changedTypes,
          correlationId: randomUUID(),
        } });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (isDatabaseConflict(error)) throw new CollaborationError("TIME_LIMIT_CONFLICT");
      throw error;
    }
  }

  async saveProjectTimeLimits(input: {
    actor: CollaborationActor;
    projectId: string;
    changes: ProjectTimeLimitChange[];
  }): Promise<void> {
    try {
      await this.client.$transaction(async (transaction) => {
        await requireActiveSession(transaction, input.actor);
        await requireActiveGlobalRole(transaction, input.actor, "PMO");
        const project = await transaction.project.findFirst({
          where: { id: input.projectId, projectCode: { not: null }, status: { in: [...visibleProjectStatuses] } },
          select: { id: true },
        });
        if (!project) throw new CollaborationError("PROJECT_NOT_FOUND");
        for (const change of input.changes) {
          const existing = await transaction.collaborationTimeLimitSetting.findUnique({
            where: { projectId_responsibilityType: {
              projectId: input.projectId,
              responsibilityType: change.responsibilityType,
            } },
          });
          const expected = change.expectedProjectSettingUpdatedAt;
          if ((expected === null) !== (existing === null) ||
              (expected !== null && existing?.updatedAt.toISOString() !== expected)) {
            throw new CollaborationError("TIME_LIMIT_CONFLICT");
          }
          if (change.mode === "FOLLOW_GLOBAL") {
            if (existing) await transaction.collaborationTimeLimitSetting.delete({ where: { id: existing.id } });
          } else if (existing) {
            await transaction.collaborationTimeLimitSetting.update({
              where: { id: existing.id },
              data: {
                timeLimitDays: change.timeLimitDays,
                reminderIntervalDays: change.reminderIntervalDays,
                updatedByPersonId: input.actor.personId,
              },
            });
          } else {
            await transaction.collaborationTimeLimitSetting.create({ data: {
              projectId: input.projectId,
              responsibilityType: change.responsibilityType,
              timeLimitDays: change.timeLimitDays,
              reminderIntervalDays: change.reminderIntervalDays,
              updatedByPersonId: input.actor.personId,
            } });
          }
        }
        if (input.changes.length) await transaction.auditLog.create({ data: {
          actorPersonId: input.actor.personId,
          actorRoleCode: input.actor.roleCode,
          sessionId: input.actor.sessionId,
          actionCode: "PROJECT_COLLABORATION_TIME_LIMITS_SAVED",
          result: "SUCCESS",
          projectId: input.projectId,
          entityType: "PROJECT",
          entityId: input.projectId,
          summary: "批量保存项目协作时限差异",
          changedFields: input.changes.map(({ responsibilityType }) => responsibilityType),
          correlationId: randomUUID(),
        } });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (isDatabaseConflict(error)) throw new CollaborationError("TIME_LIMIT_CONFLICT");
      throw error;
    }
  }

  async upsertTimeLimit(input: {
    actor: CollaborationActor;
    projectId: string | null;
    responsibilityType: CollaborationResponsibilityType;
    timeLimitDays: number;
    reminderIntervalDays: number;
  }): Promise<CollaborationTimeLimit> {
    return this.client.$transaction(
      async (transaction) => {
        await requireActiveSession(transaction, input.actor);
        await requireActiveGlobalRole(transaction, input.actor, "PMO");
        if (input.projectId) {
          const project = await transaction.project.findFirst({
            where: {
              id: input.projectId,
              projectCode: { not: null },
              status: { in: [...visibleProjectStatuses] },
            },
            select: { id: true },
          });
          if (!project) throw new CollaborationError("PROJECT_NOT_FOUND");
        }
        const existing = await transaction.collaborationTimeLimitSetting.findFirst({
          where: {
            projectId: input.projectId,
            responsibilityType: input.responsibilityType,
          },
        });
        const setting = existing
          ? await transaction.collaborationTimeLimitSetting.update({
              where: { id: existing.id },
              data: {
                timeLimitDays: input.timeLimitDays,
                reminderIntervalDays: input.reminderIntervalDays,
                updatedByPersonId: input.actor.personId,
              },
            })
          : await transaction.collaborationTimeLimitSetting.create({
              data: {
                projectId: input.projectId,
                responsibilityType: input.responsibilityType,
                timeLimitDays: input.timeLimitDays,
                reminderIntervalDays: input.reminderIntervalDays,
                updatedByPersonId: input.actor.personId,
              },
            });
        await transaction.auditLog.create({
          data: {
            actorPersonId: input.actor.personId,
            actorRoleCode: input.actor.roleCode,
            sessionId: input.actor.sessionId,
            actionCode: "COLLABORATION_TIME_LIMIT_CONFIGURED",
            result: "SUCCESS",
            projectId: input.projectId,
            entityType: "COLLABORATION_TIME_LIMIT_SETTING",
            entityId: setting.id,
            summary: "配置协作责任时限",
            changedFields: ["time_limit_days", "reminder_interval_days"],
            correlationId: randomUUID(),
          },
        });
        return mapTimeLimit(setting);
      },
      { isolationLevel: "Serializable" },
    );
  }
}

async function findExecutionOverview(
  client: DatabaseClient,
  actor: CollaborationActor,
  projectId: string,
): Promise<ProjectExecutionOverview | null> {
  const where = await projectScope(client, actor, projectId);
  const project = await client.project.findFirst({
      where,
      select: {
        id: true,
        projectCode: true,
        projectName: true,
        applicationCode: true,
        projectSummary: true,
        status: true,
        leadOrganizationName: true,
        sponsorName: true,
        diseaseAreaOtherText: true,
        researchTypeOtherText: true,
        plannedEndDate: true,
        fundingRecordAmountCny: true,
        establishedAt: true,
        completedAt: true,
        archivedAt: true,
        applicant: { select: { displayName: true } },
        establishedBy: { select: { displayName: true } },
        diseaseAreaOption: { select: { optionCode: true, displayName: true } },
        researchTypeOption: { select: { optionCode: true, displayName: true } },
        roleAssignments: {
          where: { roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } },
          orderBy: [{ isPrimary: "desc" }, { activatedAt: "asc" }],
          select: { isPrimary: true, personId: true, person: { select: { displayName: true } } },
        },
        projectPlan: {
          select: {
            versions: {
              where: { status: "ACTIVE" },
              orderBy: { versionNo: "desc" },
              take: 1,
              select: {
                id: true,
                swimlaneName: true,
                templateVersion: { select: { lifecycleTemplate: { select: { templateName: true } } } },
              },
            },
          },
        },
      },
  });
  const planVersion = project?.projectPlan?.versions[0];
  if (!project?.projectCode || !planVersion) return null;

  const stages = await client.projectStageVersion.findMany({
        where: { projectPlanVersionId: planVersion.id },
        orderBy: { sortOrder: "asc" },
        select: {
          projectStageId: true,
          stageCode: true,
          stageName: true,
          applicability: true,
          plannedStartDate: true,
          plannedEndDate: true,
        },
  });
  const nodes = await client.projectWorkflowStageVersion.findMany({
        where: { projectPlanVersionId: planVersion.id },
        orderBy: { sortOrder: "asc" },
        select: {
          projectWorkflowStageId: true,
          projectWorkflowId: true,
          projectStageId: true,
          taskName: true,
          taskDescription: true,
          applicability: true,
          attachmentRequirement: true,
          plannedStartDate: true,
          plannedEndDate: true,
          roleVersions: { orderBy: { sortOrder: "asc" }, select: { roleCode: true } },
          projectWorkflow: {
            select: {
              versions: {
                where: { projectPlanVersionId: planVersion.id },
                take: 1,
                select: { workflowCode: true, workflowName: true },
              },
            },
          },
          projectWorkflowStage: {
            select: {
              projectStageId: true,
              executionStatus: true,
              rowVersion: true,
              issues: {
                where: { resolvedAt: null, closedAt: null },
                select: { currentRiskLevel: true },
              },
              successorDependencies: {
                where: { projectPlanVersionId: planVersion.id },
                select: { predecessorProjectWorkflowStageId: true },
              },
            },
          },
        },
  });

  return {
      projectId: project.id,
      projectCode: project.projectCode,
      projectName: project.projectName,
      projectStatus: project.status as ProjectExecutionOverview["projectStatus"],
      swimlaneName: planVersion.swimlaneName,
      canEditSwimlane: project.status === "ACTIVE" && (actor.roleCode === "PMO" || (actor.roleCode === "KEY_SUB_I" && project.roleAssignments.some(({ isPrimary, personId }) => isPrimary && personId === actor.personId))),
      basicInformation: {
        applicationCode: project.applicationCode,
        projectSummary: project.projectSummary,
        applicantDisplayName: project.applicant.displayName,
        primaryKeySubIDisplayName: project.roleAssignments.find(({ isPrimary }) => isPrimary)?.person.displayName ?? null,
        otherKeySubIDisplayNames: project.roleAssignments.filter(({ isPrimary }) => !isPrimary).map(({ person }) => person.displayName),
        leadOrganizationName: project.leadOrganizationName,
        sponsorName: project.sponsorName,
        diseaseAreaDisplayName: dictionaryValue(project.diseaseAreaOption, project.diseaseAreaOtherText),
        researchTypeDisplayName: dictionaryValue(project.researchTypeOption, project.researchTypeOtherText),
        plannedEndDate: optionalDateOnly(project.plannedEndDate),
        fundingRecordAmountCny: project.fundingRecordAmountCny?.toFixed(2) ?? null,
        establishedByDisplayName: project.establishedBy?.displayName ?? null,
        establishedAt: project.establishedAt?.toISOString() ?? null,
        completedAt: project.completedAt?.toISOString() ?? null,
        archivedAt: project.archivedAt?.toISOString() ?? null,
      },
      stages: stages.map((stage) => ({
        stageId: stage.projectStageId,
        stageCode: stage.stageCode,
        stageName: stage.stageName,
        applicability: stage.applicability,
        plannedStartDate: optionalDateOnly(stage.plannedStartDate),
        plannedEndDate: optionalDateOnly(stage.plannedEndDate),
        workflows: nodes
          .filter((node) => node.projectStageId === stage.projectStageId)
          .map((node) => {
            const workflow = node.projectWorkflow.versions[0];
            const issueRisk = aggregateOpenIssueRisk(node.projectWorkflowStage.issues.map(({ currentRiskLevel }) => currentRiskLevel));
            return {
              workflowStageId: node.projectWorkflowStageId,
              rowVersion: node.projectWorkflowStage.rowVersion,
              workflowCode: workflow?.workflowCode ?? "",
              workflowName: workflow?.workflowName ?? "",
              taskName: node.taskName,
              taskDescription: node.taskDescription,
              applicability: node.applicability,
              attachmentRequirement: node.attachmentRequirement,
              plannedStartDate: optionalDateOnly(node.plannedStartDate),
              plannedEndDate: optionalDateOnly(node.plannedEndDate),
              ownerRoles: node.roleVersions
                .map(({ roleCode }) => roleCode)
                .filter((roleCode): roleCode is "PMO" | "DEAN" | "KEY_SUB_I" =>
                  roleCode === "PMO" || roleCode === "DEAN" || roleCode === "KEY_SUB_I",
                ),
              executionStatus: node.projectWorkflowStage.executionStatus,
              ...issueRisk,
              predecessorWorkflowStageIds: node.projectWorkflowStage.successorDependencies.map(
                ({ predecessorProjectWorkflowStageId }) => predecessorProjectWorkflowStageId,
              ),
            };
          }),
      })),
  };
}

async function projectScope(
  client: DatabaseClient,
  actor: CollaborationActor,
  projectId?: string,
): Promise<Prisma.ProjectWhereInput> {
  await requireActiveSession(client, actor);
  const common: Prisma.ProjectWhereInput = {
    ...(projectId ? { id: projectId } : {}),
    projectCode: { not: null },
    status: { in: [...visibleProjectStatuses] },
  };
  if (actor.roleCode === "PMO" || actor.roleCode === "DEAN") {
    await requireActiveGlobalRole(client, actor, actor.roleCode);
    return common;
  }
  if (actor.roleCode !== "KEY_SUB_I") {
    throw new CollaborationError("COLLABORATION_FORBIDDEN");
  }
  return {
    ...common,
    roleAssignments: {
      some: {
        personId: actor.personId,
        roleCode: "KEY_SUB_I",
        assignmentStatus: "ACTIVE",
        person: { accountStatus: "ACTIVE" },
      },
    },
  };
}

async function requireActiveSession(
  client: DatabaseClient,
  actor: CollaborationActor,
): Promise<void> {
  const session = await client.session.findFirst({
    where: {
      id: actor.sessionId,
      personId: actor.personId,
      activeRoleCode: actor.roleCode,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      person: { accountStatus: "ACTIVE" },
    },
    select: { id: true },
  });
  if (!session) throw new CollaborationError("COLLABORATION_FORBIDDEN");
}

async function requireActiveGlobalRole(
  client: DatabaseClient,
  actor: CollaborationActor,
  roleCode: "PMO" | "DEAN",
): Promise<void> {
  const assignment = await client.roleAssignment.findFirst({
    where: {
      personId: actor.personId,
      roleCode,
      projectId: null,
      assignmentStatus: "ACTIVE",
      person: { accountStatus: "ACTIVE" },
    },
    select: { id: true },
  });
  if (!assignment) throw new CollaborationError("COLLABORATION_FORBIDDEN");
}

function mapTimeLimit(setting: {
  id: string;
  projectId: string | null;
  responsibilityType: CollaborationResponsibilityType;
  timeLimitDays: number;
  reminderIntervalDays: number;
  updatedAt: Date;
}): CollaborationTimeLimit {
  return { ...setting, updatedAt: setting.updatedAt.toISOString() };
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function optionalDateOnly(value: Date | null): string | null {
  return value ? dateOnly(value) : null;
}

function dictionaryValue(option: { optionCode: string; displayName: string } | null, otherText: string | null): string | null {
  if (!option) return null;
  return option.optionCode === "OTHER" && otherText ? `${option.displayName}：${otherText}` : option.displayName;
}

function isDatabaseConflict(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error &&
    (error.code === "P2002" || error.code === "P2034"));
}
