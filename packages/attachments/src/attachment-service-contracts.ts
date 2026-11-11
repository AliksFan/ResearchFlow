export type AttachmentRoleCode = "PMO" | "DEAN" | "KEY_SUB_I";

export interface AttachmentActor {
  personId: string;
  sessionId: string;
  roleCode: AttachmentRoleCode;
}

export type AttachmentServiceErrorCode =
  | "ATTACHMENT_FORBIDDEN"
  | "DECLARATION_REQUIRED"
  | "INVALID_SHA256"
  | "FILE_TYPE_MISMATCH"
  | "FILE_METADATA_MISMATCH"
  | "FILE_HASH_MISMATCH"
  | "STORAGE_OBJECT_MISSING"
  | "ATTACHMENT_DRAFT_NOT_FOUND"
  | "UPLOAD_SESSION_EXPIRED"
  | "ATTACHMENT_LIMIT_EXCEEDED"
  | "ATTACHMENT_STATE_CONFLICT";

export class AttachmentServiceError extends Error {
  constructor(readonly code: AttachmentServiceErrorCode) {
    super(code);
    this.name = "AttachmentServiceError";
  }
}

export interface ProgressAttachmentDraft {
  id: string;
  projectId: string;
  projectWorkflowStageId: string;
  uploaderPersonId: string;
  uploaderRoleCode: AttachmentRoleCode;
  expiresAt: string;
}

export interface WorkflowCompletionAttachmentDraft extends ProgressAttachmentDraft {
  parentType: "WORKFLOW_COMPLETION_SUBMISSION" | "WORKFLOW_COMPLETION_SUPPLEMENT";
}

export interface IssueAttachmentDraft {
  id: string;
  projectId: string;
  projectWorkflowStageId: string | null;
  issueId: string | null;
  uploaderPersonId: string;
  uploaderRoleCode: AttachmentRoleCode;
  parentType: "ISSUE" | "ISSUE_ACTIVITY" | "ISSUE_DEAN_DECISION" | "ISSUE_IMPLEMENTATION_SUBMISSION";
  visibilityScope: "PMO_ONLY" | "PMO_AND_DEAN" | "ISSUE_PARTICIPANTS";
  expiresAt: string;
}

export interface ProjectClosureAttachmentDraft {
  id: string;
  projectId: string;
  completionRequestId: string | null;
  uploaderPersonId: string;
  uploaderRoleCode: "KEY_SUB_I";
  parentType: "PROJECT_COMPLETION_SUBMISSION_VERSION";
  expiresAt: string;
}

export interface PreparedAttachmentAsset {
  assetId: string;
  projectId: string;
  draftId: string;
  uploadSessionId: string;
  objectKey: string;
  fileName: string;
  declaredMediaType: string;
  sizeBytes: number;
  sha256: string;
}

export interface DownloadableAttachmentAsset extends PreparedAttachmentAsset {
  status: "AVAILABLE";
}

export interface AttachmentRepository {
  createProgressDraft(input: {
    actor: AttachmentActor;
    projectId: string;
    projectWorkflowStageId: string;
  }): Promise<ProgressAttachmentDraft>;
  createWorkflowCompletionDraft(input: {
    actor: AttachmentActor;
    projectId: string;
    projectWorkflowStageId: string;
    parentType: WorkflowCompletionAttachmentDraft["parentType"];
  }): Promise<WorkflowCompletionAttachmentDraft>;
  createIssueDraft(input: {
    actor: AttachmentActor;
    projectId: string;
    projectWorkflowStageId: string | null;
    issueId: string | null;
    parentType: IssueAttachmentDraft["parentType"];
    visibilityScope: IssueAttachmentDraft["visibilityScope"];
  }): Promise<IssueAttachmentDraft>;
  createProjectClosureDraft(input: {
    actor: AttachmentActor & { roleCode: "KEY_SUB_I" };
    projectId: string;
    completionRequestId: string | null;
  }): Promise<ProjectClosureAttachmentDraft>;
  prepareUpload(input: {
    actor: AttachmentActor;
    draftId: string;
    idempotencyKey: string;
    fileName: string;
    declaredMediaType: string;
    sizeBytes: number;
    sha256: string;
    declarationVersion: string;
  }): Promise<PreparedAttachmentAsset>;
  getUploadVerificationTarget(
    actor: AttachmentActor,
    assetId: string,
  ): Promise<PreparedAttachmentAsset>;
  markFileAvailable(input: {
    actor: AttachmentActor;
    assetId: string;
    storageObjectVersion: string | null;
    etag: string | null;
  }): Promise<void>;
  markFileRejected(input: {
    actor: AttachmentActor;
    assetId: string;
    rejectionCode: string;
  }): Promise<void>;
  getDownloadTarget(
    actor: AttachmentActor,
    assetId: string,
  ): Promise<DownloadableAttachmentAsset>;
  recordMissingObject(input: { actor: AttachmentActor; assetId: string }): Promise<void>;
  startCleanupRun(): Promise<string>;
  completeCleanupRun(input: { runId: string; scannedCount: number; markedCount: number; deleteSuccessCount: number; deleteFailureCount: number; errorCode: string | null }): Promise<void>;
  claimCleanupBatch(input: { limit: number; workerId: string; leaseMs: number }): Promise<Array<{ assetId: string; objectKey: string }>>;
  markCleanupResult(input: { assetId: string; workerId: string; deleted: boolean; errorCode: string | null }): Promise<boolean>;
}

export interface AttachmentContentInspector {
  inspectObject(objectKey: string): Promise<{ mediaType: string; sha256: string }>;
}
