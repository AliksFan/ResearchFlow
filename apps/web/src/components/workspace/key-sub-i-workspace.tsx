import type { ProjectExecutionOverview } from "@researchflow/collaboration";
import type { ProjectApplicationListItem } from "@researchflow/project-application";
import Link from "next/link";

import { ApplicationCard } from "@/components/project-application/application-card";
import { KeySubIProjectCard } from "@/components/workspace/key-sub-i-project-card";

export type HistoryView = "completed" | "archived";

export function KeySubIWorkspace({
  search,
  currentProjects,
  applications,
  completedCount,
  archivedCount,
  historyView,
  historyProjects,
  projectError = false,
  applicationError = false,
  historySearchMatchCount = 0,
}: {
  search: string;
  currentProjects: ProjectExecutionOverview[];
  applications: ProjectApplicationListItem[];
  completedCount: number;
  archivedCount: number;
  historyView: HistoryView | null;
  historyProjects: ProjectExecutionOverview[];
  projectError?: boolean;
  applicationError?: boolean;
  historySearchMatchCount?: number;
}) {
  const returnHref = workspaceHref(search, historyView);
  const noSearchResults = Boolean(search) && !projectError && !applicationError && currentProjects.length === 0 && applications.length === 0 && historySearchMatchCount === 0;
  return (
    <>
      <header className="border-b border-slate-200 pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="shrink-0 text-[26px] font-bold leading-[34px] text-slate-950 sm:text-[32px] sm:leading-10">我的项目</h1>
          <div className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-[760px] lg:justify-end">
            <form action="/workspace/projects" className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row">
              <label htmlFor="workspace-search" className="sr-only">搜索项目和申请</label>
              <input id="workspace-search" name="q" defaultValue={search} placeholder="搜索项目编号、申请编号、项目名称或负责人" className="field-control min-h-11 min-w-0 flex-1" />
              <button className="button-primary min-h-11 shrink-0">搜索</button>
              {search ? <Link href="/workspace/projects" className="button-secondary min-h-11 shrink-0 text-center leading-7">清除</Link> : null}
            </form>
            <Link href="/workspace/applications/new" className="button-primary min-h-11 shrink-0 text-center leading-7 max-[639px]:w-full">＋ 项目申请</Link>
          </div>
        </div>
        {noSearchResults ? <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">没有与“{search}”匹配的项目或申请。 <Link href="/workspace/projects" className="font-semibold text-teal-700">清除搜索</Link></p> : null}
      </header>

      <section aria-labelledby="current-projects-heading" className="mt-8">
        <SectionHeading id="current-projects-heading" title="当前正式项目" />
        {projectError ? <SectionError title="正式项目读取失败" href={returnHref} /> : currentProjects.length > 0 ? <div className="mt-4 grid gap-4 min-[1200px]:grid-cols-2">{currentProjects.map((overview) => <KeySubIProjectCard key={overview.projectId} overview={overview} returnHref={returnHref} />)}</div> : <EmptyState>{applications.length > 0 ? <>暂无可执行的正式项目，可继续处理下方申请。 <a href="#applications" className="font-semibold text-teal-700">前往申请</a></> : <>暂无可访问的当前项目。 <Link href="/workspace/applications/new" className="font-semibold text-teal-700">项目申请</Link></>}</EmptyState>}
      </section>

      <section id="applications" aria-labelledby="applications-heading" className="mt-8 scroll-mt-44">
        <SectionHeading id="applications-heading" title="我的未建档申请" action={<Link href="/workspace/applications?view=finished" className="button-secondary min-h-11 text-center leading-7">查看申请历史</Link>} />
        {applicationError ? <SectionError title="项目申请读取失败" href={returnHref} /> : applications.length > 0 ? <div className="mt-4 grid gap-4 min-[1200px]:grid-cols-2">{applications.map((application) => <ApplicationCard key={application.projectId} application={application} returnHref={`${returnHref}#applications`} />)}</div> : <EmptyState>当前没有待完善或审核中的申请。 <Link href="/workspace/applications/new" className="font-semibold text-teal-700">项目申请</Link></EmptyState>}
      </section>

      <section aria-labelledby="history-heading" className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 id="history-heading" className="text-xl font-bold text-slate-950">已完成并归档</h2><p className="mt-1 text-sm text-slate-600">低频历史项目默认收起，不影响当前工作。</p></div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><span className="text-sm text-slate-600">已完成 {completedCount} · 已归档 {archivedCount}</span><Link href={historyView ? workspaceHref(search, null) : workspaceHref(search, completedCount > 0 ? "completed" : "archived")} aria-expanded={Boolean(historyView)} aria-controls="project-history-region" className="button-secondary min-h-11 text-center leading-7">{historyView ? "收起" : "展开"}</Link></div>
        </div>
        {historyView ? <div id="project-history-region" className="mt-6 border-t border-slate-200 pt-5">
          <nav aria-label="历史项目分类" className="flex flex-wrap gap-2"><HistoryLink view="completed" active={historyView === "completed"} count={completedCount} search={search} /><HistoryLink view="archived" active={historyView === "archived"} count={archivedCount} search={search} /></nav>
          {historyProjects.length > 0 ? <div className="mt-4 grid gap-4 min-[1200px]:grid-cols-2">{historyProjects.map((overview) => <KeySubIProjectCard key={overview.projectId} overview={overview} historyMode={historyView} returnHref={returnHref} />)}</div> : <EmptyState>{search ? historySearchMatchCount > 0 ? `当前${historyView === "completed" ? "已完成" : "已归档"}分类没有匹配结果，可切换分类。` : "已完成和已归档项目中没有匹配结果。" : historyView === "completed" ? "暂无已完成项目。" : "暂无已归档项目。"}</EmptyState>}
        </div> : null}
      </section>
    </>
  );
}

function SectionHeading({ id, title, action }: { id: string; title: string; action?: React.ReactNode }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 id={id} className="text-xl font-bold text-slate-950">{title}</h2>{action}</div>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm leading-6 text-slate-600">{children}</p>;
}

function SectionError({ title, href }: { title: string; href: string }) {
  return <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"><p className="font-semibold">{title}</p><p className="mt-1">没有将读取失败显示为空列表；请稍后重试。</p><Link href={href} className="button-secondary mt-4 inline-block min-h-11 leading-7">重试</Link></div>;
}

function HistoryLink({ view, active, count, search }: { view: HistoryView; active: boolean; count: number; search: string }) {
  return <Link href={workspaceHref(search, view)} aria-current={active ? "page" : undefined} className={`min-h-11 rounded-full px-4 py-2.5 text-sm font-semibold ${active ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{view === "completed" ? "已完成" : "已归档"}（{count}）</Link>;
}

function workspaceHref(search: string, history: HistoryView | null): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (history) params.set("history", history);
  const query = params.toString();
  return `/workspace/projects${query ? `?${query}` : ""}`;
}
