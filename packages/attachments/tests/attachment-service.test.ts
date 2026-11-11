import { describe, expect, it, vi } from "vitest";

import {
  AttachmentService,
  AttachmentServiceError,
  type AttachmentContentInspector,
  type AttachmentRepository,
  type PrivateObjectStorage,
} from "../src/index.js";

const actor = { personId: "key-sub-i", sessionId: "session", roleCode: "KEY_SUB_I" } as const;
const asset = {
  assetId: "f3000000-0000-4000-8000-000000000001",
  projectId: "e3000000-0000-4000-8000-000000000001",
  draftId: "draft-1",
  uploadSessionId: "upload-1",
  objectKey: "projects/e3000000-0000-4000-8000-000000000001/assets/f3000000-0000-4000-8000-000000000001",
  fileName: "虚拟项目进展.pdf",
  declaredMediaType: "application/pdf",
  sizeBytes: 1024,
  sha256: "a".repeat(64),
};

function repository(): AttachmentRepository {
  return {
    createProgressDraft: vi.fn(async (input) => ({
      id: "draft-1",
      projectId: input.projectId,
      projectWorkflowStageId: input.projectWorkflowStageId,
      uploaderPersonId: input.actor.personId,
      uploaderRoleCode: input.actor.roleCode,
      expiresAt: "2026-08-31T00:00:00.000Z",
    })),
    createWorkflowCompletionDraft: vi.fn(async (input) => ({
      id: "draft-1",
      projectId: input.projectId,
      projectWorkflowStageId: input.projectWorkflowStageId,
      parentType: input.parentType,
      uploaderPersonId: input.actor.personId,
      uploaderRoleCode: input.actor.roleCode,
      expiresAt: "2026-08-31T00:00:00.000Z",
    })),
    createIssueDraft: vi.fn(async (input) => ({
      id: "draft-issue-1",
      projectId: input.projectId,
      projectWorkflowStageId: input.projectWorkflowStageId,
      issueId: input.issueId,
      parentType: input.parentType,
      visibilityScope: input.visibilityScope,
      uploaderPersonId: input.actor.personId,
      uploaderRoleCode: input.actor.roleCode,
      expiresAt: "2026-08-31T00:00:00.000Z",
    })),
    createProjectClosureDraft: vi.fn(async (input) => ({ id: "closure-draft", projectId: input.projectId, completionRequestId: input.completionRequestId, uploaderPersonId: input.actor.personId, uploaderRoleCode: "KEY_SUB_I" as const, parentType: "PROJECT_COMPLETION_SUBMISSION_VERSION" as const, expiresAt: new Date(Date.now() + 60_000).toISOString() })),
    prepareUpload: vi.fn(async () => asset),
    getUploadVerificationTarget: vi.fn(async () => asset),
    markFileAvailable: vi.fn(async () => undefined),
    markFileRejected: vi.fn(async () => undefined),
    getDownloadTarget: vi.fn(async () => ({ ...asset, status: "AVAILABLE" as const })),
    recordMissingObject: vi.fn(async () => undefined),
    startCleanupRun: vi.fn(async () => "cleanup-run-1"),
    completeCleanupRun: vi.fn(async () => undefined),
    claimCleanupBatch: vi.fn(async () => []),
    markCleanupResult: vi.fn(async () => true),
  };
}

function storage(): PrivateObjectStorage {
  return {
    authorizeUpload: vi.fn(async () => ({
      method: "PUT" as const,
      url: "https://storage.invalid/upload",
      requiredHeaders: { "content-type": "application/pdf" },
      expiresAt: "2026-08-24T00:30:00.000Z",
    })),
    authorizeDownload: vi.fn(async () => ({
      method: "GET" as const,
      url: "https://storage.invalid/download",
      expiresAt: "2026-08-24T00:05:00.000Z",
    })),
    statObject: vi.fn(async () => ({
      objectKey: asset.objectKey,
      sizeBytes: 1024,
      mediaType: "application/pdf",
      etag: "etag",
      versionId: null,
    })),
    readObjectBytes: vi.fn(async () => new Uint8Array()),
    deleteObject: vi.fn(async () => undefined),
  };
}

function inspector(): AttachmentContentInspector {
  return { inspectObject: vi.fn(async () => ({ mediaType: "application/pdf", sha256: asset.sha256 })) };
}

describe("AttachmentService", () => {
  it("keeps issue attachment parent roles explicit", async () => {
    const service = new AttachmentService(repository(), storage(), inspector());
    await expect(service.createIssueDraft(
      { personId: "dean", sessionId: "session", roleCode: "DEAN" },
      { projectId: asset.projectId, projectWorkflowStageId: null, issueId: "issue-1", parentType: "ISSUE", visibilityScope: "ISSUE_PARTICIPANTS" },
    )).rejects.toEqual(new AttachmentServiceError("ATTACHMENT_FORBIDDEN"));
    await expect(service.createIssueDraft(
      { personId: "pmo", sessionId: "session", roleCode: "PMO" },
      { projectId: asset.projectId, projectWorkflowStageId: null, issueId: "issue-1", parentType: "ISSUE_DEAN_DECISION", visibilityScope: "PMO_AND_DEAN" },
    )).rejects.toEqual(new AttachmentServiceError("ATTACHMENT_FORBIDDEN"));
    await expect(service.createIssueDraft(
      actor,
      { projectId: asset.projectId, projectWorkflowStageId: "node-1", issueId: "issue-1", parentType: "ISSUE_ACTIVITY", visibilityScope: "PMO_ONLY" },
    )).rejects.toEqual(new AttachmentServiceError("ATTACHMENT_FORBIDDEN"));
    await expect(service.createIssueDraft(
      { personId: "dean", sessionId: "session", roleCode: "DEAN" },
      { projectId: asset.projectId, projectWorkflowStageId: null, issueId: "issue-1", parentType: "ISSUE_DEAN_DECISION", visibilityScope: "PMO_AND_DEAN" },
    )).resolves.toMatchObject({ parentType: "ISSUE_DEAN_DECISION" });
  });

  it("creates progress drafts only for Key Sub-I", async () => {
    const gateway = repository();
    const service = new AttachmentService(gateway, storage(), inspector());
    await expect(service.createProgressDraft(actor, {
      projectId: asset.projectId,
      projectWorkflowStageId: "workflow-stage-1",
    })).resolves.toMatchObject({ id: "draft-1" });
    await expect(service.createProgressDraft(
      { personId: "pmo", sessionId: "session", roleCode: "PMO" },
      { projectId: asset.projectId, projectWorkflowStageId: "workflow-stage-1" },
    )).rejects.toEqual(new AttachmentServiceError("ATTACHMENT_FORBIDDEN"));
  });

  it("creates workflow completion drafts with an explicit submission or supplement purpose", async () => {
    const gateway = repository();
    const service = new AttachmentService(gateway, storage(), inspector());
    await expect(service.createWorkflowCompletionDraft(actor, {
      projectId: asset.projectId,
      projectWorkflowStageId: "workflow-stage-1",
      parentType: "WORKFLOW_COMPLETION_SUBMISSION",
    })).resolves.toMatchObject({
      id: "draft-1",
      parentType: "WORKFLOW_COMPLETION_SUBMISSION",
    });
    await expect(service.createWorkflowCompletionDraft(
      { personId: "pmo", sessionId: "session", roleCode: "PMO" },
      {
        projectId: asset.projectId,
        projectWorkflowStageId: "workflow-stage-1",
        parentType: "WORKFLOW_COMPLETION_SUPPLEMENT",
      },
    )).rejects.toEqual(new AttachmentServiceError("ATTACHMENT_FORBIDDEN"));
  });

  it("requires the prohibited-data declaration before preparing upload", async () => {
    const gateway = repository();
    await expect(new AttachmentService(gateway, storage(), inspector()).prepareUpload(actor, {
      draftId: "draft-1",
      idempotencyKey: "upload-request-1",
      fileName: asset.fileName,
      declaredMediaType: asset.declaredMediaType,
      sizeBytes: asset.sizeBytes,
      sha256: asset.sha256,
      declarationVersion: null,
    })).rejects.toEqual(new AttachmentServiceError("DECLARATION_REQUIRED"));
    expect(gateway.prepareUpload).not.toHaveBeenCalled();
  });

  it("returns a short-lived private upload authorization", async () => {
    const objectStorage = storage();
    const result = await new AttachmentService(repository(), objectStorage, inspector()).prepareUpload(actor, {
      draftId: "draft-1",
      idempotencyKey: "upload-request-1",
      fileName: asset.fileName,
      declaredMediaType: asset.declaredMediaType,
      sizeBytes: asset.sizeBytes,
      sha256: asset.sha256,
      declarationVersion: "P2-S2-V1",
    });
    expect(result.authorization.expiresAt).toBe("2026-08-24T00:30:00.000Z");
    expect(objectStorage.authorizeUpload).toHaveBeenCalledWith(expect.objectContaining({
      objectKey: asset.objectKey,
      expiresInSeconds: 1800,
    }));
  });

  it("marks an upload available only after metadata and detected type agree", async () => {
    const gateway = repository();
    await new AttachmentService(gateway, storage(), inspector()).completeUpload(actor, asset.assetId);
    expect(gateway.markFileAvailable).toHaveBeenCalledWith(expect.objectContaining({
      actor,
      assetId: asset.assetId,
      storageObjectVersion: null,
    }));
  });

  it("rejects and deletes a mismatched uploaded object", async () => {
    const gateway = repository();
    const objectStorage = storage();
    const contentInspector = inspector();
    vi.mocked(contentInspector.inspectObject).mockResolvedValue({ mediaType: "image/png", sha256: asset.sha256 });
    await expect(new AttachmentService(gateway, objectStorage, contentInspector)
      .completeUpload(actor, asset.assetId)).rejects.toEqual(
        new AttachmentServiceError("FILE_TYPE_MISMATCH"),
      );
    expect(gateway.markFileRejected).toHaveBeenCalled();
    expect(objectStorage.deleteObject).toHaveBeenCalledWith(asset.objectKey);
  });

  it("rejects and deletes an object whose server hash differs from the declaration", async () => {
    const gateway = repository();
    const objectStorage = storage();
    const contentInspector = inspector();
    vi.mocked(contentInspector.inspectObject).mockResolvedValue({ mediaType: "application/pdf", sha256: "b".repeat(64) });
    await expect(new AttachmentService(gateway, objectStorage, contentInspector)
      .completeUpload(actor, asset.assetId)).rejects.toEqual(
        new AttachmentServiceError("FILE_HASH_MISMATCH"),
      );
    expect(gateway.markFileRejected).toHaveBeenCalled();
    expect(objectStorage.deleteObject).toHaveBeenCalledWith(asset.objectKey);
  });

  it("fails explicitly when a downloadable object's storage entry is missing", async () => {
    const gateway = repository();
    const objectStorage = storage();
    vi.mocked(objectStorage.statObject).mockResolvedValue(null);
    await expect(new AttachmentService(gateway, objectStorage, inspector()).authorizeDownload(
      actor,
      asset.assetId,
    )).rejects.toEqual(new AttachmentServiceError("STORAGE_OBJECT_MISSING"));
    expect(gateway.recordMissingObject).toHaveBeenCalledWith(expect.objectContaining({
      actor,
      assetId: asset.assetId,
    }));
  });

  it("uses live Repository authorization before issuing each download URL", async () => {
    const gateway = repository();
    const objectStorage = storage();
    await new AttachmentService(gateway, objectStorage, inspector()).authorizeDownload(actor, asset.assetId);
    expect(gateway.getDownloadTarget).toHaveBeenCalledWith(actor, asset.assetId);
    expect(objectStorage.authorizeDownload).toHaveBeenCalledWith(expect.objectContaining({
      objectKey: asset.objectKey,
      downloadFileName: asset.fileName,
    }));
  });

  it("deletes only cleanup candidates claimed by the Repository", async () => {
    const gateway = repository();
    const objectStorage = storage();
    vi.mocked(gateway.claimCleanupBatch).mockResolvedValue([{ assetId: asset.assetId, objectKey: asset.objectKey }]);
    await new AttachmentService(gateway, objectStorage, inspector()).cleanupExpiredDrafts(20);
    expect(objectStorage.deleteObject).toHaveBeenCalledWith(asset.objectKey);
    expect(gateway.claimCleanupBatch).toHaveBeenCalledWith({ limit: 20, workerId: "attachment-cleanup", leaseMs: 60_000 });
    expect(gateway.markCleanupResult).toHaveBeenCalledWith({ assetId: asset.assetId, workerId: "attachment-cleanup", deleted: true, errorCode: null });
    expect(gateway.completeCleanupRun).toHaveBeenCalledWith({ runId: "cleanup-run-1", scannedCount: 1, markedCount: 1, deleteSuccessCount: 1, deleteFailureCount: 0, errorCode: null });
  });

  it("records object deletion failure for lease-safe retry", async () => {
    const gateway = repository();
    const objectStorage = storage();
    vi.mocked(gateway.claimCleanupBatch).mockResolvedValue([{ assetId: asset.assetId, objectKey: asset.objectKey }]);
    vi.mocked(objectStorage.deleteObject).mockRejectedValue(Object.assign(new Error("storage unavailable"), { code: "OBJECT_STORAGE_UNAVAILABLE" }));
    await new AttachmentService(gateway, objectStorage, inspector()).cleanupExpiredDrafts(20, "worker-a", 30_000);
    expect(gateway.markCleanupResult).toHaveBeenCalledWith({ assetId: asset.assetId, workerId: "worker-a", deleted: false, errorCode: "OBJECT_STORAGE_UNAVAILABLE" });
    expect(gateway.completeCleanupRun).toHaveBeenCalledWith({ runId: "cleanup-run-1", scannedCount: 1, markedCount: 1, deleteSuccessCount: 0, deleteFailureCount: 1, errorCode: null });
  });
});
