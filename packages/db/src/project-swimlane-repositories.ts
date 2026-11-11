import { randomUUID } from "node:crypto";

import {
  CollaborationError,
  validateWorkflowDependencyGraph,
  type CollaborationActor,
  type EditableProjectSwimlane,
  type ProjectSwimlaneApplyResult,
  type ProjectSwimlaneChangeCommand,
  type ProjectSwimlaneImpact,
  type ProjectSwimlaneNodeInput,
  type ProjectSwimlaneRepository,
} from "@researchflow/collaboration";

import type { Prisma } from "../generated/client.js";
import type { ApplicationPrismaClient } from "./client.js";

type Transaction = Prisma.TransactionClient;
type DatabaseClient = ApplicationPrismaClient | Transaction;
const processingCompletionStatuses = ["WAITING_FOR_PREDECESSOR", "PENDING_PMO_REVIEW", "ISSUE_RESOLUTION_REQUIRED", "PREDECESSOR_RETURNED_CONFIRMATION", "RETURNED_FOR_RESUBMISSION"] as const;

const activeGraphInclude = {
  stageVersions: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] },
  workflowVersions: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] },
  workflowStageVersions: {
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
    include: {
      roleVersions: { orderBy: { sortOrder: "asc" as const } },
      projectWorkflowStage: {
        select: {
          executionStatus: true,
          rowVersion: true,
          _count: { select: { workflowUpdates: true, completionRequests: true, issues: true, attachmentDrafts: true } },
        },
      },
    },
  },
  workflowStageDependencies: true,
  projectPlan: { select: { projectId: true } },
} satisfies Prisma.ProjectPlanVersionInclude;

type ActiveGraph = Prisma.ProjectPlanVersionGetPayload<{ include: typeof activeGraphInclude }>;

export class PrismaProjectSwimlaneRepository implements ProjectSwimlaneRepository {
  constructor(private readonly client: ApplicationPrismaClient) {}

  getEditableSwimlane(actor: CollaborationActor, projectId: string): Promise<EditableProjectSwimlane | null> {
    return this.client.$transaction(async (transaction) => {
      const project = await requireReadableProject(transaction, actor, projectId);
      if (!project) return null;
      const active = await loadActiveGraph(transaction, projectId);
      if (!active) return null;
      return mapEditable(project.status as EditableProjectSwimlane["projectStatus"], await canEditProject(transaction, actor, projectId, project.status), active);
    }, { isolationLevel: "Serializable" });
  }

  previewSwimlaneChange(actor: CollaborationActor, input: ProjectSwimlaneChangeCommand): Promise<ProjectSwimlaneImpact> {
    return this.client.$transaction(async (transaction) => {
      await requireWritableProject(transaction, actor, input.projectId);
      const active = await requireExpectedGraph(transaction, input.projectId, input.expectedRevision);
      validateGraph(active, input);
      return calculateImpact(transaction, input.projectId, active, input);
    }, { isolationLevel: "Serializable" });
  }

  async applySwimlaneChange(actor: CollaborationActor, input: ProjectSwimlaneChangeCommand): Promise<ProjectSwimlaneApplyResult> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const project = await requireWritableProject(transaction, actor, input.projectId);
        const active = await requireExpectedGraph(transaction, input.projectId, input.expectedRevision);
        validateGraph(active, input);
        const impact = await calculateImpact(transaction, input.projectId, active, input);
        const activatedAt = new Date();
        const nextVersionNo = (await transaction.projectPlanVersion.aggregate({ where: { projectPlanId: active.projectPlanId }, _max: { versionNo: true } }))._max.versionNo! + 1;
        const candidate = await transaction.projectPlanVersion.create({ data: {
          projectPlanId: active.projectPlanId,
          versionNo: nextVersionNo,
          baseVersionId: active.id,
          templateVersionId: active.templateVersionId,
          swimlaneName: input.name,
          status: "DRAFT",
          createdByPersonId: actor.personId,
        } });

        await materializeGraph(transaction, input.projectId, active.projectPlanId, candidate.id, input);
        const request = await transaction.projectPlanChangeRequest.create({ data: {
          projectId: input.projectId,
          projectPlanId: active.projectPlanId,
          candidatePlanVersionId: candidate.id,
          changeReason: input.reason,
          status: "ACTIVATED",
          submittedByPersonId: actor.personId,
          submittedRoleCode: actor.roleCode,
          submittedAt: activatedAt,
          activatedAt,
          closedAt: activatedAt,
        } });
        const activity = await transaction.projectPlanChangeActivity.create({ data: {
          requestId: request.id,
          activityType: "ACTIVATED",
          actorPersonId: actor.personId,
          actorRoleCode: actor.roleCode,
          content: input.reason,
        } });

        const superseded = await transaction.projectPlanVersion.updateMany({
          where: { id: active.id, projectPlanId: active.projectPlanId, status: "ACTIVE" },
          data: { status: "SUPERSEDED" },
        });
        if (superseded.count !== 1) throw new CollaborationError("PROJECT_SWIMLANE_CONFLICT");
        await transaction.projectPlanVersion.update({ where: { id: candidate.id }, data: { status: "ACTIVE", activatedAt } });

        const notApplicableNodeIds = input.nodes.filter((node) => node.applicability === "NOT_APPLICABLE").map((node) => node.id);
        const completionRequests = notApplicableNodeIds.length ? await transaction.workflowCompletionRequest.findMany({
          where: { projectId: input.projectId, projectWorkflowStageId: { in: notApplicableNodeIds }, status: { in: [...processingCompletionStatuses] } },
          select: { id: true, rowVersion: true },
        }) : [];
        for (const completion of completionRequests) {
          const changed = await transaction.workflowCompletionRequest.updateMany({
            where: { id: completion.id, rowVersion: completion.rowVersion, status: { in: [...processingCompletionStatuses] } },
            data: { status: "TERMINATED_BY_PLAN_CHANGE", terminatedByPlanChangeRequestId: request.id, closedAt: activatedAt, rowVersion: { increment: 1 } },
          });
          if (changed.count !== 1) throw new CollaborationError("PROJECT_SWIMLANE_CONFLICT");
          await transaction.workflowCompletionReviewRound.updateMany({ where: { completionRequestId: completion.id, status: { in: ["ACTIVE", "PAUSED"] } }, data: { status: "TERMINATED", completedAt: activatedAt, completedByPersonId: actor.personId, decisionComment: "项目泳道修改后节点不再适用" } });
          await transaction.notification.updateMany({ where: { workflowCompletionRequestId: completion.id, actionStatus: "PENDING" }, data: { actionStatus: "COMPLETED", actionCompletedAt: activatedAt, actionCompletionReason: "项目泳道修改后节点不再适用" } });
          const sequenceNo = (await transaction.workflowCompletionActivity.aggregate({ where: { completionRequestId: completion.id }, _max: { sequenceNo: true } }))._max.sequenceNo ?? 0;
          await transaction.workflowCompletionActivity.create({ data: { projectId: input.projectId, completionRequestId: completion.id, sequenceNo: sequenceNo + 1, activityType: "TERMINATED_BY_PLAN_CHANGE", actorPersonId: actor.personId, actorRoleCode: actor.roleCode, content: input.reason } });
        }

        await createResultNotifications(transaction, actor, project.projectCode!, project.projectName, input, request.id, activity.id, activatedAt, impact);
        await transaction.auditLog.create({ data: {
          actorPersonId: actor.personId,
          actorRoleCode: actor.roleCode,
          sessionId: actor.sessionId,
          actionCode: "PROJECT_SWIMLANE_UPDATED",
          result: "SUCCESS",
          projectId: input.projectId,
          entityType: "PROJECT_PLAN_CHANGE_REQUEST",
          entityId: request.id,
          entityBusinessCode: project.projectCode,
          summary: `项目泳道已直接生效：${input.name}`,
          changedFields: ["swimlane_name", "stages", "workflows", "nodes", "active_plan_version"],
          afterSnapshot: { swimlaneName: input.name, reason: input.reason, impact: { ...impact } } as Prisma.InputJsonValue,
          correlationId: randomUUID(),
        } });
        return { swimlaneName: input.name, activatedAt: activatedAt.toISOString(), impact };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error instanceof CollaborationError) throw error;
      if (error && typeof error === "object" && "code" in error && (error.code === "P2002" || error.code === "P2034")) {
        throw new CollaborationError("PROJECT_SWIMLANE_CONFLICT");
      }
      throw error;
    }
  }
}

async function loadActiveGraph(client: DatabaseClient, projectId: string): Promise<ActiveGraph | null> {
  return client.projectPlanVersion.findFirst({
    where: { projectPlan: { projectId }, status: "ACTIVE" },
    orderBy: { versionNo: "desc" },
    include: activeGraphInclude,
  });
}

async function requireExpectedGraph(client: DatabaseClient, projectId: string, expectedRevision: string): Promise<ActiveGraph> {
  const active = await loadActiveGraph(client, projectId);
  if (!active || active.id !== expectedRevision) throw new CollaborationError("PROJECT_SWIMLANE_CONFLICT");
  return active;
}

async function requireReadableProject(client: DatabaseClient, actor: CollaborationActor, projectId: string) {
  await requireSession(client, actor);
  const common: Prisma.ProjectWhereInput = { id: projectId, projectCode: { not: null }, status: { in: ["ACTIVE", "CLOSING", "COMPLETED", "ARCHIVED"] } };
  if (actor.roleCode === "PMO" || actor.roleCode === "DEAN") {
    const globalRole = await client.roleAssignment.findFirst({ where: { personId: actor.personId, roleCode: actor.roleCode, projectId: null, assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } }, select: { id: true } });
    if (!globalRole) throw new CollaborationError("PROJECT_SWIMLANE_FORBIDDEN");
    return client.project.findFirst({ where: common, select: { id: true, projectCode: true, projectName: true, status: true } });
  }
  return client.project.findFirst({ where: { ...common, roleAssignments: { some: { personId: actor.personId, roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } } } }, select: { id: true, projectCode: true, projectName: true, status: true } });
}

async function canEditProject(client: DatabaseClient, actor: CollaborationActor, projectId: string, status: string): Promise<boolean> {
  if (status !== "ACTIVE") return false;
  if (actor.roleCode === "PMO") return true;
  if (actor.roleCode !== "KEY_SUB_I") return false;
  return Boolean(await client.roleAssignment.findFirst({ where: { projectId, personId: actor.personId, roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE", isPrimary: true, person: { accountStatus: "ACTIVE" } }, select: { id: true } }));
}

async function requireWritableProject(client: DatabaseClient, actor: CollaborationActor, projectId: string) {
  const project = await requireReadableProject(client, actor, projectId);
  if (!project) throw new CollaborationError("PROJECT_NOT_FOUND");
  if (project.status !== "ACTIVE") throw new CollaborationError("PROJECT_NOT_ACTIVE");
  if (!(await canEditProject(client, actor, projectId, project.status))) throw new CollaborationError("PROJECT_SWIMLANE_FORBIDDEN");
  return project;
}

async function requireSession(client: DatabaseClient, actor: CollaborationActor): Promise<void> {
  const session = await client.session.findFirst({ where: { id: actor.sessionId, personId: actor.personId, activeRoleCode: actor.roleCode, revokedAt: null, expiresAt: { gt: new Date() }, person: { accountStatus: "ACTIVE" } }, select: { id: true } });
  if (!session) throw new CollaborationError("PROJECT_SWIMLANE_FORBIDDEN");
}

function mapEditable(projectStatus: EditableProjectSwimlane["projectStatus"], canEdit: boolean, active: ActiveGraph): EditableProjectSwimlane {
  const dependencyMap = new Map<string, string[]>();
  for (const edge of active.workflowStageDependencies) dependencyMap.set(edge.successorProjectWorkflowStageId, [...(dependencyMap.get(edge.successorProjectWorkflowStageId) ?? []), edge.predecessorProjectWorkflowStageId]);
  return {
    projectId: active.projectPlan.projectId,
    projectStatus,
    name: active.swimlaneName,
    expectedRevision: active.id,
    canEdit,
    stages: active.stageVersions.map((stage) => ({ id: stage.projectStageId, code: stage.stageCode, name: stage.stageName, sortOrder: stage.sortOrder, applicability: stage.applicability, plannedStartDate: optionalDate(stage.plannedStartDate), plannedEndDate: optionalDate(stage.plannedEndDate) })),
    workflows: active.workflowVersions.map((workflow) => ({ id: workflow.projectWorkflowId, code: workflow.workflowCode, name: workflow.workflowName, description: workflow.description, sortOrder: workflow.sortOrder, enabled: workflow.enabled })),
    nodes: active.workflowStageVersions.map((node) => ({ id: node.projectWorkflowStageId, workflowId: node.projectWorkflowId, stageId: node.projectStageId, taskName: node.taskName, taskDescription: node.taskDescription, sortOrder: node.sortOrder, applicability: node.applicability, plannedStartDate: optionalDate(node.plannedStartDate), plannedEndDate: optionalDate(node.plannedEndDate), updateIntervalDays: node.updateIntervalDays, overdueReminderIntervalDays: node.overdueReminderIntervalDays, attachmentRequirement: node.attachmentRequirement, ownerRoles: node.roleVersions.map(({ roleCode }) => roleCode).filter(isSwimlaneOwnerRole), predecessorIds: dependencyMap.get(node.projectWorkflowStageId) ?? [], executionStatus: node.projectWorkflowStage.executionStatus, hasExecutionHistory: hasHistory(node) })),
  };
}

function validateGraph(active: ActiveGraph, input: ProjectSwimlaneChangeCommand): void {
  const stageIds = uniqueIds(input.stages.map(({ id }) => id));
  const workflowIds = uniqueIds(input.workflows.map(({ id }) => id));
  const nodeIds = uniqueIds(input.nodes.map(({ id }) => id));
  if (!stageIds || !workflowIds || !nodeIds) throw new CollaborationError("PROJECT_SWIMLANE_INVALID_GRAPH");
  if (input.stages.some((stage) => !stage.name || stage.sortOrder < 0 || invalidDateRange(stage.plannedStartDate, stage.plannedEndDate))) throw new CollaborationError("PROJECT_SWIMLANE_INVALID_GRAPH");
  if (input.workflows.some((workflow) => !workflow.name || workflow.sortOrder < 0)) throw new CollaborationError("PROJECT_SWIMLANE_INVALID_GRAPH");
  if (input.nodes.some((node) => !node.taskName || !stageIds.has(node.stageId) || !workflowIds.has(node.workflowId) || node.sortOrder < 0 || invalidDateRange(node.plannedStartDate, node.plannedEndDate) || node.overdueReminderIntervalDays <= 0 || (node.updateIntervalDays !== null && node.updateIntervalDays <= 0) || !node.ownerRoles.length || node.ownerRoles.some((role) => !isSwimlaneOwnerRole(role)))) throw new CollaborationError("PROJECT_SWIMLANE_INVALID_GRAPH");
  const submittedById = new Map(input.nodes.map((node) => [node.id, node]));
  const currentPredecessors = new Map<string, string[]>();
  for (const edge of active.workflowStageDependencies) currentPredecessors.set(edge.successorProjectWorkflowStageId, [...(currentPredecessors.get(edge.successorProjectWorkflowStageId) ?? []), edge.predecessorProjectWorkflowStageId]);
  for (const current of active.workflowStageVersions) {
    const submitted = submittedById.get(current.projectWorkflowStageId);
    if (current.projectWorkflowStage.executionStatus === "COMPLETED") {
      if (!submitted || completedRestrictedFieldsChanged(current, submitted, currentPredecessors.get(current.projectWorkflowStageId) ?? [])) throw new CollaborationError("PROJECT_SWIMLANE_COMPLETED_NODE_RESTRICTED");
    } else if (hasHistory(current) && !submitted) {
      throw new CollaborationError("PROJECT_SWIMLANE_INVALID_GRAPH");
    }
  }
  const edges = input.nodes.flatMap((node) => node.predecessorIds.map((predecessorId) => [predecessorId, node.id] as const));
  try {
    validateWorkflowDependencyGraph(input.nodes.map(({ id, applicability }) => ({ id, applicability })), edges);
  } catch {
    throw new CollaborationError("PROJECT_SWIMLANE_INVALID_GRAPH");
  }
  for (const stage of input.stages.filter(({ applicability }) => applicability !== "NOT_APPLICABLE")) {
    if (!input.nodes.some((node) => node.stageId === stage.id && node.applicability === "REQUIRED")) throw new CollaborationError("PROJECT_SWIMLANE_INVALID_GRAPH");
  }
}

function completedRestrictedFieldsChanged(current: ActiveGraph["workflowStageVersions"][number], submitted: ProjectSwimlaneNodeInput, currentPredecessors: string[]): boolean {
  return current.projectWorkflowId !== submitted.workflowId || current.projectStageId !== submitted.stageId || current.applicability !== submitted.applicability || optionalDate(current.plannedStartDate) !== submitted.plannedStartDate || optionalDate(current.plannedEndDate) !== submitted.plannedEndDate || current.updateIntervalDays !== submitted.updateIntervalDays || current.overdueReminderIntervalDays !== submitted.overdueReminderIntervalDays || current.attachmentRequirement !== submitted.attachmentRequirement || JSON.stringify(current.roleVersions.map(({ roleCode }) => roleCode)) !== JSON.stringify(submitted.ownerRoles) || JSON.stringify([...currentPredecessors].sort()) !== JSON.stringify([...submitted.predecessorIds].sort());
}

async function calculateImpact(client: DatabaseClient, projectId: string, active: ActiveGraph, input: ProjectSwimlaneChangeCommand): Promise<ProjectSwimlaneImpact> {
  const current = mapEditable("ACTIVE", true, active);
  const currentStage = new Map(current.stages.map((item) => [item.id, item]));
  const currentWorkflow = new Map(current.workflows.map((item) => [item.id, item]));
  const currentNode = new Map(current.nodes.map((item) => [item.id, item]));
  const becomingNotApplicable = input.nodes.filter((node) => node.applicability === "NOT_APPLICABLE" && currentNode.get(node.id)?.applicability !== "NOT_APPLICABLE").map(({ id }) => id);
  const completionRequestsToTerminate = becomingNotApplicable.length
    ? await client.workflowCompletionRequest.count({ where: { projectId, projectWorkflowStageId: { in: becomingNotApplicable }, status: { in: [...processingCompletionStatuses] } } })
    : 0;
  const openIssuesPreserved = await client.issue.count({ where: { projectId, resolvedAt: null, closedAt: null } });
  return {
    swimlaneNameChanges: active.swimlaneName === input.name ? 0 : 1,
    stageChanges: countChanges(currentStage, input.stages),
    workflowChanges: countChanges(currentWorkflow, input.workflows),
    nodeChanges: countChanges(currentNode, input.nodes),
    nodesWithHistory: current.nodes.filter(({ hasExecutionHistory }) => hasExecutionHistory).length,
    nodesBecomingNotApplicable: becomingNotApplicable.length,
    completionRequestsToTerminate,
    openIssuesPreserved,
    scheduleOrResponsibilityChanges: input.nodes.filter((node) => { const old = currentNode.get(node.id); return old && (old.plannedStartDate !== node.plannedStartDate || old.plannedEndDate !== node.plannedEndDate || old.updateIntervalDays !== node.updateIntervalDays || old.overdueReminderIntervalDays !== node.overdueReminderIntervalDays || old.attachmentRequirement !== node.attachmentRequirement || JSON.stringify(old.ownerRoles) !== JSON.stringify(node.ownerRoles) || JSON.stringify(old.predecessorIds) !== JSON.stringify(node.predecessorIds)); }).length,
  };
}

async function materializeGraph(client: Transaction, projectId: string, projectPlanId: string, planVersionId: string, input: ProjectSwimlaneChangeCommand): Promise<void> {
  const existingStageIds = new Set((await client.projectStage.findMany({ where: { projectId, projectPlanId }, select: { id: true } })).map(({ id }) => id));
  const existingWorkflowIds = new Set((await client.projectWorkflow.findMany({ where: { projectId, projectPlanId }, select: { id: true } })).map(({ id }) => id));
  const existingNodeIds = new Set((await client.projectWorkflowStage.findMany({ where: { projectId, projectPlanId }, select: { id: true } })).map(({ id }) => id));
  for (const stage of input.stages) {
    if (!existingStageIds.has(stage.id)) await client.projectStage.create({ data: { id: stage.id, projectId, projectPlanId, sourceStageTemplateId: null } });
    await client.projectStageVersion.create({ data: { projectPlanVersionId: planVersionId, projectStageId: stage.id, stageCode: stage.code, stageName: stage.name, sortOrder: stage.sortOrder, applicability: stage.applicability, plannedStartDate: parseDate(stage.plannedStartDate), plannedEndDate: parseDate(stage.plannedEndDate) } });
  }
  for (const workflow of input.workflows) {
    if (!existingWorkflowIds.has(workflow.id)) await client.projectWorkflow.create({ data: { id: workflow.id, projectId, projectPlanId, sourceWorkflowTemplateId: null, workflowType: "PROJECT_CUSTOM" } });
    await client.projectWorkflowVersion.create({ data: { projectPlanVersionId: planVersionId, projectWorkflowId: workflow.id, workflowCode: workflow.code, workflowName: workflow.name, description: workflow.description, sortOrder: workflow.sortOrder, enabled: workflow.enabled } });
  }
  for (const node of input.nodes) {
    if (!existingNodeIds.has(node.id)) await client.projectWorkflowStage.create({ data: { id: node.id, projectId, projectPlanId, projectWorkflowId: node.workflowId, projectStageId: node.stageId, executionStatus: "NOT_STARTED" } });
    const version = await client.projectWorkflowStageVersion.create({ data: { projectPlanVersionId: planVersionId, projectWorkflowStageId: node.id, projectWorkflowId: node.workflowId, projectStageId: node.stageId, taskName: node.taskName, taskDescription: node.taskDescription, plannedStartDate: parseDate(node.plannedStartDate), plannedEndDate: parseDate(node.plannedEndDate), updateIntervalDays: node.updateIntervalDays, overdueReminderIntervalDays: node.overdueReminderIntervalDays, sortOrder: node.sortOrder, applicability: node.applicability, attachmentRequirement: node.attachmentRequirement } });
    await client.projectWorkflowStageRoleVersion.createMany({ data: node.ownerRoles.map((roleCode, sortOrder) => ({ projectWorkflowStageVersionId: version.id, roleCode, sortOrder })) });
  }
  const edges = input.nodes.flatMap((node) => node.predecessorIds.map((predecessorId) => ({ projectId, projectPlanVersionId: planVersionId, predecessorProjectWorkflowStageId: predecessorId, successorProjectWorkflowStageId: node.id })));
  if (edges.length) await client.projectWorkflowStageDependencyVersion.createMany({ data: edges });
}

async function createResultNotifications(client: Transaction, actor: CollaborationActor, projectCode: string, projectName: string, input: ProjectSwimlaneChangeCommand, requestId: string, activityId: string, activatedAt: Date, impact: ProjectSwimlaneImpact): Promise<void> {
  const assignments = await client.roleAssignment.findMany({
    where: { assignmentStatus: "ACTIVE", personId: { not: actor.personId }, person: { accountStatus: "ACTIVE" }, OR: [{ projectId: input.projectId }, { projectId: null, roleCode: "PMO" }] },
    select: { personId: true, roleCode: true },
  });
  const recipients = new Map<string, { personId: string; roleCode: (typeof assignments)[number]["roleCode"] }>();
  for (const assignment of assignments) if (assignment.roleCode !== "DEAN") recipients.set(`${assignment.personId}:${assignment.roleCode}`, assignment);
  const summary = `${actor.roleCode} 已因“${input.reason}”修改项目泳道；阶段 ${impact.stageChanges} 项、工作流 ${impact.workflowChanges} 项、节点 ${impact.nodeChanges} 项。`;
  for (const recipient of recipients.values()) {
    await client.notification.create({ data: { recipientPersonId: recipient.personId, recipientRoleCode: recipient.roleCode, notificationType: "PROJECT_REVIEW_NOTICE", eventCode: "PROJECT_SWIMLANE_UPDATED", triggeredByPersonId: actor.personId, triggeredByRoleCode: actor.roleCode, projectId: input.projectId, projectPlanChangeRequestId: requestId, projectPlanChangeActivityId: activityId, title: `${projectCode} 项目泳道已更新`, content: `${projectName} · ${input.name}。${summary}`, eventKey: `project-swimlane-updated:${requestId}:${recipient.roleCode}`, messageKind: "INFORMATIONAL", actionStatus: "NOT_APPLICABLE", createdAt: activatedAt } });
  }
}

function hasHistory(node: ActiveGraph["workflowStageVersions"][number]): boolean {
  const count = node.projectWorkflowStage._count;
  return node.projectWorkflowStage.executionStatus !== "NOT_STARTED" || count.workflowUpdates + count.completionRequests + count.issues + count.attachmentDrafts > 0;
}

function uniqueIds(ids: string[]): Set<string> | null { const set = new Set(ids); return set.size === ids.length && ids.every(Boolean) ? set : null; }
function invalidDateRange(start: string | null, end: string | null): boolean { return Boolean(start && end && start > end); }
function parseDate(value: string | null): Date | null { return value ? new Date(`${value}T00:00:00.000Z`) : null; }
function optionalDate(value: Date | null): string | null { return value?.toISOString().slice(0, 10) ?? null; }
function countChanges<T extends { id: string }>(current: Map<string, T>, submitted: T[]): number { return submitted.filter((item) => JSON.stringify(current.get(item.id)) !== JSON.stringify(item)).length + [...current.keys()].filter((id) => !submitted.some((item) => item.id === id)).length; }
function isSwimlaneOwnerRole(value: string): value is ProjectSwimlaneNodeInput["ownerRoles"][number] { return value === "PMO" || value === "DEAN" || value === "KEY_SUB_I" || value === "CRC" || value === "STATISTICIAN" || value === "COLLABORATION_LEAD"; }
