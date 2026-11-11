import { MAX_OBJECT_AUTHORIZATION_SECONDS } from "./contracts.js";
import type { PrivateObjectStorage } from "./contracts.js";
import { validateAttachmentFile } from "./attachment-validation.js";
import {
  AttachmentServiceError,
  type AttachmentActor,
  type AttachmentContentInspector,
  type AttachmentRepository,
} from "./attachment-service-contracts.js";

const DOWNLOAD_AUTHORIZATION_SECONDS = 5 * 60;

export class AttachmentService {
  constructor(
    private readonly repository: AttachmentRepository,
    private readonly storage: PrivateObjectStorage,
    private readonly inspector: AttachmentContentInspector,
  ) {}

  async createProgressDraft(
    actor: AttachmentActor,
    input: { projectId: string; projectWorkflowStageId: string },
  ) {
    requireKeySubI(actor);
    return await this.repository.createProgressDraft({ actor, ...input });
  }

  async createWorkflowCompletionDraft(
    actor: AttachmentActor,
    input: {
      projectId: string;
      projectWorkflowStageId: string;
      parentType: "WORKFLOW_COMPLETION_SUBMISSION" | "WORKFLOW_COMPLETION_SUPPLEMENT";
    },
  ) {
    requireKeySubI(actor);
    return await this.repository.createWorkflowCompletionDraft({ actor, ...input });
  }

  async createIssueDraft(actor: AttachmentActor, input: {
    projectId: string;
    projectWorkflowStageId: string | null;
    issueId: string | null;
    parentType: "ISSUE" | "ISSUE_ACTIVITY" | "ISSUE_DEAN_DECISION" | "ISSUE_IMPLEMENTATION_SUBMISSION";
    visibilityScope: "PMO_ONLY" | "PMO_AND_DEAN" | "ISSUE_PARTICIPANTS";
  }) {
    if (input.parentType === "ISSUE" && actor.roleCode === "DEAN") forbidden();
    if (input.parentType === "ISSUE_DEAN_DECISION" && actor.roleCode !== "DEAN") forbidden();
    if (input.parentType === "ISSUE_IMPLEMENTATION_SUBMISSION" && actor.roleCode !== "PMO") forbidden();
    if (actor.roleCode === "KEY_SUB_I" && input.visibilityScope !== "ISSUE_PARTICIPANTS") forbidden();
    if (input.parentType === "ISSUE" && input.visibilityScope !== "ISSUE_PARTICIPANTS") forbidden();
    if (input.parentType === "ISSUE_DEAN_DECISION" && input.visibilityScope !== "PMO_AND_DEAN") forbidden();
    if (input.parentType === "ISSUE_IMPLEMENTATION_SUBMISSION" && input.visibilityScope !== "ISSUE_PARTICIPANTS") forbidden();
    return await this.repository.createIssueDraft({ actor, ...input });
  }

  async createProjectClosureDraft(actor: AttachmentActor, input: { projectId: string; completionRequestId: string | null }) {
    requireKeySubI(actor);
    return await this.repository.createProjectClosureDraft({ actor: actor as AttachmentActor & { roleCode: "KEY_SUB_I" }, ...input });
  }

  async prepareUpload(actor: AttachmentActor, input: {
    draftId: string;
    idempotencyKey: string;
    fileName: string;
    declaredMediaType: string;
    sizeBytes: number;
    sha256: string;
    declarationVersion: string | null;
  }) {
    if (!input.declarationVersion?.trim()) {
      throw new AttachmentServiceError("DECLARATION_REQUIRED");
    }
    if (!/^[0-9a-f]{64}$/iu.test(input.sha256)) {
      throw new AttachmentServiceError("INVALID_SHA256");
    }
    const validated = validateAttachmentFile({
      fileName: input.fileName,
      declaredMediaType: input.declaredMediaType,
      detectedMediaType: input.declaredMediaType,
      sizeBytes: input.sizeBytes,
    });
    const prepared = await this.repository.prepareUpload({
      ...input,
      actor,
      fileName: validated.normalizedFileName,
      declaredMediaType: validated.mediaType,
      sha256: input.sha256.toLowerCase(),
      declarationVersion: input.declarationVersion.trim(),
    });
    const authorization = await this.storage.authorizeUpload({
      objectKey: prepared.objectKey,
      mediaType: prepared.declaredMediaType,
      expiresInSeconds: MAX_OBJECT_AUTHORIZATION_SECONDS,
    });
    return { asset: prepared, authorization };
  }

  async completeUpload(actor: AttachmentActor, assetId: string): Promise<void> {
    const target = await this.repository.getUploadVerificationTarget(actor, assetId);
    const metadata = await this.storage.statObject(target.objectKey);
    if (!metadata) {
      await this.rejectAndDelete(actor, target.assetId, target.objectKey, "STORAGE_OBJECT_MISSING");
      throw new AttachmentServiceError("STORAGE_OBJECT_MISSING");
    }
    if (metadata.sizeBytes !== target.sizeBytes || metadata.mediaType !== target.declaredMediaType) {
      await this.rejectAndDelete(actor, target.assetId, target.objectKey, "FILE_METADATA_MISMATCH");
      throw new AttachmentServiceError("FILE_METADATA_MISMATCH");
    }
    const inspection = await this.inspector.inspectObject(target.objectKey);
    if (inspection.sha256.toLowerCase() !== target.sha256.toLowerCase()) {
      await this.rejectAndDelete(actor, target.assetId, target.objectKey, "FILE_HASH_MISMATCH");
      throw new AttachmentServiceError("FILE_HASH_MISMATCH");
    }
    try {
      validateAttachmentFile({
        fileName: target.fileName,
        declaredMediaType: target.declaredMediaType,
        detectedMediaType: inspection.mediaType,
        sizeBytes: metadata.sizeBytes,
      });
    } catch {
      await this.rejectAndDelete(actor, target.assetId, target.objectKey, "FILE_TYPE_MISMATCH");
      throw new AttachmentServiceError("FILE_TYPE_MISMATCH");
    }
    await this.repository.markFileAvailable({
      actor,
      assetId,
      storageObjectVersion: metadata.versionId,
      etag: metadata.etag,
    });
  }

  async authorizeDownload(actor: AttachmentActor, assetId: string) {
    const target = await this.repository.getDownloadTarget(actor, assetId);
    const metadata = await this.storage.statObject(target.objectKey);
    if (!metadata) {
      await this.repository.recordMissingObject({ actor, assetId });
      throw new AttachmentServiceError("STORAGE_OBJECT_MISSING");
    }
    return await this.storage.authorizeDownload({
      objectKey: target.objectKey,
      downloadFileName: target.fileName,
      expiresInSeconds: DOWNLOAD_AUTHORIZATION_SECONDS,
    });
  }

  async cleanupExpiredDrafts(limit: number, workerId = "attachment-cleanup", leaseMs = 60_000): Promise<void> {
    const runId = await this.repository.startCleanupRun();
    let scannedCount = 0;
    let markedCount = 0;
    let deleteSuccessCount = 0;
    let deleteFailureCount = 0;
    try {
      const candidates = await this.repository.claimCleanupBatch({ limit, workerId, leaseMs });
      scannedCount = candidates.length;
      for (const candidate of candidates) {
        try {
          await this.storage.deleteObject(candidate.objectKey);
          const recorded = await this.repository.markCleanupResult({ assetId: candidate.assetId, workerId, deleted: true, errorCode: null });
          if (recorded) {
            markedCount += 1;
            deleteSuccessCount += 1;
          }
        } catch (error) {
          const recorded = await this.repository.markCleanupResult({ assetId: candidate.assetId, workerId, deleted: false, errorCode: safeStorageError(error) });
          if (recorded) {
            markedCount += 1;
            deleteFailureCount += 1;
          }
        }
      }
      await this.repository.completeCleanupRun({ runId, scannedCount, markedCount, deleteSuccessCount, deleteFailureCount, errorCode: null });
    } catch (error) {
      await this.repository.completeCleanupRun({ runId, scannedCount, markedCount, deleteSuccessCount, deleteFailureCount, errorCode: safeStorageError(error) });
      throw error;
    }
  }

  private async rejectAndDelete(
    actor: AttachmentActor,
    assetId: string,
    objectKey: string,
    rejectionCode: string,
  ): Promise<void> {
    await this.repository.markFileRejected({ actor, assetId, rejectionCode });
    await this.storage.deleteObject(objectKey);
  }
}

function safeStorageError(error: unknown): string {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code.slice(0, 80)
    : "OBJECT_DELETE_FAILED";
}

function requireKeySubI(actor: AttachmentActor): void {
  if (actor.roleCode !== "KEY_SUB_I") {
    throw new AttachmentServiceError("ATTACHMENT_FORBIDDEN");
  }
}

function forbidden(): never {
  throw new AttachmentServiceError("ATTACHMENT_FORBIDDEN");
}
