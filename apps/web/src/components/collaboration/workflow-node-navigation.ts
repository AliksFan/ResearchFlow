import type { CollaborationRoleCode } from "@researchflow/collaboration";

export type WorkflowNodeTab = "report" | "progress" | "issues";
export type WorkflowReportType = "progress" | "issue" | "completion";

export function normalizeWorkflowNodeTab(role: CollaborationRoleCode, value?: string): WorkflowNodeTab {
  if (value === "issues") return "issues";
  if (value === "progress" || value === "completion") return "progress";
  if (value === "report" && role === "KEY_SUB_I") return "report";
  return role === "KEY_SUB_I" ? "report" : "progress";
}

export function normalizeWorkflowReportType(value?: string): WorkflowReportType {
  return value === "issue" || value === "completion" ? value : "progress";
}
