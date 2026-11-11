export const CORE_COLLABORATION_ROLES = ["PMO", "DEAN", "KEY_SUB_I"] as const;
export type CollaborationRoleCode = (typeof CORE_COLLABORATION_ROLES)[number];

export interface CollaborationActor {
  personId: string;
  sessionId: string;
  roleCode: CollaborationRoleCode;
}

export type PlanItemApplicability = "REQUIRED" | "OPTIONAL" | "NOT_APPLICABLE";
export type AttachmentRequirement = "NONE" | "OPTIONAL" | "REQUIRED";
export type WorkflowExecutionStatus =
  | "NOT_STARTED"
  | "ACTIVE"
  | "PENDING_COMPLETION_CONFIRMATION"
  | "COMPLETED";

export const COLLABORATION_RESPONSIBILITY_TYPES = [
  "WORKFLOW_COMPLETION_PMO_REVIEW",
  "PROJECT_COMPLETION_PMO_REVIEW",
  "PROJECT_COMPLETION_SUPPLEMENT",
  "ISSUE_DEAN_DECISION",
  "ISSUE_PMO_IMPLEMENTATION",
  "ISSUE_REPORTER_SUPPLEMENT",
  "ISSUE_REPORTER_CONFIRMATION",
] as const;
export type CollaborationResponsibilityType =
  (typeof COLLABORATION_RESPONSIBILITY_TYPES)[number];

export interface CollaborationTimeLimitValue {
  responsibilityType: CollaborationResponsibilityType;
  timeLimitDays: number;
  reminderIntervalDays: number;
}

export const DEFAULT_COLLABORATION_TIME_LIMITS = [
  { responsibilityType: "WORKFLOW_COMPLETION_PMO_REVIEW", timeLimitDays: 3, reminderIntervalDays: 1 },
  { responsibilityType: "PROJECT_COMPLETION_PMO_REVIEW", timeLimitDays: 3, reminderIntervalDays: 1 },
  { responsibilityType: "PROJECT_COMPLETION_SUPPLEMENT", timeLimitDays: 5, reminderIntervalDays: 2 },
  { responsibilityType: "ISSUE_DEAN_DECISION", timeLimitDays: 3, reminderIntervalDays: 1 },
  { responsibilityType: "ISSUE_PMO_IMPLEMENTATION", timeLimitDays: 5, reminderIntervalDays: 2 },
  { responsibilityType: "ISSUE_REPORTER_SUPPLEMENT", timeLimitDays: 3, reminderIntervalDays: 1 },
  { responsibilityType: "ISSUE_REPORTER_CONFIRMATION", timeLimitDays: 3, reminderIntervalDays: 1 },
] as const satisfies readonly CollaborationTimeLimitValue[];

export interface CollaborationTimeLimit extends CollaborationTimeLimitValue {
  id: string;
  projectId: string | null;
  updatedAt: string;
}

export interface EffectiveCollaborationTimeLimit extends CollaborationTimeLimit {
  source: "GLOBAL_DEFAULT" | "PROJECT_OVERRIDE";
}

export interface GlobalTimeLimitChange extends CollaborationTimeLimitValue {
  expectedUpdatedAt: string | null;
}

export type ProjectTimeLimitChange = {
  responsibilityType: CollaborationResponsibilityType;
  expectedProjectSettingUpdatedAt: string | null;
} & (
  | { mode: "FOLLOW_GLOBAL" }
  | {
      mode: "PROJECT_OVERRIDE";
      timeLimitDays: number;
      reminderIntervalDays: number;
    }
);

export interface ProjectExecutionListItem {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectStatus: "ACTIVE" | "CLOSING" | "COMPLETED" | "ARCHIVED";
}

export interface ProjectExecutionOverview extends ProjectExecutionListItem {
  swimlaneName: string;
  canEditSwimlane: boolean;
  basicInformation: {
    applicationCode: string;
    projectSummary: string | null;
    applicantDisplayName: string;
    primaryKeySubIDisplayName: string | null;
    otherKeySubIDisplayNames: string[];
    leadOrganizationName: string | null;
    sponsorName: string | null;
    diseaseAreaDisplayName: string | null;
    researchTypeDisplayName: string | null;
    plannedEndDate: string | null;
    fundingRecordAmountCny: string | null;
    establishedByDisplayName: string | null;
    establishedAt: string | null;
    completedAt: string | null;
    archivedAt: string | null;
  };
  stages: Array<{
    stageId: string;
    stageCode: string;
    stageName: string;
    applicability: PlanItemApplicability;
    plannedStartDate: string | null;
    plannedEndDate: string | null;
    workflows: Array<{
      workflowStageId: string;
      rowVersion: number;
      workflowCode: string;
      workflowName: string;
      taskName: string;
      taskDescription: string;
      applicability: PlanItemApplicability;
      attachmentRequirement: AttachmentRequirement;
      plannedStartDate: string | null;
      plannedEndDate: string | null;
      ownerRoles: CollaborationRoleCode[];
      executionStatus: WorkflowExecutionStatus;
      openIssueCount: number;
      issueRiskLevel: "NONE" | "RISK" | "BLOCKED";
      predecessorWorkflowStageIds: string[];
    }>;
  }>;
}

export function aggregateOpenIssueRisk(riskLevels: readonly ("NONE" | "RISK" | "BLOCKED")[]): {
  openIssueCount: number;
  issueRiskLevel: "NONE" | "RISK" | "BLOCKED";
} {
  return {
    openIssueCount: riskLevels.length,
    issueRiskLevel: riskLevels.includes("BLOCKED") ? "BLOCKED" : riskLevels.includes("RISK") ? "RISK" : "NONE",
  };
}

export type CollaborationErrorCode =
  | "COLLABORATION_FORBIDDEN"
  | "PROJECT_NOT_FOUND"
  | "INVALID_TIME_LIMIT"
  | "TIME_LIMIT_CONFLICT"
  | "INVALID_PROGRESS_INPUT"
  | "INVALID_BUDGET_AMOUNT"
  | "INVALID_CORRECTION"
  | "PROJECT_NOT_ACTIVE"
  | "WORKFLOW_NOT_REPORTABLE"
  | "PROGRESS_NOT_FOUND"
  | "PROGRESS_CORRECTION_FORBIDDEN"
  | "PROGRESS_CORRECTION_CONFLICT"
  | "WORKFLOW_DEPENDENCY_SELF_REFERENCE"
  | "WORKFLOW_DEPENDENCY_NODE_NOT_FOUND"
  | "WORKFLOW_DEPENDENCY_DUPLICATE"
  | "WORKFLOW_DEPENDENCY_CYCLE"
  | "WORKFLOW_DEPENDENCY_NOT_APPLICABLE_PREDECESSOR"
  | "WORKFLOW_DEPENDENCY_REQUIRED_HAS_OPTIONAL_ANCESTOR"
  | "WORKFLOW_COMPLETION_CONFLICT"
  | "WORKFLOW_COMPLETION_INVALID_INPUT"
  | "WORKFLOW_COMPLETION_PREDECESSOR_BLOCKED"
  | "WORKFLOW_COMPLETION_ISSUE_BLOCKED"
  | "WORKFLOW_COMPLETION_ATTACHMENT_REQUIRED"
  | "ISSUE_INVALID_INPUT"
  | "ISSUE_INVALID_TRANSITION"
  | "ISSUE_CONFLICT"
  | "ISSUE_NOT_FOUND"
  | "ISSUE_REPORTER_FORBIDDEN"
  | "ISSUE_NOTIFICATION_RECIPIENT_REQUIRED"
  | "PROJECT_CLOSURE_INVALID_INPUT"
  | "PROJECT_CLOSURE_CONFLICT"
  | "PROJECT_CLOSURE_BLOCKED"
  | "NOTIFICATION_INVALID_INPUT"
  | "NOTIFICATION_NOT_FOUND"
  | "LIFECYCLE_TEMPLATE_INVALID_INPUT"
  | "LIFECYCLE_TEMPLATE_NAME_DUPLICATE"
  | "LIFECYCLE_TEMPLATE_CONFLICT"
  | "LIFECYCLE_TEMPLATE_VERSION_REFERENCED"
  | "PROJECT_SWIMLANE_FORBIDDEN"
  | "PROJECT_SWIMLANE_INVALID_INPUT"
  | "PROJECT_SWIMLANE_INVALID_GRAPH"
  | "PROJECT_SWIMLANE_COMPLETED_NODE_RESTRICTED"
  | "PROJECT_SWIMLANE_CONFLICT"
  | "PROJECT_BASIC_INFORMATION_FORBIDDEN"
  | "PROJECT_BASIC_INFORMATION_INVALID_INPUT"
  | "PROJECT_BASIC_INFORMATION_PATIENT_DATA_PROHIBITED"
  | "PROJECT_BASIC_INFORMATION_NO_CHANGES"
  | "PROJECT_BASIC_INFORMATION_CONFLICT"
  | "DICTIONARY_INVALID_INPUT"
  | "DICTIONARY_OPTION_IN_USE"
  | "DICTIONARY_OPTION_RESERVED"
  | "DICTIONARY_CONFLICT";
