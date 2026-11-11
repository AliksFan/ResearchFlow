import { randomUUID } from "node:crypto";

import {
  AttachmentServiceError,
  MAX_ATTACHMENT_FILE_COUNT,
  MAX_ATTACHMENT_TOTAL_BYTES,
  createStorageObjectKey,
  type AttachmentActor,
  type AttachmentRepository,
  type DownloadableAttachmentAsset,
  type IssueAttachmentDraft,
  type PreparedAttachmentAsset,
  type ProjectClosureAttachmentDraft,
  type ProgressAttachmentDraft,
  type WorkflowCompletionAttachmentDraft,
} from "@researchflow/attachments";

import type { Prisma } from "../generated/client.js";
import type { ApplicationPrismaClient } from "./client.js";

type Transaction = Prisma.TransactionClient;
type DatabaseClient = ApplicationPrismaClient | Transaction;
const DRAFT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const UPLOAD_SESSION_MS = 30 * 60 * 1000;

export class PrismaAttachmentRepository implements AttachmentRepository {
  constructor(private readonly client: ApplicationPrismaClient) {}

  async createProgressDraft(input: {
    actor: AttachmentActor;
    projectId: string;
    projectWorkflowStageId: string;
  }): Promise<ProgressAttachmentDraft> {
    return this.client.$transaction(async (tx) => {
      await requireWritableProject(tx, input.actor, input.projectId);
      const node = await tx.projectWorkflowStage.findFirst({
        where: {
          id: input.projectWorkflowStageId,
          projectId: input.projectId,
          executionStatus: { in: ["NOT_STARTED", "ACTIVE"] },
          versions: { some: {
            applicability: { not: "NOT_APPLICABLE" },
            projectPlanVersion: { status: "ACTIVE" },
            roleVersions: { some: { roleCode: "KEY_SUB_I" } },
          } },
        },
        select: { id: true },
      });
      if (!node) throw new AttachmentServiceError("ATTACHMENT_FORBIDDEN");
      const now = new Date();
      const draft = await tx.attachmentDraft.create({ data: {
        projectId: input.projectId,
        parentType: "WORKFLOW_UPDATE",
        purposeCode: "PROGRESS_EVIDENCE",
        visibilityScope: "PROJECT_SHARED",
        uploaderPersonId: input.actor.personId,
        uploaderRoleCode: input.actor.roleCode,
        projectWorkflowStageId: input.projectWorkflowStageId,
        createdAt: now,
        lastActivityAt: now,
        expiresAt: new Date(now.getTime() + DRAFT_LIFETIME_MS),
      } });
      await audit(tx, input.actor, input.projectId, "ATTACHMENT_DRAFT_CREATED", "ATTACHMENT_DRAFT", draft.id, "创建附件草稿");
      return mapDraft(draft);
    }, { isolationLevel: "Serializable" });
  }

  async createWorkflowCompletionDraft(input: {
    actor: AttachmentActor;
    projectId: string;
    projectWorkflowStageId: string;
    parentType: WorkflowCompletionAttachmentDraft["parentType"];
  }): Promise<WorkflowCompletionAttachmentDraft> {
    return this.client.$transaction(async (tx) => {
      await requireWritableProject(tx, input.actor, input.projectId);
      const node = await tx.projectWorkflowStage.findFirst({
        where: {
          id: input.projectWorkflowStageId,
          projectId: input.projectId,
          executionStatus: { in: ["NOT_STARTED", "ACTIVE", "PENDING_COMPLETION_CONFIRMATION"] },
          versions: { some: {
            applicability: { not: "NOT_APPLICABLE" },
            attachmentRequirement: { not: "NONE" },
            projectPlanVersion: { status: "ACTIVE" },
            roleVersions: { some: { roleCode: "KEY_SUB_I" } },
          } },
        },
        select: { id: true },
      });
      if (!node) throw new AttachmentServiceError("ATTACHMENT_FORBIDDEN");
      const now = new Date();
      const draft = await tx.attachmentDraft.create({ data: {
        projectId: input.projectId,
        parentType: input.parentType,
        purposeCode: input.parentType === "WORKFLOW_COMPLETION_SUBMISSION"
          ? "COMPLETION_EVIDENCE"
          : "COMPLETION_SUPPLEMENT",
        visibilityScope: "PROJECT_SHARED",
        uploaderPersonId: input.actor.personId,
        uploaderRoleCode: input.actor.roleCode,
        projectWorkflowStageId: input.projectWorkflowStageId,
        createdAt: now,
        lastActivityAt: now,
        expiresAt: new Date(now.getTime() + DRAFT_LIFETIME_MS),
      } });
      await audit(tx, input.actor, input.projectId, "ATTACHMENT_DRAFT_CREATED", "ATTACHMENT_DRAFT", draft.id, "创建节点完成附件草稿");
      return { ...mapDraft(draft), parentType: input.parentType };
    }, { isolationLevel: "Serializable" });
  }

  async createIssueDraft(input: {
    actor: AttachmentActor;
    projectId: string;
    projectWorkflowStageId: string | null;
    issueId: string | null;
    parentType: IssueAttachmentDraft["parentType"];
    visibilityScope: IssueAttachmentDraft["visibilityScope"];
  }): Promise<IssueAttachmentDraft> {
    return this.client.$transaction(async (tx) => {
      await requireWritableProject(tx, input.actor, input.projectId);
      if (input.issueId) {
        const issue = await tx.issue.findFirst({
          where: { id: input.issueId, projectId: input.projectId, resolvedAt: null, closedAt: null },
          select: { id: true, projectWorkflowStageId: true },
        });
        if (!issue || (input.projectWorkflowStageId && issue.projectWorkflowStageId !== input.projectWorkflowStageId)) {
          throw new AttachmentServiceError("ATTACHMENT_FORBIDDEN");
        }
      } else {
        const node = input.projectWorkflowStageId ? await tx.projectWorkflowStage.findFirst({
          where: { id: input.projectWorkflowStageId, projectId: input.projectId, versions: { some: { applicability: { not: "NOT_APPLICABLE" }, projectPlanVersion: { status: "ACTIVE" } } } },
          select: { id: true },
        }) : null;
        if (input.parentType !== "ISSUE" || !node) throw new AttachmentServiceError("ATTACHMENT_FORBIDDEN");
      }
      const now = new Date();
      const draft = await tx.attachmentDraft.create({ data: {
        projectId: input.projectId,
        parentType: input.parentType,
        purposeCode: "ISSUE_EVIDENCE",
        visibilityScope: input.visibilityScope,
        uploaderPersonId: input.actor.personId,
        uploaderRoleCode: input.actor.roleCode,
        projectWorkflowStageId: input.projectWorkflowStageId,
        issueId: input.issueId,
        createdAt: now,
        lastActivityAt: now,
        expiresAt: new Date(now.getTime() + DRAFT_LIFETIME_MS),
      } });
      await audit(tx, input.actor, input.projectId, "ATTACHMENT_DRAFT_CREATED", "ATTACHMENT_DRAFT", draft.id, "创建问题附件草稿");
      return {
        id: draft.id,
        projectId: draft.projectId,
        projectWorkflowStageId: draft.projectWorkflowStageId,
        issueId: draft.issueId,
        uploaderPersonId: draft.uploaderPersonId,
        uploaderRoleCode: draft.uploaderRoleCode as AttachmentActor["roleCode"],
        parentType: draft.parentType as IssueAttachmentDraft["parentType"],
        visibilityScope: draft.visibilityScope as IssueAttachmentDraft["visibilityScope"],
        expiresAt: draft.expiresAt.toISOString(),
      };
    }, { isolationLevel: "Serializable" });
  }

  async createProjectClosureDraft(input: { actor: AttachmentActor & { roleCode: "KEY_SUB_I" }; projectId: string; completionRequestId: string | null }): Promise<ProjectClosureAttachmentDraft> {
    return this.client.$transaction(async (tx) => {
      await requireActiveSession(tx, input.actor);
      const assignment = await tx.roleAssignment.findFirst({ where: { personId: input.actor.personId, projectId: input.projectId, roleCode: "KEY_SUB_I", isPrimary: true, assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } }, select: { id: true } });
      const project = await tx.project.findFirst({ where: { id: input.projectId, status: { in: input.completionRequestId ? ["CLOSING"] : ["ACTIVE"] } }, select: { id: true } });
      const request = input.completionRequestId ? await tx.projectCompletionRequest.findFirst({ where: { id: input.completionRequestId, projectId: input.projectId, status: "CLOSURE_RETURNED_FOR_SUPPLEMENT" }, select: { id: true } }) : null;
      if (!assignment || !project || (input.completionRequestId && !request)) throw new AttachmentServiceError("ATTACHMENT_FORBIDDEN");
      const now = new Date();
      const draft = await tx.attachmentDraft.create({ data: { projectId: input.projectId, parentType: "PROJECT_COMPLETION_SUBMISSION_VERSION", purposeCode: "PROJECT_CLOSURE_MATERIAL", visibilityScope: "PROJECT_SHARED", uploaderPersonId: input.actor.personId, uploaderRoleCode: "KEY_SUB_I", projectCompletionRequestId: input.completionRequestId, createdAt: now, lastActivityAt: now, expiresAt: new Date(now.getTime() + DRAFT_LIFETIME_MS) } });
      await audit(tx, input.actor, input.projectId, "ATTACHMENT_DRAFT_CREATED", "ATTACHMENT_DRAFT", draft.id, "创建结题附件草稿");
      return { id: draft.id, projectId: draft.projectId, completionRequestId: draft.projectCompletionRequestId, uploaderPersonId: draft.uploaderPersonId, uploaderRoleCode: "KEY_SUB_I", parentType: "PROJECT_COMPLETION_SUBMISSION_VERSION", expiresAt: draft.expiresAt.toISOString() };
    }, { isolationLevel: "Serializable" });
  }

  async prepareUpload(input: {
    actor: AttachmentActor;
    draftId: string;
    idempotencyKey: string;
    fileName: string;
    declaredMediaType: string;
    sizeBytes: number;
    sha256: string;
    declarationVersion: string;
  }): Promise<PreparedAttachmentAsset> {
    return this.client.$transaction(async (tx) => {
      const draft = await requireOpenOwnedDraft(tx, input.actor, input.draftId);
      const existing = await tx.attachmentUploadSession.findFirst({
        where: { uploaderPersonId: input.actor.personId, idempotencyKey: input.idempotencyKey },
        include: { fileAssets: { take: 1 } },
      });
      const existingAsset = existing?.fileAssets[0];
      if (existing && existingAsset) return mapPrepared(existingAsset, existing.attachmentDraftId);

      const aggregate = await tx.fileAsset.aggregate({
        where: {
          attachmentUploadSession: { attachmentDraftId: draft.id },
          status: { in: ["UPLOADING", "AVAILABLE"] },
        },
        _count: { id: true },
        _sum: { sizeBytes: true },
      });
      if (
        aggregate._count.id >= MAX_ATTACHMENT_FILE_COUNT ||
        Number(aggregate._sum.sizeBytes ?? 0) + input.sizeBytes > MAX_ATTACHMENT_TOTAL_BYTES
      ) throw new AttachmentServiceError("ATTACHMENT_LIMIT_EXCEEDED");

      const now = new Date();
      const sessionId = randomUUID();
      const assetId = randomUUID();
      const session = await tx.attachmentUploadSession.create({ data: {
        id: sessionId,
        projectId: draft.projectId,
        attachmentDraftId: draft.id,
        uploaderPersonId: input.actor.personId,
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
        expiresAt: new Date(now.getTime() + UPLOAD_SESSION_MS),
        lastActivityAt: now,
        fileAssets: { create: {
          id: assetId,
          originalFileName: input.fileName,
          mediaType: input.declaredMediaType,
          sizeBytes: BigInt(input.sizeBytes),
          sha256: input.sha256,
          storageObjectKey: createStorageObjectKey({ projectId: draft.projectId, assetId }),
          uploadedByPersonId: input.actor.personId,
          uploadedRoleCode: input.actor.roleCode,
          declarationVersion: input.declarationVersion,
          createdAt: now,
        } },
      }, include: { fileAssets: true } });
      await tx.attachmentDraft.update({ where: { id: draft.id }, data: { lastActivityAt: now, rowVersion: { increment: 1 } } });
      await audit(tx, input.actor, draft.projectId, "ATTACHMENT_UPLOAD_PREPARED", "FILE_ASSET", assetId, "准备附件上传");
      return mapPrepared(session.fileAssets[0]!, draft.id);
    }, { isolationLevel: "Serializable" });
  }

  async getUploadVerificationTarget(actor: AttachmentActor, assetId: string): Promise<PreparedAttachmentAsset> {
    return this.client.$transaction(async (tx) => {
      const asset = await tx.fileAsset.findFirst({
        where: { id: assetId, status: "UPLOADING" },
        include: { attachmentUploadSession: { include: { attachmentDraft: true } } },
      });
      if (!asset) throw new AttachmentServiceError("ATTACHMENT_DRAFT_NOT_FOUND");
      const session = asset.attachmentUploadSession;
      await requireWritableProject(tx, actor, asset.projectId);
      if (
        session.uploaderPersonId !== actor.personId ||
        session.attachmentDraft.uploaderRoleCode !== actor.roleCode ||
        session.status !== "OPEN" ||
        session.expiresAt <= new Date() ||
        session.attachmentDraft.status !== "OPEN"
      ) throw new AttachmentServiceError("UPLOAD_SESSION_EXPIRED");
      return mapPrepared(asset, session.attachmentDraftId);
    }, { isolationLevel: "Serializable" });
  }

  async markFileAvailable(input: { actor: AttachmentActor; assetId: string; storageObjectVersion: string | null; etag: string | null }): Promise<void> {
    await this.client.$transaction(async (tx) => {
      const target = await this.getVerificationTargetInTransaction(tx, input.actor, input.assetId);
      const now = new Date();
      const changed = await tx.fileAsset.updateMany({
        where: { id: input.assetId, status: "UPLOADING" },
        data: { status: "AVAILABLE", availableAt: now, storageObjectVersion: input.storageObjectVersion },
      });
      if (changed.count !== 1) throw new AttachmentServiceError("ATTACHMENT_STATE_CONFLICT");
      await tx.attachmentUploadSession.update({ where: { id: target.attachmentUploadSessionId }, data: { status: "COMPLETED", lastActivityAt: now } });
      await tx.attachmentDraft.update({ where: { id: target.attachmentUploadSession.attachmentDraftId }, data: { lastActivityAt: now, rowVersion: { increment: 1 } } });
      await audit(tx, input.actor, target.projectId, "ATTACHMENT_UPLOAD_COMPLETED", "FILE_ASSET", input.assetId, "完成附件上传");
    }, { isolationLevel: "Serializable" });
  }

  async markFileRejected(input: { actor: AttachmentActor; assetId: string; rejectionCode: string }): Promise<void> {
    await this.client.$transaction(async (tx) => {
      const target = await this.getVerificationTargetInTransaction(tx, input.actor, input.assetId);
      const now = new Date();
      await tx.fileAsset.update({ where: { id: input.assetId }, data: { status: "REJECTED", rejectedAt: now, rejectionCode: input.rejectionCode } });
      await tx.attachmentUploadSession.update({ where: { id: target.attachmentUploadSessionId }, data: { status: "FAILED", lastActivityAt: now } });
      await audit(tx, input.actor, target.projectId, "ATTACHMENT_UPLOAD_REJECTED", "FILE_ASSET", input.assetId, "附件上传校验失败");
    }, { isolationLevel: "Serializable" });
  }

  async getDownloadTarget(actor: AttachmentActor, assetId: string): Promise<DownloadableAttachmentAsset> {
    return this.client.$transaction(async (tx) => {
      const asset = await tx.fileAsset.findFirst({
        where: { id: assetId, status: "AVAILABLE" },
        include: {
          businessAttachment: true,
          attachmentUploadSession: { include: { attachmentDraft: true } },
        },
      });
      if (!asset) throw new AttachmentServiceError("ATTACHMENT_FORBIDDEN");
      await requireActiveSession(tx, actor);
      if (asset.businessAttachment) {
        await requireReadableProject(tx, actor, asset.projectId);
        requireBusinessAttachmentVisibility(actor, asset.businessAttachment.visibilityScope);
      } else {
        const draft = asset.attachmentUploadSession.attachmentDraft;
        if (
          draft.uploaderPersonId !== actor.personId ||
          draft.uploaderRoleCode !== actor.roleCode ||
          draft.status !== "OPEN" || draft.expiresAt <= new Date()
        ) throw new AttachmentServiceError("ATTACHMENT_FORBIDDEN");
      }
      await audit(tx, actor, asset.projectId, "ATTACHMENT_DOWNLOAD_AUTHORIZED", "FILE_ASSET", asset.id, "授权附件下载");
      return { ...mapPrepared(asset, asset.attachmentUploadSession.attachmentDraftId), status: "AVAILABLE" };
    }, { isolationLevel: "Serializable" });
  }

  async recordMissingObject(input: { actor: AttachmentActor; assetId: string }): Promise<void> {
    await this.client.$transaction(async (tx) => {
      const asset = await tx.fileAsset.findUnique({ where: { id: input.assetId }, include: { businessAttachment: true, attachmentUploadSession: { include: { attachmentDraft: true } } } });
      if (!asset) throw new AttachmentServiceError("ATTACHMENT_FORBIDDEN");
      await requireActiveSession(tx, input.actor);
      if (asset.businessAttachment) {
        await requireReadableProject(tx, input.actor, asset.projectId);
        requireBusinessAttachmentVisibility(input.actor, asset.businessAttachment.visibilityScope);
      } else {
        const draft = asset.attachmentUploadSession.attachmentDraft;
        if (draft.uploaderPersonId !== input.actor.personId || draft.uploaderRoleCode !== input.actor.roleCode || draft.status !== "OPEN" || draft.expiresAt <= new Date()) throw new AttachmentServiceError("ATTACHMENT_FORBIDDEN");
      }
      await tx.fileAsset.update({ where: { id: asset.id }, data: { status: "REMOVED", removedAt: new Date(), removalReason: "STORAGE_OBJECT_MISSING", availableAt: null } });
      await audit(tx, input.actor, asset.projectId, "ATTACHMENT_STORAGE_OBJECT_MISSING", "FILE_ASSET", asset.id, "附件存储对象缺失");
    }, { isolationLevel: "Serializable" });
  }

  async claimCleanupBatch(input: { limit: number; workerId: string; leaseMs: number }): Promise<Array<{ assetId: string; objectKey: string }>> {
    if (!Number.isInteger(input.limit) || input.limit <= 0 || input.limit > 100 || !input.workerId.trim() || !Number.isInteger(input.leaseMs) || input.leaseMs < 1_000) return [];
    return this.client.$transaction(async (tx) => {
      const now = new Date();
      const leaseExpiresAt = new Date(now.getTime() + input.leaseMs);
      const assets = await tx.$queryRaw<Array<{ assetId: string; objectKey: string; draftId: string }>>`
        WITH candidates AS (
          SELECT asset."id"
          FROM "file_asset" asset
          JOIN "attachment_upload_session" session ON session."id" = asset."attachment_upload_session_id"
          JOIN "attachment_draft" draft ON draft."id" = session."attachment_draft_id"
          LEFT JOIN "business_attachment" business ON business."file_asset_id" = asset."id"
          WHERE business."id" IS NULL
            AND asset."status" IN ('UPLOADING', 'AVAILABLE', 'REJECTED')
            AND draft."status" IN ('OPEN', 'EXPIRED', 'ABANDONED')
            AND draft."expires_at" <= ${now}
            AND asset."cleanup_attempt_count" < 5
            AND (asset."cleanup_next_attempt_at" IS NULL OR asset."cleanup_next_attempt_at" <= ${now})
            AND (asset."cleanup_lease_expires_at" IS NULL OR asset."cleanup_lease_expires_at" <= ${now})
          ORDER BY asset."created_at", asset."id"
          FOR UPDATE OF asset SKIP LOCKED
          LIMIT ${input.limit}
        )
        UPDATE "file_asset" asset
        SET "cleanup_lease_owner" = ${input.workerId},
            "cleanup_lease_expires_at" = ${leaseExpiresAt},
            "cleanup_attempt_count" = asset."cleanup_attempt_count" + 1
        FROM candidates,
             "attachment_upload_session" session
        WHERE asset."id" = candidates."id"
          AND session."id" = asset."attachment_upload_session_id"
        RETURNING asset."id" AS "assetId", asset."storage_object_key" AS "objectKey", session."attachment_draft_id" AS "draftId"
      `;
      const draftIds = [...new Set(assets.map((asset) => asset.draftId))];
      if (draftIds.length) await tx.attachmentDraft.updateMany({ where: { id: { in: draftIds }, status: "OPEN" }, data: { status: "EXPIRED", rowVersion: { increment: 1 } } });
      return assets.map((asset) => ({ assetId: asset.assetId, objectKey: asset.objectKey }));
    }, { isolationLevel: "Serializable" });
  }

  async startCleanupRun(): Promise<string> {
    const run = await this.client.attachmentCleanupRun.create({ data: { startedAt: new Date() }, select: { id: true } });
    return run.id;
  }

  async completeCleanupRun(input: { runId: string; scannedCount: number; markedCount: number; deleteSuccessCount: number; deleteFailureCount: number; errorCode: string | null }): Promise<void> {
    await this.client.attachmentCleanupRun.update({
      where: { id: input.runId },
      data: {
        completedAt: new Date(),
        scannedCount: input.scannedCount,
        markedCount: input.markedCount,
        deleteSuccessCount: input.deleteSuccessCount,
        deleteFailureCount: input.deleteFailureCount,
        errorSummary: input.errorCode,
      },
    });
  }

  async markCleanupResult(input: { assetId: string; workerId: string; deleted: boolean; errorCode: string | null }): Promise<boolean> {
    return await this.client.$transaction(async (tx) => {
      const asset = await tx.fileAsset.findUnique({ where: { id: input.assetId }, include: { businessAttachment: true } });
      if (!asset?.status || asset.status === "REMOVED" || asset.businessAttachment || asset.cleanupLeaseOwner !== input.workerId) return false;
      if (input.deleted) {
        await tx.fileAsset.update({ where: { id: asset.id }, data: { status: "REMOVED", removedAt: new Date(), removalReason: "DRAFT_EXPIRED", availableAt: null, rejectedAt: null, rejectionCode: null, cleanupLeaseOwner: null, cleanupLeaseExpiresAt: null, cleanupNextAttemptAt: null, cleanupLastErrorCode: null } });
        return true;
      }
      const final = asset.cleanupAttemptCount >= 5;
      await tx.fileAsset.update({ where: { id: asset.id }, data: { cleanupLeaseOwner: null, cleanupLeaseExpiresAt: null, cleanupNextAttemptAt: final ? null : new Date(Date.now() + cleanupRetryDelayMs(asset.cleanupAttemptCount)), cleanupLastErrorCode: input.errorCode ?? "OBJECT_DELETE_FAILED" } });
      if (final) await tx.auditLog.create({ data: { actionCode: "ATTACHMENT_OBJECT_DELETE_FAILED_FINAL", result: "FAILURE", projectId: asset.projectId, entityType: "FILE_ASSET", entityId: asset.id, summary: "附件草稿对象删除达到最大重试次数", failureCode: input.errorCode ?? "OBJECT_DELETE_FAILED", correlationId: randomUUID() } });
      return true;
    }, { isolationLevel: "Serializable" });
  }

  private async getVerificationTargetInTransaction(tx: Transaction, actor: AttachmentActor, assetId: string) {
    const asset = await tx.fileAsset.findFirst({ where: { id: assetId, status: "UPLOADING" }, include: { attachmentUploadSession: { include: { attachmentDraft: true } } } });
    if (!asset) throw new AttachmentServiceError("ATTACHMENT_STATE_CONFLICT");
    await requireWritableProject(tx, actor, asset.projectId);
    const session = asset.attachmentUploadSession;
    if (session.uploaderPersonId !== actor.personId || session.attachmentDraft.uploaderRoleCode !== actor.roleCode || session.status !== "OPEN" || session.expiresAt <= new Date()) throw new AttachmentServiceError("UPLOAD_SESSION_EXPIRED");
    return asset;
  }
}

async function requireWritableProject(client: DatabaseClient, actor: AttachmentActor, projectId: string) {
  await requireActiveSession(client, actor);
  const assignment = await client.roleAssignment.findFirst({ where: actor.roleCode === "KEY_SUB_I"
    ? { personId: actor.personId, roleCode: "KEY_SUB_I", projectId, assignmentStatus: "ACTIVE", project: { status: "ACTIVE" }, person: { accountStatus: "ACTIVE" } }
    : { personId: actor.personId, roleCode: actor.roleCode, projectId: null, assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } }, select: { id: true } });
  const project = await client.project.findFirst({ where: { id: projectId, status: "ACTIVE" }, select: { id: true } });
  if (!assignment || !project) throw new AttachmentServiceError("ATTACHMENT_FORBIDDEN");
}

async function requireOpenOwnedDraft(client: DatabaseClient, actor: AttachmentActor, draftId: string) {
  await requireActiveSession(client, actor);
  const draft = await client.attachmentDraft.findFirst({
    where: {
      id: draftId,
      uploaderPersonId: actor.personId,
      uploaderRoleCode: actor.roleCode,
      status: "OPEN",
      expiresAt: { gt: new Date() },
    },
  });
  if (!draft) throw new AttachmentServiceError("ATTACHMENT_DRAFT_NOT_FOUND");
  await requireWritableProject(client, actor, draft.projectId);
  return draft;
}

async function requireReadableProject(client: DatabaseClient, actor: AttachmentActor, projectId: string) {
  const statuses = ["ACTIVE", "CLOSING", "COMPLETED", "ARCHIVED"] as const;
  const project = await client.project.findFirst({ where: { id: projectId, status: { in: [...statuses] } }, select: { id: true } });
  if (!project) throw new AttachmentServiceError("ATTACHMENT_FORBIDDEN");
  const assignment = await client.roleAssignment.findFirst({ where: actor.roleCode === "KEY_SUB_I"
    ? { personId: actor.personId, roleCode: "KEY_SUB_I", projectId, assignmentStatus: "ACTIVE" }
    : { personId: actor.personId, roleCode: actor.roleCode, projectId: null, assignmentStatus: "ACTIVE" }, select: { id: true } });
  if (!assignment) throw new AttachmentServiceError("ATTACHMENT_FORBIDDEN");
}

async function requireActiveSession(client: DatabaseClient, actor: AttachmentActor) {
  const session = await client.session.findFirst({ where: { id: actor.sessionId, personId: actor.personId, activeRoleCode: actor.roleCode, revokedAt: null, expiresAt: { gt: new Date() }, person: { accountStatus: "ACTIVE" } }, select: { id: true } });
  if (!session) throw new AttachmentServiceError("ATTACHMENT_FORBIDDEN");
}

function requireBusinessAttachmentVisibility(
  actor: AttachmentActor,
  visibilityScope: "PROJECT_SHARED" | "PMO_ONLY" | "PMO_AND_DEAN" | "ISSUE_PARTICIPANTS",
): void {
  const allowed = visibilityScope === "PROJECT_SHARED"
    || actor.roleCode === "PMO"
    || (actor.roleCode === "DEAN" && visibilityScope !== "PMO_ONLY")
    || (actor.roleCode === "KEY_SUB_I" && visibilityScope === "ISSUE_PARTICIPANTS");
  if (!allowed) throw new AttachmentServiceError("ATTACHMENT_FORBIDDEN");
}

function mapDraft(draft: { id: string; projectId: string; projectWorkflowStageId: string | null; uploaderPersonId: string; uploaderRoleCode: "PMO" | "DEAN" | "KEY_SUB_I" | "CRC" | "STATISTICIAN" | "COLLABORATION_LEAD"; expiresAt: Date }): ProgressAttachmentDraft {
  return { id: draft.id, projectId: draft.projectId, projectWorkflowStageId: draft.projectWorkflowStageId!, uploaderPersonId: draft.uploaderPersonId, uploaderRoleCode: draft.uploaderRoleCode as "KEY_SUB_I", expiresAt: draft.expiresAt.toISOString() };
}

function mapPrepared(asset: { id: string; projectId: string; attachmentUploadSessionId: string; originalFileName: string; mediaType: string; sizeBytes: bigint; sha256: string; storageObjectKey: string }, draftId: string): PreparedAttachmentAsset {
  return { assetId: asset.id, projectId: asset.projectId, draftId, uploadSessionId: asset.attachmentUploadSessionId, objectKey: asset.storageObjectKey, fileName: asset.originalFileName, declaredMediaType: asset.mediaType, sizeBytes: Number(asset.sizeBytes), sha256: asset.sha256 };
}

async function audit(tx: Transaction, actor: AttachmentActor, projectId: string, actionCode: string, entityType: string, entityId: string, summary: string) {
  await tx.auditLog.create({ data: { actorPersonId: actor.personId, actorRoleCode: actor.roleCode, sessionId: actor.sessionId, actionCode, result: "SUCCESS", projectId, entityType, entityId, summary, correlationId: randomUUID() } });
}

function cleanupRetryDelayMs(attempt: number): number {
  return Math.min(24 * 60 * 60_000, 60_000 * (2 ** Math.max(0, attempt - 1)));
}
