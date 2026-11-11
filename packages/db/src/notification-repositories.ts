import {
  CollaborationError,
  type CollaborationActor,
  type NotificationCenterState,
  type NotificationNavigationReference,
  type NotificationRepository,
} from "@researchflow/collaboration";

import type { Prisma } from "../generated/client.js";
import type { ApplicationPrismaClient } from "./client.js";

type Transaction = Prisma.TransactionClient;
type NavigationRow = {
  eventCode: string;
  projectId: string | null;
  issueId: string | null;
  projectWorkflowStageId: string | null;
  workflowUpdateId: string | null;
  workflowCompletionRequestId: string | null;
  projectCompletionRequestId: string | null;
  projectArchiveActivityId: string | null;
  projectWorkflowStage: WorkflowStageRow | null;
  issue: { projectWorkflowStageId: string; projectWorkflowStage: WorkflowStageRow } | null;
  project: { status: string } | null;
};

type WorkflowStageRow = {
  projectWorkflow: {
    versions: { workflowName: string; projectPlanVersion: { status: string } }[];
  };
};

const workflowStageSelect = {
  projectWorkflow: {
    select: {
      versions: {
        orderBy: { projectPlanVersion: { versionNo: "desc" } },
        select: {
          workflowName: true,
          projectPlanVersion: { select: { status: true } },
        },
      },
    },
  },
} satisfies Prisma.ProjectWorkflowStageSelect;

const navigationSelect = {
  eventCode: true,
  projectId: true,
  issueId: true,
  projectWorkflowStageId: true,
  workflowUpdateId: true,
  workflowCompletionRequestId: true,
  projectCompletionRequestId: true,
  projectArchiveActivityId: true,
  projectWorkflowStage: { select: workflowStageSelect },
  issue: {
    select: {
      projectWorkflowStageId: true,
      projectWorkflowStage: { select: workflowStageSelect },
    },
  },
} satisfies Prisma.NotificationSelect;

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly client: ApplicationPrismaClient) {}

  async listForRecipient(actor: CollaborationActor): Promise<NotificationCenterState> {
    return this.client.$transaction(async (tx) => {
      await requireActiveActor(tx, actor);
      const where = visibleNotificationWhere(actor);
      const rows = await tx.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 200,
        select: {
          id: true, title: true, content: true,
          readStatus: true, messageKind: true, actionStatus: true,
          actionCompletionReason: true, createdAt: true, readAt: true,
          ...navigationSelect,
          project: { select: { projectCode: true, status: true } },
        },
      });
      const unread = await tx.notification.count({ where: { ...where, readStatus: "UNREAD" } });
      const pendingAction = await tx.notification.count({ where: { ...where, messageKind: "ACTION", actionStatus: "PENDING" } });
      const informational = await tx.notification.count({ where: { ...where, messageKind: "INFORMATIONAL" } });
      return {
        items: rows.map((row) => ({
          id: row.id,
          eventCode: row.eventCode,
          projectId: row.projectId,
          projectCode: row.project?.projectCode ?? null,
          workflowName: notificationWorkflowName(row),
          title: row.title,
          content: row.content,
          readStatus: row.readStatus,
          messageKind: row.messageKind,
          actionStatus: row.actionStatus,
          actionCompletionReason: row.actionCompletionReason,
          createdAt: row.createdAt.toISOString(),
          readAt: row.readAt?.toISOString() ?? null,
          navigation: notificationNavigation(actor, row),
        })),
        counts: { unread, pendingAction, informational },
      };
    }, { isolationLevel: "Serializable" });
  }

  async markRead(actor: CollaborationActor, notificationId: string): Promise<void> {
    await this.client.$transaction(async (tx) => {
      await requireActiveActor(tx, actor);
      const notification = await tx.notification.findFirst({
        where: { id: notificationId, ...visibleNotificationWhere(actor) },
        select: { id: true, readStatus: true },
      });
      if (!notification) throw new CollaborationError("NOTIFICATION_NOT_FOUND");
      if (notification.readStatus === "UNREAD") {
        await tx.notification.update({ where: { id: notification.id }, data: { readStatus: "READ", readAt: new Date() } });
      }
    }, { isolationLevel: "Serializable" });
  }

  async open(actor: CollaborationActor, notificationId: string): Promise<NotificationNavigationReference | null> {
    return this.client.$transaction(async (tx) => {
      await requireActiveActor(tx, actor);
      const notification = await tx.notification.findFirst({
        where: { id: notificationId, ...visibleNotificationWhere(actor) },
        select: { id: true, readStatus: true, ...navigationSelect, project: { select: { status: true } } },
      });
      if (!notification) throw new CollaborationError("NOTIFICATION_NOT_FOUND");
      if (notification.readStatus === "UNREAD") {
        await tx.notification.update({
          where: { id: notification.id },
          data: { readStatus: "READ", readAt: new Date() },
        });
      }
      return notificationNavigation(actor, notification);
    }, { isolationLevel: "Serializable" });
  }

  async listDeliveryStatus(actor: CollaborationActor) {
    return this.client.$transaction(async (tx) => {
      await requireActivePmo(tx, actor);
      const rows = await tx.notificationOutbox.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 200,
        select: {
          id: true, status: true, attemptCount: true, maxAttempts: true, lastErrorCode: true, createdAt: true, completedAt: true,
          recipientEmailSnapshot: true,
          recipient: { select: { displayName: true } },
          notification: { select: { eventCode: true, project: { select: { projectCode: true } } } },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        projectCode: row.notification.project?.projectCode ?? null,
        recipientDisplayName: row.recipient.displayName,
        recipientEmailPresent: Boolean(row.recipientEmailSnapshot),
        eventCode: row.notification.eventCode,
        status: row.status,
        attemptCount: row.attemptCount,
        maxAttempts: row.maxAttempts,
        lastErrorCode: row.lastErrorCode,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
      }));
    }, { isolationLevel: "Serializable" });
  }

  async listAuditTrail(actor: CollaborationActor) {
    return this.client.$transaction(async (tx) => {
      await requireActivePmo(tx, actor);
      const rows = await tx.auditLog.findMany({
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 300,
        select: {
          id: true, occurredAt: true, actorRoleCode: true, actionCode: true, result: true,
          entityType: true, summary: true, failureCode: true,
          actor: { select: { displayName: true } },
          project: { select: { projectCode: true } },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        actorDisplayName: row.actor?.displayName ?? null,
        actorRoleCode: row.actorRoleCode,
        actionCode: row.actionCode,
        result: row.result,
        projectCode: row.project?.projectCode ?? null,
        entityType: row.entityType,
        summary: row.summary,
        failureCode: row.failureCode,
      }));
    }, { isolationLevel: "Serializable" });
  }
}

function notificationWorkflowName(row: NavigationRow): string | null {
  const stage = row.projectWorkflowStage ?? row.issue?.projectWorkflowStage;
  const versions = stage?.projectWorkflow.versions ?? [];
  return versions.find((version) => version.projectPlanVersion.status === "ACTIVE")?.workflowName
    ?? versions[0]?.workflowName
    ?? null;
}

function visibleNotificationWhere(actor: CollaborationActor): Prisma.NotificationWhereInput {
  return {
    recipientPersonId: actor.personId,
    recipientRoleCode: actor.roleCode,
    ...(actor.roleCode === "KEY_SUB_I" ? {
      OR: [{
        eventCode: { startsWith: "PROJECT_APPLICATION_" },
        project: { applicantPersonId: actor.personId },
      }, {
        project: { roleAssignments: { some: {
          personId: actor.personId,
          roleCode: "KEY_SUB_I",
          assignmentStatus: "ACTIVE",
          person: { accountStatus: "ACTIVE" },
        } } },
      }],
    } : {}),
  };
}

function notificationNavigation(actor: CollaborationActor, row: NavigationRow): NotificationNavigationReference | null {
  if (!row.projectId) return null;
  if (row.eventCode.startsWith("PROJECT_APPLICATION_") && row.project && ["ACTIVE", "CLOSING", "COMPLETED", "ARCHIVED"].includes(row.project.status)) {
    return { kind: "PROJECT_EXECUTION", projectId: row.projectId };
  }
  if (row.eventCode.startsWith("PROJECT_APPLICATION_") && row.eventCode !== "PROJECT_APPLICATION_APPROVED") {
    return {
      kind: "PROJECT_APPLICATION",
      projectId: row.projectId,
      perspective: actor.roleCode === "PMO" ? "PMO_REVIEW" : "APPLICANT",
    };
  }
  const workflowStageId = row.projectWorkflowStageId ?? row.issue?.projectWorkflowStageId;
  if (row.issueId && workflowStageId) {
    return { kind: "PROJECT_EXECUTION", projectId: row.projectId, projectWorkflowStageId: workflowStageId, tab: "issues", issueId: row.issueId };
  }
  if (workflowStageId) {
    return {
      kind: "PROJECT_EXECUTION",
      projectId: row.projectId,
      projectWorkflowStageId: workflowStageId,
      tab: "progress",
      ...(row.workflowCompletionRequestId ? { completionRequestId: row.workflowCompletionRequestId } : {}),
      ...(row.workflowUpdateId ? { progressRecordId: row.workflowUpdateId } : {}),
    };
  }
  if (row.projectCompletionRequestId || row.projectArchiveActivityId) {
    return { kind: "PROJECT_EXECUTION", projectId: row.projectId, panel: "closure" };
  }
  return { kind: "PROJECT_EXECUTION", projectId: row.projectId };
}

async function requireActiveActor(tx: Transaction, actor: CollaborationActor): Promise<void> {
  const session = await tx.session.findFirst({
    where: { id: actor.sessionId, personId: actor.personId, activeRoleCode: actor.roleCode, revokedAt: null, expiresAt: { gt: new Date() }, person: { accountStatus: "ACTIVE" } },
    select: { id: true },
  });
  if (!session) throw new CollaborationError("COLLABORATION_FORBIDDEN");
  if (actor.roleCode === "KEY_SUB_I") {
    const assignment = await tx.roleAssignment.findFirst({
      where: { personId: actor.personId, roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE" },
      select: { id: true },
    });
    const eligibility = await tx.roleEligibility.findFirst({
      where: { personId: actor.personId, roleCode: "KEY_SUB_I", status: "ACTIVE" },
      select: { id: true },
    });
    if (!assignment && !eligibility) throw new CollaborationError("COLLABORATION_FORBIDDEN");
    return;
  }
  const role = await tx.roleAssignment.findFirst({
    where: { personId: actor.personId, roleCode: actor.roleCode, assignmentStatus: "ACTIVE", projectId: null },
    select: { id: true },
  });
  if (!role) throw new CollaborationError("COLLABORATION_FORBIDDEN");
}

async function requireActivePmo(tx: Transaction, actor: CollaborationActor): Promise<void> {
  if (actor.roleCode !== "PMO") throw new CollaborationError("COLLABORATION_FORBIDDEN");
  await requireActiveActor(tx, actor);
}
