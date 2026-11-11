import type { CollaborationActor } from "./contracts.js";

export const DEAN_DASHBOARD_FOCUSES = ["all", "decision", "implementation", "confirmation", "reporter_feedback"] as const;
export type DeanDashboardFocus = (typeof DEAN_DASHBOARD_FOCUSES)[number];
export const DEAN_DASHBOARD_SORTS = ["project", "owner", "stage", "exception", "action"] as const;
export type DeanDashboardSort = (typeof DEAN_DASHBOARD_SORTS)[number];
export type DeanDashboardOrder = "asc" | "desc";

export interface DeanDashboardQuery {
  focus: DeanDashboardFocus;
  q: string;
  hideFinished: boolean;
  sort: DeanDashboardSort;
  order: DeanDashboardOrder;
  page: number;
  pageSize: 50;
}

export interface DeanProjectDashboardResult {
  snapshotAt: string;
  counts: {
    allProjects: number;
    decisionProjects: number;
    implementationProjects: number;
    confirmationProjects: number;
    reporterFeedbackProjects: number;
  };
  filteredTotal: number;
  page: number;
  pageSize: 50;
  items: DeanDashboardProjectItem[];
}

export interface DeanDashboardProjectItem {
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
  actionSummaries: DeanDashboardActionSummary[];
}

export interface DeanDashboardActionSummary {
  category: "DEAN_DECISION" | "PMO_IMPLEMENTATION" | "DEAN_IMPLEMENTATION_CONFIRMATION" | "REPORTER_FEEDBACK";
  taskCount: number;
  oldestStartedAt: string | null;
  overdue: boolean;
  actionableByCurrentDean: boolean;
  target: { kind: "ISSUE"; workflowStageId: string; issueId: string };
}

export interface DeanDashboardRepository {
  queryProjects(actor: CollaborationActor, query: DeanDashboardQuery): Promise<DeanProjectDashboardResult>;
}
