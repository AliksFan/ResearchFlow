import type { ProjectExecutionListItem, ProjectExecutionOverview } from "@researchflow/collaboration";
import type { ProjectApplicationListItem } from "@researchflow/project-application";

export type ProjectView = "all" | "current" | "completed" | "archived";
export type ApplicationView = "all" | "editing" | "in_review" | "finished";

export function projectCounts(projects: readonly ProjectExecutionListItem[]) {
  return {
    current: projects.filter(({ projectStatus }) => projectStatus === "ACTIVE" || projectStatus === "CLOSING").length,
    completed: projects.filter(({ projectStatus }) => projectStatus === "COMPLETED").length,
    archived: projects.filter(({ projectStatus }) => projectStatus === "ARCHIVED").length,
    total: projects.length,
  };
}

export function filterProjects(projects: readonly ProjectExecutionListItem[], view: ProjectView, search: string): ProjectExecutionListItem[] {
  const normalized = normalize(search);
  return projects.filter((project) => {
    const matchesView = view === "all"
      || (view === "current" && (project.projectStatus === "ACTIVE" || project.projectStatus === "CLOSING"))
      || (view === "completed" && project.projectStatus === "COMPLETED")
      || (view === "archived" && project.projectStatus === "ARCHIVED");
    const matchesSearch = !normalized || normalize(`${project.projectCode} ${project.projectName}`).includes(normalized);
    return matchesView && matchesSearch;
  });
}

export function filterApplications(applications: readonly ProjectApplicationListItem[], view: ApplicationView, search: string): ProjectApplicationListItem[] {
  const normalized = normalize(search);
  return applications.filter((application) => {
    const matchesView = view === "all"
      || (view === "editing" && (application.status === "DRAFT" || application.status === "RETURNED_FOR_REVISION"))
      || (view === "in_review" && (application.status === "PENDING_ESTABLISHMENT_REVIEW" || application.status === "ON_HOLD"))
      || (view === "finished" && (application.status === "ACTIVE" || application.status === "REJECTED" || application.status === "CANCELLED"));
    const matchesSearch = !normalized || normalize([application.applicationCode, application.projectCode ?? "", application.projectName, application.applicantDisplayName, application.primaryOwnerDisplayName ?? ""].join(" ")).includes(normalized);
    return matchesView && matchesSearch;
  });
}

export function projectStatusLabel(status: ProjectExecutionListItem["projectStatus"]): string {
  return ({ ACTIVE: "进行中", CLOSING: "结题中", COMPLETED: "已完成", ARCHIVED: "已归档" })[status];
}

export function applicationStatusLabel(status: ProjectApplicationListItem["status"]): string {
  return ({ DRAFT: "草稿", PENDING_ESTABLISHMENT_REVIEW: "待 PMO 审核", RETURNED_FOR_REVISION: "已退回修改", ON_HOLD: "暂缓审核", ACTIVE: "已建档", REJECTED: "已拒绝", CANCELLED: "已撤回" })[status];
}

export function applicationViewCounts(applications: readonly ProjectApplicationListItem[]) {
  return { all: applications.length, editing: filterApplications(applications, "editing", "").length, in_review: filterApplications(applications, "in_review", "").length, finished: filterApplications(applications, "finished", "").length };
}

const WORKSPACE_APPLICATION_STATUSES = new Set<ProjectApplicationListItem["status"]>([
  "DRAFT",
  "RETURNED_FOR_REVISION",
  "PENDING_ESTABLISHMENT_REVIEW",
  "ON_HOLD",
]);

export interface ProjectWorkspaceSummary {
  currentStageLabel: string;
  openIssueCount: number;
  issueRiskLevel: "NONE" | "RISK" | "BLOCKED";
  completedNodeCount: number;
  applicableNodeCount: number;
}

export function deriveProjectWorkspaceSummary(overview: ProjectExecutionOverview): ProjectWorkspaceSummary {
  const applicableStages = overview.stages.filter(({ applicability }) => applicability !== "NOT_APPLICABLE");
  const applicableNodes = applicableStages.flatMap(({ workflows }) => workflows.filter(({ applicability }) => applicability !== "NOT_APPLICABLE"));
  const currentStage = applicableStages.find(({ workflows }) => workflows.some(({ applicability, executionStatus }) => applicability !== "NOT_APPLICABLE" && executionStatus !== "COMPLETED"));
  const completedNodeCount = applicableNodes.filter(({ executionStatus }) => executionStatus === "COMPLETED").length;
  let openIssueCount = 0;
  let issueRiskLevel: ProjectWorkspaceSummary["issueRiskLevel"] = "NONE";
  for (const node of applicableNodes) {
    openIssueCount += node.openIssueCount;
    if (node.openIssueCount > 0 && node.issueRiskLevel === "BLOCKED") issueRiskLevel = "BLOCKED";
    if (node.openIssueCount > 0 && node.issueRiskLevel === "RISK" && issueRiskLevel === "NONE") issueRiskLevel = "RISK";
  }
  return {
    currentStageLabel: applicableNodes.length === 0
      ? "暂无适用执行节点"
      : currentStage?.stageName ?? (overview.projectStatus === "CLOSING" ? "结题处理中" : "执行节点已完成"),
    openIssueCount,
    issueRiskLevel,
    completedNodeCount,
    applicableNodeCount: applicableNodes.length,
  };
}

export function filterWorkspaceProjects(overviews: readonly ProjectExecutionOverview[], search: string): ProjectExecutionOverview[] {
  const normalized = normalize(search);
  if (!normalized) return [...overviews];
  return overviews.filter((overview) => normalize([
    overview.projectCode,
    overview.basicInformation.applicationCode,
    overview.projectName,
    overview.basicInformation.primaryKeySubIDisplayName ?? "",
    ...overview.basicInformation.otherKeySubIDisplayNames,
  ].join(" ")).includes(normalized));
}

export function filterWorkspaceApplications(applications: readonly ProjectApplicationListItem[], search: string): ProjectApplicationListItem[] {
  const eligible = applications.filter(({ status }) => WORKSPACE_APPLICATION_STATUSES.has(status));
  const normalized = normalize(search);
  if (!normalized) return eligible;
  return eligible.filter((application) => normalize([
    application.applicationCode,
    application.projectName,
    application.applicantDisplayName,
    application.primaryOwnerDisplayName ?? "",
  ].join(" ")).includes(normalized));
}

export function formatWorkspaceDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN");
}
