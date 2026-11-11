import {
  PMO_DASHBOARD_APPLICATION_VIEWS,
  PMO_DASHBOARD_FOCUSES,
  PMO_DASHBOARD_SORTS,
  type PmoDashboardActionSummary,
  type PmoDashboardProjectItem,
  type PmoDashboardQuery,
} from "@researchflow/collaboration";

export type DashboardSearchParams = Record<string, string | string[] | undefined>;

export function parsePmoDashboardQuery(params: DashboardSearchParams): PmoDashboardQuery {
  const focus = single(params.focus);
  const applicationView = single(params.applicationView);
  const sort = single(params.sort);
  const order = single(params.order);
  const validSort = PMO_DASHBOARD_SORTS.includes(sort as PmoDashboardQuery["sort"]);
  const validOrder = order === "asc" || order === "desc";
  const requestedPage = Number.parseInt(single(params.page) ?? "1", 10);
  return {
    focus: PMO_DASHBOARD_FOCUSES.includes(focus as PmoDashboardQuery["focus"]) ? focus as PmoDashboardQuery["focus"] : "all",
    applicationView: PMO_DASHBOARD_APPLICATION_VIEWS.includes(applicationView as PmoDashboardQuery["applicationView"])
      ? applicationView as PmoDashboardQuery["applicationView"]
      : "active",
    q: (single(params.q) ?? "").normalize("NFKC").trim(),
    hideFinished: single(params.hideFinished) === "1",
    sort: validSort && validOrder ? sort as PmoDashboardQuery["sort"] : "action",
    order: validSort && validOrder ? order : "desc",
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    pageSize: 50,
  };
}

export function dashboardHref(query: PmoDashboardQuery, changes: Partial<Omit<PmoDashboardQuery, "pageSize">> = {}): string {
  const next = { ...query, ...changes };
  const params = new URLSearchParams({ focus: next.focus, sort: next.sort, order: next.order });
  if (next.focus === "applications") params.set("applicationView", next.applicationView);
  if (next.q) params.set("q", next.q);
  if (next.hideFinished) params.set("hideFinished", "1");
  if (next.page > 1) params.set("page", String(next.page));
  return `/workspace/projects?${params}`;
}

export function applicationDetailHref(projectId: string, returnTo: string): string {
  const params = new URLSearchParams({ returnTo });
  return `/workspace/pmo/project-applications/${projectId}?${params}`;
}

export function projectDetailHref(projectId: string, returnTo: string): string {
  const params = new URLSearchParams({ returnTo });
  return `/workspace/projects/${projectId}/execution?${params}`;
}

export function actionHref(projectId: string, action: PmoDashboardActionSummary, returnTo: string): string {
  const params = new URLSearchParams({ returnTo });
  if (action.target.kind === "WORKFLOW_COMPLETION") {
    params.set("node", action.target.workflowStageId);
    params.set("tab", "progress");
  } else if (action.target.kind === "ISSUE") {
    params.set("node", action.target.workflowStageId);
    params.set("tab", "issues");
    params.set("issue", action.target.issueId);
  } else {
    params.set("panel", "closure");
  }
  return `/workspace/projects/${projectId}/execution?${params}`;
}

export function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  const nowParts = shanghaiParts(new Date());
  const valueParts = shanghaiParts(date);
  const time = `${valueParts.hour}:${valueParts.minute}`;
  return nowParts.date === valueParts.date ? `今天 ${time}` : `${valueParts.date} ${time}`;
}

export function formatActionLabel(action: PmoDashboardActionSummary, generatedAt: string): string {
  const age = elapsedLabel(action.oldestStartedAt, generatedAt);
  if (action.category === "CLOSURE") return `结题处理中 · ${closureLabel(action.closureStatus)}`;
  const prefix = action.category === "PMO" ? "PMO 处理中" : action.category === "DEAN_DECISION" ? "待院长决策" : action.category === "PMO_IMPLEMENTATION" ? "已决策待落实" : "待确认";
  return `${prefix} · ${action.taskCount} 项 · ${age}`;
}

export function exceptionLabels(item: PmoDashboardProjectItem): Array<{ label: string; tone: "red" | "amber" | "neutral" }> {
  const labels: Array<{ label: string; tone: "red" | "amber" | "neutral" }> = [];
  if (item.exceptionSummary.closureBlocked) labels.push({ label: `结题受阻 · ${item.exceptionSummary.closureGateReasonCount} 项`, tone: "red" });
  if (item.exceptionSummary.highestIssueRisk === "BLOCKED") labels.push({ label: `${item.exceptionSummary.openIssueCount} 项阻塞`, tone: "red" });
  else if (item.exceptionSummary.highestIssueRisk === "RISK") labels.push({ label: `${item.exceptionSummary.openIssueCount} 项风险`, tone: "amber" });
  return labels.length ? labels.slice(0, 2) : [{ label: "无异常", tone: "neutral" }];
}

export function sortHref(query: PmoDashboardQuery, sort: PmoDashboardQuery["sort"]): string {
  const defaultOrder = sort === "exception" || sort === "action" ? "desc" : "asc";
  return dashboardHref(query, { sort, order: query.sort === sort ? query.order === "asc" ? "desc" : "asc" : defaultOrder, page: 1 });
}

export function projectStatusLabel(status: PmoDashboardProjectItem["projectStatus"]): string | null {
  return status === "CLOSING" ? "结题中" : status === "COMPLETED" ? "已完成" : status === "ARCHIVED" ? "已归档 · 只读" : null;
}

function elapsedLabel(startedAt: string | null, generatedAt: string): string {
  if (!startedAt) return "时间未记录";
  const elapsed = Math.max(0, Math.floor((new Date(generatedAt).getTime() - new Date(startedAt).getTime()) / 86_400_000));
  return elapsed === 0 ? "今天" : `${elapsed} 天`;
}

function closureLabel(status: PmoDashboardActionSummary["closureStatus"]): string {
  return status === "CLOSURE_BLOCKED" ? "当前受阻" : status === "CLOSURE_PENDING_PMO_REVIEW" ? "待 PMO 复核" : status === "CLOSURE_RETURNED_FOR_SUPPLEMENT" ? "待负责人补充" : "当前处理中";
}

function shanghaiParts(value: Date): { date: string; hour: string; minute: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: get("hour"), minute: get("minute") };
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
