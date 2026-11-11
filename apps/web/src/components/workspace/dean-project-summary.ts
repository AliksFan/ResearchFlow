import { DEAN_DASHBOARD_FOCUSES, DEAN_DASHBOARD_SORTS, type DeanDashboardActionSummary, type DeanDashboardProjectItem, type DeanDashboardQuery } from "@researchflow/collaboration";

export type DeanDashboardSearchParams = Record<string, string | string[] | undefined>;

export function parseDeanDashboardQuery(params: DeanDashboardSearchParams): DeanDashboardQuery {
  const focus = single(params.focus);
  const sort = single(params.sort);
  const order = single(params.order);
  const page = Number.parseInt(single(params.page) ?? "1", 10);
  return {
    focus: DEAN_DASHBOARD_FOCUSES.includes(focus as DeanDashboardQuery["focus"]) ? focus as DeanDashboardQuery["focus"] : "all",
    q: (single(params.q) ?? "").normalize("NFKC").trim().slice(0, 100),
    hideFinished: single(params.hideFinished) === "1",
    sort: DEAN_DASHBOARD_SORTS.includes(sort as DeanDashboardQuery["sort"]) ? sort as DeanDashboardQuery["sort"] : "action",
    order: order === "asc" || order === "desc" ? order : "desc",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: 50,
  };
}

export function deanDashboardHref(query: DeanDashboardQuery, changes: Partial<Omit<DeanDashboardQuery, "pageSize">> = {}) {
  const next = { ...query, ...changes };
  const params = new URLSearchParams({ focus: next.focus, sort: next.sort, order: next.order });
  if (next.q) params.set("q", next.q);
  if (next.hideFinished) params.set("hideFinished", "1");
  if (next.page > 1) params.set("page", String(next.page));
  return `/workspace/projects?${params}`;
}

export function deanProjectHref(projectId: string, returnTo: string) { return `/workspace/projects/${projectId}/execution?${new URLSearchParams({ returnTo })}`; }
export function deanActionHref(projectId: string, action: DeanDashboardActionSummary, returnTo: string) {
  const params = new URLSearchParams({ node: action.target.workflowStageId, tab: "issues", issue: action.target.issueId, returnTo });
  return `/workspace/projects/${projectId}/execution?${params}`;
}
export function deanSortHref(query: DeanDashboardQuery, sort: DeanDashboardQuery["sort"]) { return deanDashboardHref(query, { sort, order: query.sort === sort ? query.order === "asc" ? "desc" : "asc" : sort === "exception" || sort === "action" ? "desc" : "asc", page: 1 }); }
export function formatDeanGeneratedAt(value: string) {
  const date = new Date(value);
  const current = parts(new Date());
  const target = parts(date);
  return current.date === target.date ? `今天 ${target.time}` : `${target.date} ${target.time}`;
}
export function formatDeanActionLabel(action: DeanDashboardActionSummary, generatedAt: string) {
  const prefix = ({ DEAN_DECISION: "待我决策", DEAN_IMPLEMENTATION_CONFIRMATION: "待我确认落实", PMO_IMPLEMENTATION: "PMO 落实中", REPORTER_FEEDBACK: "待负责人反馈" })[action.category];
  return `${prefix} · ${action.taskCount} 项 · ${elapsed(action.oldestStartedAt, generatedAt)}`;
}
export function deanExceptionLabels(item: DeanDashboardProjectItem): Array<{ label: string; tone: "red" | "amber" | "neutral" }> {
  const labels: Array<{ label: string; tone: "red" | "amber" | "neutral" }> = [];
  if (item.exceptionSummary.closureBlocked) labels.push({ label: `结题受阻 · ${item.exceptionSummary.closureGateReasonCount} 项`, tone: "red" });
  if (item.exceptionSummary.highestIssueRisk === "BLOCKED") labels.push({ label: `${item.exceptionSummary.openIssueCount} 项阻塞`, tone: "red" });
  else if (item.exceptionSummary.highestIssueRisk === "RISK") labels.push({ label: `${item.exceptionSummary.openIssueCount} 项风险`, tone: "amber" });
  return labels.length ? labels.slice(0, 2) : [{ label: "无异常", tone: "neutral" }];
}
export function deanProjectStatusLabel(status: DeanDashboardProjectItem["projectStatus"]) { return status === "CLOSING" ? "结题中" : status === "COMPLETED" ? "已完成" : status === "ARCHIVED" ? "已归档 · 只读" : null; }

function elapsed(startedAt: string | null, generatedAt: string) { if (!startedAt) return "时间未记录"; const days = Math.max(0, Math.floor((new Date(generatedAt).getTime() - new Date(startedAt).getTime()) / 86_400_000)); return days === 0 ? "今天" : `${days} 天`; }
function parts(value: Date) { const values = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value); const get = (type: Intl.DateTimeFormatPartTypes) => values.find((part) => part.type === type)?.value ?? ""; return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` }; }
function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
