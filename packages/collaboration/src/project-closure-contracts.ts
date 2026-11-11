import type { CollaborationActor } from "./contracts.js";

export type ProjectCompletionRequestStatus =
  | "CLOSURE_BLOCKED"
  | "CLOSURE_PENDING_PMO_REVIEW"
  | "CLOSURE_RETURNED_FOR_SUPPLEMENT"
  | "WITHDRAWN"
  | "APPROVED";

export interface ProjectCompletionMaterials {
  completionSummary: string;
  unfinishedOptionalAndLegacyStatement: string;
  noUnfinishedItemConfirmed: boolean;
  archiveComplianceSelfCheck: string;
  exceptionStatement: string | null;
  truthConfirmed: boolean;
}

export type ProjectCompletionGateReason =
  | { code: "REQUIRED_NODE_INCOMPLETE"; sourceId: string }
  | { code: "OPEN_ISSUE"; sourceId: string }
  | { code: "GOVERNANCE_MATERIAL_MISSING"; field: keyof ProjectCompletionMaterials };

export interface ProjectCompletionListItem {
  completionRequestId: string;
  projectId: string;
  projectStatus: "ACTIVE" | "CLOSING" | "COMPLETED" | "ARCHIVED";
  status: ProjectCompletionRequestStatus;
  rowVersion: number;
  currentSubmissionVersionNo: number;
  gateReasons: ProjectCompletionGateReason[];
  currentReturnReason: string | null;
}

export interface ProjectClosureState {
  projectId: string;
  projectStatus: "ACTIVE" | "CLOSING" | "COMPLETED" | "ARCHIVED";
  projectRowVersion: number;
  isPrimaryKeySubI: boolean;
  requests: ProjectCompletionListItem[];
}

export interface ProjectClosureReadiness {
  projectId: string;
  projectRowVersion: number;
  incompleteRequiredWorkflowStageIds: string[];
  openIssueIds: string[];
  readyForMaterials: boolean;
}

export interface SubmitProjectCompletionInput extends ProjectCompletionMaterials {
  projectId: string;
  expectedProjectRowVersion: number;
  attachmentDraftIds: string[];
  commandId: string;
}

export interface CompletionMutationInput {
  projectId: string;
  completionRequestId: string;
  expectedRowVersion: number;
  commandId: string;
}

export interface ArchiveProjectInput {
  projectId: string;
  expectedProjectRowVersion: number;
  reason: string;
  commandId: string;
}

export interface ProjectClosureRepository {
  getState(actor: CollaborationActor, projectId: string): Promise<ProjectClosureState>;
  checkInitialReadiness(
    actor: CollaborationActor & { roleCode: "KEY_SUB_I" },
    projectId: string,
  ): Promise<ProjectClosureReadiness>;
  submit(input: SubmitProjectCompletionInput & { actor: CollaborationActor & { roleCode: "KEY_SUB_I" } }): Promise<{ completionRequestId: string; status: ProjectCompletionRequestStatus; rowVersion: number }>;
  returnForSupplement(input: CompletionMutationInput & { actor: CollaborationActor & { roleCode: "PMO" }; reason: string }): Promise<void>;
  resubmit(input: CompletionMutationInput & ProjectCompletionMaterials & { actor: CollaborationActor & { roleCode: "KEY_SUB_I" }; attachmentDraftIds: string[] }): Promise<void>;
  withdraw(input: CompletionMutationInput & { actor: CollaborationActor & { roleCode: "KEY_SUB_I" }; reason: string }): Promise<void>;
  approve(input: CompletionMutationInput & { actor: CollaborationActor & { roleCode: "PMO" }; comment: string | null }): Promise<void>;
  archive(input: ArchiveProjectInput & { actor: CollaborationActor & { roleCode: "PMO" } }): Promise<void>;
  restoreArchive(input: ArchiveProjectInput & { actor: CollaborationActor & { roleCode: "PMO" } }): Promise<void>;
}

export function deriveProjectCompletionGateReasons(input: {
  incompleteRequiredWorkflowStageIds: readonly string[];
  openIssueIds: readonly string[];
  materials: ProjectCompletionMaterials;
}): ProjectCompletionGateReason[] {
  const reasons: ProjectCompletionGateReason[] = [];
  for (const sourceId of [...input.incompleteRequiredWorkflowStageIds].sort()) reasons.push({ code: "REQUIRED_NODE_INCOMPLETE", sourceId });
  for (const sourceId of [...input.openIssueIds].sort()) reasons.push({ code: "OPEN_ISSUE", sourceId });
  if (!input.materials.completionSummary.normalize("NFKC").trim()) reasons.push({ code: "GOVERNANCE_MATERIAL_MISSING", field: "completionSummary" });
  if (!input.materials.unfinishedOptionalAndLegacyStatement.normalize("NFKC").trim()) reasons.push({ code: "GOVERNANCE_MATERIAL_MISSING", field: "unfinishedOptionalAndLegacyStatement" });
  if (!input.materials.noUnfinishedItemConfirmed) reasons.push({ code: "GOVERNANCE_MATERIAL_MISSING", field: "noUnfinishedItemConfirmed" });
  if (!input.materials.archiveComplianceSelfCheck.normalize("NFKC").trim()) reasons.push({ code: "GOVERNANCE_MATERIAL_MISSING", field: "archiveComplianceSelfCheck" });
  if (!input.materials.truthConfirmed) reasons.push({ code: "GOVERNANCE_MATERIAL_MISSING", field: "truthConfirmed" });
  return reasons;
}
