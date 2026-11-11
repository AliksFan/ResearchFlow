import type { CollaborationActor, ProjectExecutionListItem, ProjectExecutionOverview } from "@researchflow/collaboration";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ExecutionShell } from "@/components/collaboration/execution-shell";
import { DeanDashboard, DeanDashboardError, type DeanDashboardPageModel } from "@/components/workspace/dean-dashboard";
import { DeanDashboardLoading } from "@/components/workspace/dean-dashboard-loading";
import { deanDashboardHref, parseDeanDashboardQuery } from "@/components/workspace/dean-project-summary";
import { KeySubIWorkspace, type HistoryView } from "@/components/workspace/key-sub-i-workspace";
import { KeySubIWorkspaceLoading } from "@/components/workspace/key-sub-i-workspace-loading";
import { PmoDashboard, PmoDashboardError, type PmoDashboardPageModel } from "@/components/workspace/pmo-dashboard";
import { PmoDashboardLoading } from "@/components/workspace/pmo-dashboard-loading";
import { dashboardHref, parsePmoDashboardQuery, type DashboardSearchParams } from "@/components/workspace/pmo-project-summary";
import { filterProjects, filterWorkspaceApplications, filterWorkspaceProjects, projectCounts, projectStatusLabel, type ProjectView } from "@/components/workspace/workspace-list-view";
import { getCollaborationRuntime, getDeanDashboardRuntime, getPmoDashboardRuntime } from "@/server/collaboration-runtime";
import { requireCollaborationActor } from "@/server/collaboration-session";
import { getProjectApplicationRuntime } from "@/server/project-application-runtime";

const PROJECT_VIEWS: Array<{ value: Exclude<ProjectView, "all">; label: string }> = [
  { value: "current", label: "当前项目" },
  { value: "completed", label: "已完成" },
  { value: "archived", label: "已归档" },
];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const [actor, query] = await Promise.all([requireCollaborationActor(), searchParams]);
  if (actor.roleCode === "KEY_SUB_I") return <Suspense fallback={<KeySubIWorkspaceLoading />}><KeySubIWorkspaceData actor={actor} query={query} /></Suspense>;
  if (actor.roleCode === "PMO") return <Suspense fallback={<PmoDashboardLoading />}><PmoDashboardData actor={{ ...actor, roleCode: "PMO" }} params={query} /></Suspense>;
  if (actor.roleCode === "DEAN") return <Suspense fallback={<DeanDashboardLoading />}><DeanDashboardData actor={{ ...actor, roleCode: "DEAN" }} params={query} /></Suspense>;

  const projects = await getCollaborationRuntime().listProjects(actor);
  const requestedView = firstString(query.view);
  const view = isProjectView(requestedView) ? requestedView : "current";
  const search = firstString(query.q)?.trim() ?? "";
  const visible = filterProjects(projects, view, search);
  const counts = projectCounts(projects);

  return <ExecutionShell eyebrow="项目管理" title="项目总览">
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      {PROJECT_VIEWS.map((item) => <Link key={item.value} href={projectViewHref(item.value, search)} aria-current={view === item.value ? "page" : undefined} className={`rounded-xl border p-5 transition ${view === item.value ? "border-teal-500 bg-teal-50 shadow-sm" : "border-slate-200 bg-white hover:border-teal-300"}`}><span className="text-sm text-slate-600">{item.label}</span><strong className="mt-2 block text-3xl text-slate-950">{counts[item.value]}</strong></Link>)}
    </div>

    <form className="mt-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row" action="/workspace/projects">
      <input type="hidden" name="view" value={view} />
      <label className="sr-only" htmlFor="project-search">搜索项目</label>
      <input id="project-search" name="q" defaultValue={search} placeholder="搜索项目名称或编号" className="field-control flex-1" />
      <button className="button-primary">搜索</button>
      {search ? <Link href={projectViewHref(view, "")} className="button-secondary text-center">清除</Link> : null}
    </form>

    <div className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-600"><p>仅显示当前角色仍有权访问的正式项目。</p><span>当前结果 {visible.length} / {counts.total}</span></div>
    <ProjectTable projects={visible} />
  </ExecutionShell>;
}

async function DeanDashboardData({ actor, params }: { actor: CollaborationActor & { roleCode: "DEAN" }; params: DashboardSearchParams }) {
  const query = parseDeanDashboardQuery(params);
  const result = await getDeanDashboardRuntime().getProjectDashboard(actor, query).then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
  if (!result.ok) {
    console.error("DEAN_DASHBOARD_PROJECTS_FAILED", safeErrorSummary(result.error));
    return <DeanDashboardError />;
  }
  if (result.value.page !== query.page) redirect(deanDashboardHref(query, { page: result.value.page }));
  const model: DeanDashboardPageModel = { ...result.value, generatedAt: new Date().toISOString() };
  return <DeanDashboard model={model} query={query} />;
}

async function PmoDashboardData({ actor, params }: { actor: CollaborationActor & { roleCode: "PMO" }; params: DashboardSearchParams }) {
  const query = parsePmoDashboardQuery(params);
  const result = await getPmoDashboardRuntime().getProjectDashboard(actor, query).then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
  if (!result.ok) {
    console.error("PMO_DASHBOARD_PROJECTS_FAILED", safeErrorSummary(result.error));
    return <PmoDashboardError />;
  }
  if (result.value.page !== query.page) redirect(dashboardHref(query, { page: result.value.page }));
  const model: PmoDashboardPageModel = {
    ...result.value,
    generatedAt: new Date().toISOString(),
  };
  return <PmoDashboard model={model} query={query} />;
}

async function KeySubIWorkspaceData({ actor, query }: { actor: CollaborationActor; query: DashboardSearchParams }) {
  const q = Array.isArray(query.q) ? query.q[0] : query.q;
  const history = Array.isArray(query.history) ? query.history[0] : query.history;
  const search = q?.trim() ?? "";
  const requestedHistory = isHistoryView(history) ? history : null;
  const projectsResult = await settle(getCollaborationRuntime().listProjects(actor));
  const applicationsResult = await settle(getProjectApplicationRuntime().queries.listMyProjectWorkspace(actor));
  if (projectsResult.status === "rejected") console.error("KEY_SUB_I_WORKSPACE_PROJECT_LIST_FAILED", safeErrorSummary(projectsResult.reason));
  if (applicationsResult.status === "rejected") console.error("KEY_SUB_I_WORKSPACE_APPLICATION_LIST_FAILED", safeErrorSummary(applicationsResult.reason));
  const projects = projectsResult.status === "fulfilled" ? projectsResult.value : [];
  const applications = applicationsResult.status === "fulfilled" ? filterWorkspaceApplications(applicationsResult.value, search) : [];
  const counts = projectCounts(projects);
  const currentItems = projects.filter(({ projectStatus }) => projectStatus === "ACTIVE" || projectStatus === "CLOSING");
  const completedItems = projects.filter(({ projectStatus }) => projectStatus === "COMPLETED");
  const archivedItems = projects.filter(({ projectStatus }) => projectStatus === "ARCHIVED");

  const historyItemsToLoad = search
    ? [...completedItems, ...archivedItems]
    : requestedHistory === "completed"
      ? completedItems
      : requestedHistory === "archived"
        ? archivedItems
        : [];
  const currentOverviews = await loadOverviews(actor, currentItems);
  const loadedHistoryOverviews = await loadOverviews(actor, historyItemsToLoad);
  const visibleCurrent = filterWorkspaceProjects(currentOverviews, search);
  const filteredHistory = filterWorkspaceProjects(loadedHistoryOverviews, search);
  const completedHistory = filteredHistory.filter(({ projectStatus }) => projectStatus === "COMPLETED");
  const archivedHistory = filteredHistory.filter(({ projectStatus }) => projectStatus === "ARCHIVED");
  const historyView = requestedHistory ?? (search ? completedHistory.length > 0 ? "completed" : "archived" : null);
  const visibleHistory = historyView === "completed" ? completedHistory : historyView === "archived" ? archivedHistory : [];

  return <KeySubIWorkspace
    search={search}
    currentProjects={visibleCurrent}
    applications={applications}
    completedCount={counts.completed}
    archivedCount={counts.archived}
    historyView={historyView}
    historyProjects={visibleHistory}
    projectError={projectsResult.status === "rejected"}
    applicationError={applicationsResult.status === "rejected"}
    historySearchMatchCount={filteredHistory.length}
  />;
}

async function loadOverviews(actor: CollaborationActor, projects: ProjectExecutionListItem[]): Promise<ProjectExecutionOverview[]> {
  const settled: PromiseSettledResult<ProjectExecutionOverview | null>[] = [];
  for (const { projectId } of projects) {
    settled.push(await settle(getCollaborationRuntime().getOverview(actor, projectId)));
  }
  const overviews = settled.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value ? [result.value] : [];
    console.error("KEY_SUB_I_WORKSPACE_OVERVIEW_FAILED", { projectId: projects[index]?.projectId, error: safeErrorSummary(result.reason) });
    return [];
  });
  for (const overview of overviews) {
    const hasApplicableNode = overview.stages.some(({ applicability, workflows }) => applicability !== "NOT_APPLICABLE" && workflows.some((node) => node.applicability !== "NOT_APPLICABLE"));
    if (!hasApplicableNode) console.warn("KEY_SUB_I_WORKSPACE_NO_APPLICABLE_NODE", { projectId: overview.projectId });
  }
  return overviews;
}

async function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  try {
    return { status: "fulfilled", value: await promise };
  } catch (reason) {
    return { status: "rejected", reason };
  }
}

function safeErrorSummary(error: unknown) {
  if (!(error instanceof Error)) return { name: "NonError" };
  const code = "code" in error && typeof error.code === "string" ? error.code : null;
  return { name: error.name, code };
}

function isHistoryView(value: string | undefined): value is HistoryView {
  return value === "completed" || value === "archived";
}

function ProjectTable({ projects }: { projects: ProjectExecutionListItem[] }) {
  if (projects.length === 0) return <EmptyProjects />;
  return <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3 font-semibold">项目</th><th className="px-5 py-3 font-semibold">正式状态</th><th className="px-5 py-3 text-right font-semibold">操作</th></tr></thead><tbody>{projects.map((project) => <tr key={project.projectId} className="border-t border-slate-100 hover:bg-slate-50"><td className="px-5 py-4"><Link href={`/workspace/projects/${project.projectId}/execution`} className="font-semibold text-slate-950 hover:text-teal-800">{project.projectName}</Link><span className="mt-1 block text-xs text-slate-500">{project.projectCode}</span></td><td className="px-5 py-4"><StatusBadge status={project.projectStatus} /></td><td className="px-5 py-4 text-right"><Link href={`/workspace/projects/${project.projectId}/execution`} className="font-semibold text-teal-700">查看详情</Link></td></tr>)}</tbody></table></div>;
}

function EmptyProjects() {
  return <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">当前筛选下没有可访问的正式项目。请调整状态视图或搜索条件。</p>;
}

function StatusBadge({ status }: { status: ProjectExecutionListItem["projectStatus"] }) {
  const styles = { ACTIVE: "bg-emerald-50 text-emerald-800", CLOSING: "bg-amber-50 text-amber-800", COMPLETED: "bg-sky-50 text-sky-800", ARCHIVED: "bg-slate-100 text-slate-700" };
  return <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${styles[status]}`}>{projectStatusLabel(status)}</span>;
}

function isProjectView(value: string | undefined): value is ProjectView {
  return value === "current" || value === "completed" || value === "archived" || value === "all";
}

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function projectViewHref(view: ProjectView, search: string): string {
  const params = new URLSearchParams({ view });
  if (search) params.set("q", search);
  return `/workspace/projects?${params}`;
}
