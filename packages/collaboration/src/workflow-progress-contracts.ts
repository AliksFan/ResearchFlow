import type { CollaborationActor } from "./contracts.js";

export type RevisionValueMode = "KEEP" | "SET" | "CLEAR";

export interface SubmitWorkflowProgressInput {
  projectId: string;
  projectWorkflowStageId: string;
  progressSummary: string;
  basis: string;
  expectedCompletionDate: string | null;
  budgetAmountCny: string | null;
  attachmentDraftIds: string[];
}

export interface CorrectWorkflowProgressInput {
  projectId: string;
  workflowUpdateId: string;
  expectedLatestSequenceNo: number;
  correctionReason: string;
  revisedProgressSummary: string | null;
  revisedBasis: string | null;
  revisedExpectedDateMode: RevisionValueMode;
  revisedExpectedDate: string | null;
  budgetAmountMode: RevisionValueMode;
  revisedBudgetAmountCny: string | null;
}

export interface WorkflowProgressRecord {
  id: string;
  projectId: string;
  projectWorkflowStageId: string;
  submittedByPersonId: string;
  progressSummary: string;
  basis: string;
  expectedCompletionDate: string | null;
  effectiveBudgetAmountCny: string | null;
  latestCorrectionSequenceNo: number;
  submittedAt: string;
  attachments: WorkflowProgressAttachment[];
}

export interface WorkflowProgressAttachment {
  assetId: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
}

export interface WorkflowProgressCorrectionResult {
  workflowUpdateId: string;
  sequenceNo: number;
  effectiveProgressSummary: string;
  effectiveBasis: string;
  effectiveExpectedCompletionDate: string | null;
  effectiveBudgetAmountCny: string | null;
  correctedAt: string;
}

export interface WorkflowProgressRepository {
  submitProgress(
    input: SubmitWorkflowProgressInput & { actor: CollaborationActor },
  ): Promise<WorkflowProgressRecord>;
  correctProgress(
    input: CorrectWorkflowProgressInput & { actor: CollaborationActor },
  ): Promise<WorkflowProgressCorrectionResult>;
  listProgress(actor: CollaborationActor, projectId: string): Promise<WorkflowProgressRecord[]>;
  getRecordedBudgetTotal(actor: CollaborationActor, projectId: string): Promise<string>;
}
