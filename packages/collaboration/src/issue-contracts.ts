import type { CollaborationActor } from "./contracts.js";

export const ISSUE_HANDLING_STATES = [
  "PMO_INITIAL_REVIEW",
  "REPORTER_SUPPLEMENT",
  "PMO_COORDINATION",
  "DEAN_DECISION",
  "PMO_DECISION_SUPPLEMENT",
  "PMO_IMPLEMENTATION",
  "DEAN_IMPLEMENTATION_CONFIRMATION",
  "REPORTER_RESOLUTION_CONFIRMATION",
  "RESOLVED",
  "CLOSED_INVALID",
] as const;
export type IssueHandlingState = (typeof ISSUE_HANDLING_STATES)[number];

export type IssueRiskLevel = "NONE" | "RISK" | "BLOCKED";
export type IssueVisibilityScope = "PMO_ONLY" | "PMO_AND_DEAN" | "ISSUE_PARTICIPANTS";
export type IssueDecisionRoundStatus =
  | "PENDING_DEAN_DECISION"
  | "PENDING_PMO_SUPPLEMENT"
  | "PENDING_PMO_IMPLEMENTATION"
  | "PENDING_DEAN_REVIEW"
  | "PENDING_REPORTER_CONFIRMATION"
  | "COMPLETED";
export type IssueDeanDecisionCode =
  | "AGREE_WITH_PMO_RECOMMENDATION"
  | "COORDINATE_RESOURCES"
  | "OTHER";
export type IssueInvalidCloseReason =
  | "DUPLICATE"
  | "INVALID"
  | "INCORRECT"
  | "OUT_OF_SCOPE"
  | "CREATED_BY_MISTAKE";

export interface IssueListItem {
  id: string;
  projectId: string;
  projectWorkflowStageId: string;
  issueNo: string;
  title: string;
  description: string;
  expectedSupport: string | null;
  currentRiskLevel: IssueRiskLevel;
  currentState: IssueHandlingState;
  rowVersion: number;
  reportedByPersonId: string;
  reportedRoleCode: "PMO" | "KEY_SUB_I";
  currentDecisionRoundId: string | null;
  currentDecisionRoundStatus: IssueDecisionRoundStatus | null;
  pendingReviewTransferId: string | null;
  attachments: IssueAttachmentListItem[];
  activities: IssueActivityListItem[];
  sharedSummaries: IssueSharedSummaryListItem[];
}

export interface IssueActivityListItem {
  id: string;
  sequenceNo: number;
  activityType: string;
  performedRoleCode: string;
  detail: string;
  visibilityScope: IssueVisibilityScope;
  createdAt: string;
  attachments: IssueAttachmentListItem[];
}

export interface IssueAttachmentListItem {
  assetId: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  attachedAt: string;
}

export interface IssueSharedSummaryListItem {
  id: string;
  summaryType: "INITIAL" | "COORDINATION" | "IMPLEMENTATION" | "RESOLUTION" | "INVALID_CLOSURE";
  content: string;
  publishedRoleCode: string;
  publishedAt: string;
}

export interface IssueTypeOption {
  id: string;
  code: string;
  name: string;
}

export interface IssueContact {
  ref: string;
  name: string;
  email: string;
  source: "SYSTEM_PERSON" | "EXTERNAL_CONTACT";
  category: string;
}

export interface IssueEmailRecordResult {
  id: string;
  status: "FAILED";
  failureCode: "SMTP_NOT_CONFIGURED";
}

export interface CreateIssueInput {
  projectId: string;
  projectWorkflowStageId: string;
  issueTypeOptionId: string;
  issueTypeOtherText: string | null;
  title: string;
  description: string;
  expectedSupport: string | null;
  currentRiskLevel: Exclude<IssueRiskLevel, "NONE">;
  sharedSummary: string | null;
  attachmentDraftIds: string[];
  commandId: string;
}

export interface IssueMutationInput {
  projectId: string;
  issueId: string;
  expectedRowVersion: number;
  commandId: string;
}

export interface AppendIssueCoordinationInput {
  projectId: string;
  issueId: string;
  detail: string;
  visibilityScope: IssueVisibilityScope;
  expectedRowVersion?: number;
  attachmentDraftIds: string[];
  commandId: string;
}

export interface RecordDeanDecisionInput extends IssueMutationInput {
  decisionCode: IssueDeanDecisionCode;
  decisionContent: string | null;
  pmoImplementationInstruction: string | null;
  implementationReviewRequired: boolean | undefined;
  attachmentDraftIds: string[];
}

export interface IssueRepository {
  list(actor: CollaborationActor, projectId: string): Promise<IssueListItem[]>;
  listIssueTypes(actor: CollaborationActor, projectId: string): Promise<IssueTypeOption[]>;
  listContacts(actor: CollaborationActor, projectId: string): Promise<IssueContact[]>;
  createExternalContact(input: { actor: CollaborationActor; projectId: string; name: string; email: string; category: string }): Promise<IssueContact>;
  recordManualEmail(input: { actor: CollaborationActor; projectId: string; issueId: string; subject: string; body: string; recipientRefs: string[]; idempotencyKey: string }): Promise<IssueEmailRecordResult>;
  create(input: CreateIssueInput & {
    actor: CollaborationActor & { roleCode: "PMO" | "KEY_SUB_I" };
  }): Promise<IssueListItem>;
  returnForSupplement(input: IssueMutationInput & { actor: CollaborationActor; reason: string }): Promise<void>;
  supplement(input: IssueMutationInput & {
    actor: CollaborationActor;
    latestProgress: string | null;
    supplementalDetail: string;
    expectedSupport: string | null;
    attachmentDraftIds: string[];
  }): Promise<void>;
  appendCoordination(input: AppendIssueCoordinationInput & { actor: CollaborationActor }): Promise<void>;
  submitResolution(input: IssueMutationInput & { actor: CollaborationActor; result: string; attachmentDraftIds: string[] }): Promise<void>;
  closeInvalid(input: IssueMutationInput & {
    actor: CollaborationActor;
    reasonCode: IssueInvalidCloseReason;
    conclusionSummary: string;
    duplicateIssueId: string | null;
  }): Promise<void>;
  escalateToDean(input: IssueMutationInput & {
    actor: CollaborationActor;
    pmoAssessment: string | null;
    recommendation: string | null;
    decisionQuestion: string;
    suggestedDeadline: string | null;
    attachmentDraftIds: string[];
  }): Promise<void>;
  recordDeanDecision(input: Omit<RecordDeanDecisionInput, "implementationReviewRequired"> & {
    actor: CollaborationActor;
    implementationReviewRequired: boolean;
  }): Promise<void>;
  requestDecisionSupplement(input: IssueMutationInput & { actor: CollaborationActor; reason: string }): Promise<void>;
  resubmitDecisionMaterials(input: IssueMutationInput & { actor: CollaborationActor; content: string }): Promise<void>;
  submitImplementation(input: IssueMutationInput & {
    actor: CollaborationActor;
    decisionRoundId: string;
    resultSummary: string;
    attachmentDraftIds: string[];
  }): Promise<void>;
  reviewImplementation(input: IssueMutationInput & {
    actor: CollaborationActor;
    decision: "ACCEPTED" | "RETURNED";
    comment: string | null;
  }): Promise<void>;
  requestDeanReviewTransfer(input: IssueMutationInput & { actor: CollaborationActor; decisionRoundId: string; reason: string }): Promise<void>;
  acceptDeanReviewTransfer(input: IssueMutationInput & { actor: CollaborationActor; transferId: string }): Promise<void>;
  confirmResolution(input: IssueMutationInput & {
    actor: CollaborationActor;
    resolved: boolean;
    confirmation: string | null;
  }): Promise<void>;
}

const transitions: Readonly<Record<IssueHandlingState, readonly IssueHandlingState[]>> = {
  PMO_INITIAL_REVIEW: ["REPORTER_SUPPLEMENT", "PMO_COORDINATION", "DEAN_DECISION", "CLOSED_INVALID"],
  REPORTER_SUPPLEMENT: ["PMO_INITIAL_REVIEW"],
  PMO_COORDINATION: ["REPORTER_SUPPLEMENT", "DEAN_DECISION", "REPORTER_RESOLUTION_CONFIRMATION", "CLOSED_INVALID"],
  DEAN_DECISION: ["PMO_DECISION_SUPPLEMENT", "PMO_IMPLEMENTATION"],
  PMO_DECISION_SUPPLEMENT: ["DEAN_DECISION"],
  PMO_IMPLEMENTATION: ["DEAN_IMPLEMENTATION_CONFIRMATION", "REPORTER_RESOLUTION_CONFIRMATION"],
  DEAN_IMPLEMENTATION_CONFIRMATION: ["PMO_IMPLEMENTATION", "REPORTER_RESOLUTION_CONFIRMATION"],
  REPORTER_RESOLUTION_CONFIRMATION: ["RESOLVED", "PMO_COORDINATION"],
  RESOLVED: [],
  CLOSED_INVALID: [],
};

export function assertIssueTransition(from: IssueHandlingState, to: IssueHandlingState): void {
  if (!transitions[from].includes(to)) {
    const error = new Error("ISSUE_INVALID_TRANSITION") as Error & { code: string };
    error.code = "ISSUE_INVALID_TRANSITION";
    throw error;
  }
}

export function issueActivityVisibilityScopes(roleCode: CollaborationActor["roleCode"]): IssueVisibilityScope[] {
  if (roleCode === "PMO") return ["PMO_ONLY", "PMO_AND_DEAN", "ISSUE_PARTICIPANTS"];
  if (roleCode === "DEAN") return ["PMO_AND_DEAN", "ISSUE_PARTICIPANTS"];
  if (roleCode === "KEY_SUB_I") return ["ISSUE_PARTICIPANTS"];
  return [];
}
