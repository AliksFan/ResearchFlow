import type { CollaborationActor } from "./contracts.js";

export const PMO_DASHBOARD_FOCUSES = ["all", "applications", "pmo", "dean", "implementation", "confirmation_closure"] as const;
export type PmoDashboardFocus = (typeof PMO_DASHBOARD_FOCUSES)[number];

export const PMO_DASHBOARD_APPLICATION_VIEWS = ["active", "editing", "in_review", "finished"] as const;
export type PmoDashboardApplicationView = (typeof PMO_DASHBOARD_APPLICATION_VIEWS)[number];

export const PMO_DASHBOARD_SORTS = ["project", "owner", "stage", "exception", "action"] as const;
export type PmoDashboardSort = (typeof PMO_DASHBOARD_SORTS)[number];
export type PmoDashboardOrder = "asc" | "desc";

export interface PmoDashboardQuery {
  focus: PmoDashboardFocus;
  applicationView: PmoDashboardApplicationView;
  q: string;
  hideFinished: boolean;
  sort: PmoDashboardSort;
  order: PmoDashboardOrder;
  page: number;
  pageSize: 50;
}

export interface PmoProjectDashboardResult {
  snapshotAt: string;
  counts: {
    allItems: number;
    applicationItems: number;
    pendingPmoProjects: number;
    pendingDeanProjects: number;
    implementationProjects: number;
    confirmationClosureProjects: number;
  };
  filteredTotal: number;
  page: number;
  pageSize: 50;
  items: PmoDashboardItem[];
}

export type PmoDashboardItem = PmoDashboardProjectItem | PmoDashboardApplicationItem;

export interface PmoDashboardProjectItem {
  itemType: "FORMAL_PROJECT";
  projectId: string;
  projectCode: string;
  applicationCode: string;
  projectName: string;
  projectStatus: "ACTIVE" | "CLOSING" | "COMPLETED" | "ARCHIVED";
  leadOrganizationName: string | null;
  primaryKeySubIDisplayName: string | null;
  otherKeySubIDisplayNames: string[];
  stageSummary: {
    currentStageId: string | null;
    currentStageName: string;
    currentStageSortOrder: number | null;
    completedStageCount: number;
    applicableStageCount: number;
  };
  exceptionSummary: {
    openIssueCount: number;
    highestIssueRisk: "NONE" | "RISK" | "BLOCKED";
    closureBlocked: boolean;
    closureGateReasonCount: number;
  };
  actionSummaries: PmoDashboardActionSummary[];
}

export interface PmoDashboardApplicationItem {
  itemType: "PROJECT_APPLICATION";
  projectId: string;
  applicationCode: string;
  projectName: string;
  applicationStatus: "DRAFT" | "PENDING_ESTABLISHMENT_REVIEW" | "RETURNED_FOR_REVISION" | "ON_HOLD" | "REJECTED" | "CANCELLED";
  applicantDisplayName: string;
  primaryOwnerDisplayName: string | null;
  submittedAt: string | null;
  updatedAt: string;
}

export interface PmoDashboardActionSummary {
  category: "PMO" | "DEAN_DECISION" | "PMO_IMPLEMENTATION" | "CONFIRMATION" | "CLOSURE";
  taskCount: number;
  oldestStartedAt: string | null;
  overdue: boolean;
  target:
    | { kind: "WORKFLOW_COMPLETION"; workflowStageId: string }
    | { kind: "ISSUE"; workflowStageId: string; issueId: string }
    | { kind: "CLOSURE" };
  closureStatus?: "CLOSURE_BLOCKED" | "CLOSURE_PENDING_PMO_REVIEW" | "CLOSURE_RETURNED_FOR_SUPPLEMENT";
}

export interface PmoDashboardRepository {
  queryProjects(actor: CollaborationActor, query: PmoDashboardQuery): Promise<PmoProjectDashboardResult>;
}
