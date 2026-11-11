import { randomUUID } from "node:crypto";

import type { NotificationEventCode } from "@researchflow/collaboration";

import type { Prisma } from "../generated/client.js";
import type { ApplicationPrismaClient } from "./client.js";

export interface NotificationEmail {
  to: string;
  subject: string;
  text: string;
  actionUrl: string;
  idempotencyKey: string;
}

export interface NotificationEmailTransport {
  send(message: NotificationEmail): Promise<{ providerMessageId: string }>;
}

interface ClaimedOutbox {
  id: string;
  recipientEmailSnapshot: string | null;
  payload: unknown;
  eventKey: string;
  attemptCount: number;
  maxAttempts: number;
}

export class PrismaNotificationWorkerService {
  constructor(
    private readonly client: ApplicationPrismaClient,
    private readonly transport: NotificationEmailTransport,
    private readonly publicBaseUrl: string,
  ) {}

  async deliverClaimedBatch(input: { workerId: string; limit: number; leaseMs: number }): Promise<void> {
    if (!input.workerId.trim() || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100 || !Number.isInteger(input.leaseMs) || input.leaseMs < 1_000) return;
    const claimed = await this.claim(input);
    for (const item of claimed) await this.deliver(item, input.workerId);
  }

  async runScheduledReminder(scheduledFor: Date, workerId: string, leaseMs: number): Promise<void> {
    if (!workerId.trim() || !Number.isInteger(leaseMs) || leaseMs < 1_000) return;
    const occurrence = shanghaiDayStart(scheduledFor);
    const runId = await this.claimReminderRun(occurrence, workerId, leaseMs);
    if (!runId) return;
    try {
      const created = await this.client.$transaction(async (tx) => {
        const candidates = await responsibilityCandidates(tx, occurrence);
        let notificationCreatedCount = 0;
        for (const candidate of candidates) {
          const recipients = await recipientsForCandidate(tx, candidate);
          for (const recipient of recipients) {
            const eventKey = `REMINDER:${candidate.eventCode}:${candidate.sourceId}:${occurrence.toISOString()}:${recipient.personId}:${recipient.roleCode}`;
            const notification = await createNotificationIfMissing(tx, {
              recipientPersonId: recipient.personId,
              recipientRoleCode: recipient.roleCode,
              notificationType: candidate.notificationType,
              eventCode: candidate.eventCode,
              projectId: candidate.projectId,
              projectWorkflowStageId: candidate.projectWorkflowStageId,
              workflowCompletionRequestId: candidate.workflowCompletionRequestId,
              workflowCompletionReviewRoundId: candidate.workflowCompletionReviewRoundId,
              projectCompletionRequestId: candidate.projectCompletionRequestId,
              projectCompletionReviewRoundId: candidate.projectCompletionReviewRoundId,
              issueHandlingStateId: candidate.issueHandlingStateId,
              title: candidate.title,
              content: candidate.content,
              eventKey,
              messageKind: "ACTION",
              actionStatus: "PENDING",
              actionGroupKey: candidate.actionGroupKey,
              reminderRunId: runId,
            });
            if (!notification) continue;
            notificationCreatedCount += 1;
            if (candidate.emailRequired) await tx.notificationOutbox.create({ data: {
              notificationId: notification.id,
              recipientPersonId: recipient.personId,
              recipientEmailSnapshot: recipient.email,
              templateCode: "COLLABORATION_OVERDUE_V1",
              eventKey: `${eventKey}:EMAIL`,
              payload: { subject: candidate.title, text: candidate.content, actionPath: `/workspace/projects/${candidate.projectId}/execution` },
              nextAttemptAt: occurrence,
            } });
          }
        }
        await tx.reminderRun.updateMany({ where: { id: runId, status: "RUNNING", leaseOwner: workerId }, data: { status: "COMPLETED", candidateCount: candidates.length, notificationCreatedCount, completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, nextAttemptAt: null } });
        return notificationCreatedCount;
      }, { isolationLevel: "Serializable" });
      void created;
    } catch (error) {
      const run = await this.client.reminderRun.findUnique({ where: { id: runId }, select: { attemptCount: true, maxAttempts: true } });
      const final = !run || run.attemptCount >= run.maxAttempts;
      await this.client.reminderRun.updateMany({ where: { id: runId, status: "RUNNING", leaseOwner: workerId }, data: { status: "FAILED", completedAt: new Date(), lastError: safeErrorCode(error), nextAttemptAt: final ? null : new Date(Date.now() + retryDelayMs(run?.attemptCount ?? 1)), leaseOwner: null, leaseExpiresAt: null } });
      throw error;
    }
  }

  private async claimReminderRun(occurrence: Date, workerId: string, leaseMs: number): Promise<string | null> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    const existing = await this.client.reminderRun.findUnique({ where: { scheduledFor: occurrence }, select: { id: true } });
    if (!existing) {
      try {
        const created = await this.client.reminderRun.create({ data: { scheduledFor: occurrence, startedAt: now, status: "RUNNING", attemptCount: 1, leaseOwner: workerId, leaseExpiresAt } });
        return created.id;
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
      }
    }
    const claimed = await this.client.reminderRun.updateMany({
      where: {
        scheduledFor: occurrence,
        attemptCount: { lt: 5 },
        OR: [
          { status: "RUNNING", leaseExpiresAt: { lte: now } },
          { status: "FAILED", nextAttemptAt: { lte: now } },
          { status: "PENDING", nextAttemptAt: null },
        ],
      },
      data: { status: "RUNNING", attemptCount: { increment: 1 }, startedAt: now, completedAt: null, lastError: null, leaseOwner: workerId, leaseExpiresAt },
    });
    if (claimed.count !== 1) return null;
    return (await this.client.reminderRun.findUniqueOrThrow({ where: { scheduledFor: occurrence }, select: { id: true } })).id;
  }

  private async claim(input: { workerId: string; limit: number; leaseMs: number }): Promise<ClaimedOutbox[]> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + input.leaseMs);
    return await this.client.$transaction(async (tx) => {
      return await tx.$queryRaw<ClaimedOutbox[]>`
        WITH candidates AS (
          SELECT "id"
          FROM "notification_outbox"
          WHERE (
            ("status" = 'PENDING' AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= ${now}))
            OR ("status" = 'PROCESSING' AND "lease_expires_at" <= ${now})
          )
          AND "attempt_count" < "max_attempts"
          ORDER BY "created_at", "id"
          FOR UPDATE SKIP LOCKED
          LIMIT ${input.limit}
        )
        UPDATE "notification_outbox" AS outbox
        SET "status" = 'PROCESSING',
            "lease_owner" = ${input.workerId},
            "lease_expires_at" = ${leaseExpiresAt},
            "attempt_count" = outbox."attempt_count" + 1
        FROM candidates
        WHERE outbox."id" = candidates."id"
        RETURNING outbox."id",
                  outbox."recipient_email_snapshot" AS "recipientEmailSnapshot",
                  outbox."payload",
                  outbox."event_key" AS "eventKey",
                  outbox."attempt_count" AS "attemptCount",
                  outbox."max_attempts" AS "maxAttempts"
      `;
    }, { isolationLevel: "ReadCommitted" });
  }

  private async deliver(item: ClaimedOutbox, workerId: string): Promise<void> {
    if (!item.recipientEmailSnapshot) {
      await this.finishWithoutDelivery(item, workerId, "SKIPPED_NO_ADDRESS", "RECIPIENT_EMAIL_MISSING");
      return;
    }
    const payload = parsePayload(item.payload);
    if (!payload) {
      await this.fail(item, workerId, "OUTBOX_PAYLOAD_INVALID");
      return;
    }
    try {
      const result = await this.transport.send({
        to: item.recipientEmailSnapshot,
        subject: payload.subject,
        text: payload.text,
        actionUrl: new URL(payload.actionPath, this.publicBaseUrl).toString(),
        idempotencyKey: item.eventKey,
      });
      await this.client.$transaction(async (tx) => {
        await tx.notificationOutboxAttempt.create({ data: { outboxId: item.id, attemptNo: item.attemptCount, status: "SENT", providerMessageId: result.providerMessageId, attemptedAt: new Date() } });
        await tx.notificationOutbox.updateMany({ where: { id: item.id, status: "PROCESSING", leaseOwner: workerId }, data: { status: "SENT", completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, lastErrorCode: null } });
      });
    } catch (error) {
      await this.fail(item, workerId, safeErrorCode(error));
    }
  }

  private async finishWithoutDelivery(item: ClaimedOutbox, workerId: string, status: "SKIPPED_NO_ADDRESS", errorCode: string): Promise<void> {
    await this.client.notificationOutbox.updateMany({ where: { id: item.id, status: "PROCESSING", leaseOwner: workerId }, data: { status, completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, lastErrorCode: errorCode } });
  }

  private async fail(item: ClaimedOutbox, workerId: string, errorCode: string): Promise<void> {
    const final = item.attemptCount >= item.maxAttempts;
    await this.client.$transaction(async (tx) => {
      await tx.notificationOutboxAttempt.create({ data: { outboxId: item.id, attemptNo: item.attemptCount, status: "FAILED", errorCode, attemptedAt: new Date() } });
      const updated = await tx.notificationOutbox.updateMany({
        where: { id: item.id, status: "PROCESSING", leaseOwner: workerId },
        data: {
          status: final ? "FAILED_FINAL" : "PENDING",
          nextAttemptAt: final ? null : new Date(Date.now() + retryDelayMs(item.attemptCount)),
          completedAt: final ? new Date() : null,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: errorCode,
        },
      });
      if (final && updated.count === 1) await createFinalFailureAlerts(tx, item.id);
    });
  }
}

type Candidate = {
  projectId: string; sourceId: string; eventCode: NotificationEventCode; notificationType: "WORKFLOW_REVIEW_NOTICE" | "PROJECT_REVIEW_NOTICE" | "ISSUE_MESSAGE" | "WORKFLOW_FILL_REMINDER" | "MILESTONE_UPCOMING_REMINDER" | "MILESTONE_OVERDUE_REMINDER";
  title: string; content: string; actionGroupKey: string;
  requiredRoleCode: "PMO" | "DEAN" | "KEY_SUB_I"; requiredPersonId: string | null;
  emailRequired: boolean;
  projectWorkflowStageId?: string; workflowCompletionRequestId?: string; workflowCompletionReviewRoundId?: string; projectCompletionRequestId?: string; projectCompletionReviewRoundId?: string; issueHandlingStateId?: string;
};

async function responsibilityCandidates(tx: Prisma.TransactionClient, now: Date): Promise<Candidate[]> {
  const workflowRounds = await tx.workflowCompletionReviewRound.findMany({ where: { status: "ACTIVE", dueAt: { lt: now } }, select: { id: true, projectId: true, completionRequestId: true, dueAt: true, reminderIntervalDaysSnapshot: true } });
  const closureRounds = await tx.projectCompletionReviewRound.findMany({ where: { status: "ACTIVE", dueAt: { lt: now } }, select: { id: true, projectId: true, completionRequestId: true, dueAt: true, reminderIntervalDaysSnapshot: true } });
  const supplementRounds = await tx.projectCompletionSupplementRound.findMany({ where: { completedAt: null, dueAt: { lt: now } }, select: { id: true, projectId: true, completionRequestId: true, responsiblePersonId: true, dueAt: true, reminderIntervalDaysSnapshot: true } });
  const issueStates = await tx.issueHandlingState.findMany({ where: { exitedAt: null, dueAt: { lt: now }, requiredRoleCode: { in: ["PMO", "DEAN", "KEY_SUB_I"] } }, select: { id: true, projectId: true, issueId: true, requiredRoleCode: true, requiredPersonId: true, dueAt: true, reminderIntervalDaysSnapshot: true } });
  const workflowStages = await tx.projectWorkflowStage.findMany({
      where: {
        project: { status: "ACTIVE" },
        executionStatus: { not: "COMPLETED" },
        versions: { some: { projectPlanVersion: { status: "ACTIVE" } } },
        completionRequests: { none: { status: "PREDECESSOR_RETURNED_CONFIRMATION" } },
      },
      select: {
        id: true, projectId: true, nextUpdateDueDate: true, actualStartAt: true,
        workflowUpdates: { take: 1, select: { id: true } },
        versions: { where: { projectPlanVersion: { status: "ACTIVE" } }, take: 1, select: { plannedEndDate: true, applicability: true, overdueReminderIntervalDays: true, reminderPointVersions: { select: { daysBefore: true } } } },
      },
    });
  return [
    ...workflowRounds.filter((row) => reminderDue(now, row.dueAt, row.reminderIntervalDaysSnapshot)).map((row): Candidate => ({ projectId: row.projectId, sourceId: row.id, eventCode: "WORKFLOW_COMPLETION_REVIEW_OVERDUE", notificationType: "WORKFLOW_REVIEW_NOTICE", title: "节点完成审核已超期", content: "请处理有权项目的节点完成审核。", actionGroupKey: `workflow-review:${row.id}`, requiredRoleCode: "PMO", requiredPersonId: null, emailRequired: true, workflowCompletionRequestId: row.completionRequestId, workflowCompletionReviewRoundId: row.id })),
    ...closureRounds.filter((row) => reminderDue(now, row.dueAt, row.reminderIntervalDaysSnapshot)).map((row): Candidate => ({ projectId: row.projectId, sourceId: row.id, eventCode: "PROJECT_COMPLETION_REVIEW_OVERDUE", notificationType: "PROJECT_REVIEW_NOTICE", title: "项目结题复核已超期", content: "请处理有权项目的结题复核。", actionGroupKey: `closure-review:${row.id}`, requiredRoleCode: "PMO", requiredPersonId: null, emailRequired: true, projectCompletionRequestId: row.completionRequestId, projectCompletionReviewRoundId: row.id })),
    ...supplementRounds.filter((row) => reminderDue(now, row.dueAt, row.reminderIntervalDaysSnapshot)).map((row): Candidate => ({ projectId: row.projectId, sourceId: row.id, eventCode: "PROJECT_COMPLETION_SUPPLEMENT_OVERDUE", notificationType: "PROJECT_REVIEW_NOTICE", title: "结题材料补充已超期", content: "请补充并重提有权项目的结题材料。", actionGroupKey: `closure-supplement:${row.id}`, requiredRoleCode: "KEY_SUB_I", requiredPersonId: row.responsiblePersonId, emailRequired: true, projectCompletionRequestId: row.completionRequestId })),
    ...issueStates.filter((row) => row.dueAt && reminderDue(now, row.dueAt, row.reminderIntervalDaysSnapshot ?? 1)).flatMap((row): Candidate[] => row.requiredRoleCode === "PMO" || row.requiredRoleCode === "DEAN" || row.requiredRoleCode === "KEY_SUB_I" ? [{ projectId: row.projectId, sourceId: row.id, eventCode: issueOverdueEvent(row.requiredRoleCode), notificationType: "ISSUE_MESSAGE", title: "问题处理已超期", content: "请处理有权项目中当前由您负责的问题事项。", actionGroupKey: `issue:${row.id}`, requiredRoleCode: row.requiredRoleCode, requiredPersonId: row.requiredPersonId, emailRequired: true, issueHandlingStateId: row.id }] : []),
    ...workflowStages.flatMap((row): Candidate[] => nodeReminderCandidates(row, now)),
  ];
}

type NodeReminderRow = {
  id: string; projectId: string; nextUpdateDueDate: Date | null; actualStartAt: Date | null;
  workflowUpdates: Array<{ id: string }>;
  versions: Array<{ plannedEndDate: Date | null; applicability: "REQUIRED" | "OPTIONAL" | "NOT_APPLICABLE"; overdueReminderIntervalDays: number; reminderPointVersions: Array<{ daysBefore: number }> }>;
};

function nodeReminderCandidates(row: NodeReminderRow, now: Date): Candidate[] {
  const version = row.versions?.[0];
  if (!version || version.applicability === "NOT_APPLICABLE") return [];
  if (version.applicability === "OPTIONAL" && !row.actualStartAt && !row.workflowUpdates?.length) return [];
  const base = { projectId: row.projectId, sourceId: row.id, actionGroupKey: `workflow-node:${row.id}`, requiredRoleCode: "KEY_SUB_I" as const, requiredPersonId: null, projectWorkflowStageId: row.id };
  const results: Candidate[] = [];
  if (version.plannedEndDate) {
    const daysUntilEnd = daysBetweenShanghai(now, version.plannedEndDate);
    if (daysUntilEnd < 0 && (-daysUntilEnd) % Math.max(1, version.overdueReminderIntervalDays) === 0) results.push({ ...base, eventCode: "MILESTONE_OVERDUE", notificationType: "MILESTONE_OVERDUE_REMINDER", title: "项目节点已逾期", content: version.applicability === "OPTIONAL" ? "可选节点已逾期，但不阻塞主阶段。" : "必需节点已逾期，请及时处理。", emailRequired: true });
    else if (version.reminderPointVersions.some((point: { daysBefore: number }) => point.daysBefore === daysUntilEnd)) results.push({ ...base, eventCode: "MILESTONE_UPCOMING", notificationType: "MILESTONE_UPCOMING_REMINDER", title: "项目节点即将到期", content: version.applicability === "OPTIONAL" ? "可选节点即将到期，但不阻塞主阶段。" : "必需节点即将到期。", emailRequired: false });
  }
  if (row.nextUpdateDueDate && daysBetweenShanghai(now, row.nextUpdateDueDate) < 0) results.push({ ...base, eventCode: "WORKFLOW_UPDATE_OVERDUE", notificationType: "WORKFLOW_FILL_REMINDER", title: "节点长期未更新", content: "该节点已超过下次更新日期，请补充项目级进展。", emailRequired: true });
  return results;
}

async function recipientsForCandidate(tx: Prisma.TransactionClient, candidate: Candidate) {
  return await tx.person.findMany({ where: {
    accountStatus: "ACTIVE",
    ...(candidate.requiredPersonId ? { id: candidate.requiredPersonId } : {}),
    roleAssignments: { some: { roleCode: candidate.requiredRoleCode, assignmentStatus: "ACTIVE", ...(candidate.requiredRoleCode === "KEY_SUB_I" ? { projectId: candidate.projectId } : { projectId: null }) } },
  }, select: { id: true, workEmail: true }, orderBy: { id: "asc" } }).then((rows) => rows.map((row) => ({ personId: row.id, roleCode: candidate.requiredRoleCode, email: row.workEmail })));
}

async function createNotificationIfMissing(tx: Prisma.TransactionClient, data: Prisma.NotificationCreateManyInput) {
  const created = await tx.notification.createMany({ data: [data], skipDuplicates: true });
  if (created.count === 0) return null;
  return await tx.notification.findFirstOrThrow({
    where: {
      eventKey: data.eventKey,
      recipientPersonId: data.recipientPersonId,
      recipientRoleCode: data.recipientRoleCode,
    },
    select: { id: true },
  });
}

async function createFinalFailureAlerts(tx: Prisma.TransactionClient, outboxId: string): Promise<void> {
  const pmos = await tx.roleAssignment.findMany({ where: { projectId: null, roleCode: "PMO", assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } }, select: { personId: true } });
  for (const pmo of pmos) await createNotificationIfMissing(tx, { recipientPersonId: pmo.personId, recipientRoleCode: "PMO", notificationType: "SYSTEM_NOTICE", eventCode: "OUTBOX_DELIVERY_FAILED_FINAL", title: "邮件投递最终失败", content: "一条项目级提醒邮件已达最大重试次数，请在投递状态中排查。", eventKey: `OUTBOX_DELIVERY_FAILED_FINAL:${outboxId}:${pmo.personId}`, messageKind: "INFORMATIONAL", actionStatus: "NOT_APPLICABLE" });
  await tx.auditLog.create({ data: { actionCode: "OUTBOX_DELIVERY_FAILED_FINAL", result: "FAILURE", entityType: "NOTIFICATION_OUTBOX", entityId: outboxId, summary: "邮件投递达到最大重试次数", failureCode: "DELIVERY_FAILED_FINAL", correlationId: randomUUID() } });
}

function parsePayload(value: unknown): { subject: string; text: string; actionPath: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.subject !== "string" || typeof item.text !== "string" || typeof item.actionPath !== "string" || !item.actionPath.startsWith("/workspace/")) return null;
  return { subject: item.subject, text: item.text, actionPath: item.actionPath };
}
function shanghaiDayStart(value: Date): Date {
  const shifted = new Date(value.getTime() + 8 * 60 * 60_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 8 * 60 * 60_000);
}
function daysBetweenShanghai(from: Date, to: Date): number {
  return Math.round((shanghaiDayStart(to).getTime() - shanghaiDayStart(from).getTime()) / 86_400_000);
}
function reminderDue(now: Date, dueAt: Date, intervalDays: number): boolean {
  const overdueDays = -daysBetweenShanghai(now, dueAt);
  return overdueDays > 0 && overdueDays % Math.max(1, intervalDays) === 0;
}
function issueOverdueEvent(roleCode: "PMO" | "DEAN" | "KEY_SUB_I"): NotificationEventCode {
  if (roleCode === "PMO") return "ISSUE_PMO_ACTION_OVERDUE";
  if (roleCode === "DEAN") return "ISSUE_DEAN_ACTION_OVERDUE";
  return "ISSUE_KEY_SUB_I_ACTION_OVERDUE";
}
function retryDelayMs(attempt: number) { return Math.min(60 * 60_000, 30_000 * (2 ** Math.max(0, attempt - 1))); }
function safeErrorCode(error: unknown) { return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code.slice(0, 80) : "DELIVERY_FAILED"; }
function isUniqueConflict(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002"); }
