import type { ProjectApplicationListItem } from "@researchflow/project-application";
import Link from "next/link";

import { ApplicationCard } from "@/components/project-application/application-card";
import { applicationViewCounts, filterApplications, type ApplicationView } from "@/components/workspace/workspace-list-view";

const VIEWS: Array<{ value: ApplicationView; label: string }> = [
  { value: "all", label: "全部" },
  { value: "editing", label: "待完善" },
  { value: "in_review", label: "审核中" },
  { value: "finished", label: "已建档 / 已结束" },
];

export function ApplicationList({ applications, view, search }: { applications: ProjectApplicationListItem[]; view: ApplicationView; search: string }) {
  const visible = filterApplications(applications, view, search);
  const counts = applicationViewCounts(applications);
  const baseHref = "/workspace/applications";

  return <>
    <nav aria-label="申请状态视图" className="mt-6 flex gap-2 overflow-x-auto pb-2">{VIEWS.map((item) => <Link key={item.value} href={viewHref(baseHref, item.value, search)} aria-current={view === item.value ? "page" : undefined} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${view === item.value ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{item.label}<span className={`ml-2 ${view === item.value ? "text-teal-100" : "text-slate-400"}`}>{counts[item.value]}</span></Link>)}</nav>

    <form action={baseHref} className="mt-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row">
      <input type="hidden" name="view" value={view} />
      <label htmlFor="application-search" className="sr-only">搜索申请</label>
      <input id="application-search" name="q" defaultValue={search} placeholder="搜索申请编号、项目名称、申请人或负责人" className="field-control flex-1" />
      <button className="button-primary">搜索</button>
      {search ? <Link href={viewHref(baseHref, view, "")} className="button-secondary text-center">清除</Link> : null}
    </form>

    <div className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-600"><p>申请资格不等于正式项目访问权；建档后仍按项目授权访问。</p><span>当前结果 {visible.length}</span></div>

    <section className="mt-4 grid gap-4"><h2 className="sr-only">申请记录</h2>{visible.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">当前筛选下没有申请。请调整状态视图或搜索条件。</p> : visible.map((application) => <ApplicationCard key={application.projectId} application={application} />)}</section>
  </>;
}

function viewHref(baseHref: string, view: ApplicationView, search: string) {
  const params = new URLSearchParams({ view });
  if (search) params.set("q", search);
  return `${baseHref}?${params}`;
}
