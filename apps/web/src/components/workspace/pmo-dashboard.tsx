import type { PmoDashboardQuery, PmoProjectDashboardResult } from "@researchflow/collaboration";
import Link from "next/link";

import { PmoDashboardStatCards } from "./pmo-dashboard-stat-cards";
import { PmoHideFinishedToggle } from "./pmo-hide-finished-toggle";
import { PmoProjectCards } from "./pmo-project-card";
import { PmoProjectTable } from "./pmo-project-table";
import { dashboardHref, formatGeneratedAt } from "./pmo-project-summary";

export interface PmoDashboardPageModel extends PmoProjectDashboardResult {
  generatedAt: string;
}

export function PmoDashboard({ model, query }: { model: PmoDashboardPageModel; query: PmoDashboardQuery }) {
  const returnTo = dashboardHref(query, { page: model.page });
  return <div className="mx-auto max-w-[1440px]"><header><h1 className="text-[26px] font-bold leading-[34px] text-slate-950 md:text-[32px] md:leading-10">项目总览</h1><p className="mt-2 text-sm leading-[22px] text-slate-600">查看全部项目、申请、异常和当前协作事项。</p></header>
    <div className="mt-5 md:mt-6"><PmoDashboardStatCards counts={model.counts} query={query} /></div>
    <section aria-labelledby="project-list-title" className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white md:mt-6"><h2 id="project-list-title" className="sr-only">项目与申请列表</h2><DashboardToolbar model={model} query={query} />
      {query.focus === "applications" ? <ApplicationViewFilters query={query} /> : null}
      {model.items.length ? <><PmoProjectTable items={model.items} query={query} generatedAt={model.generatedAt} returnTo={returnTo} /><PmoProjectCards items={model.items} generatedAt={model.generatedAt} returnTo={returnTo} /></> : <DashboardEmpty query={query} allItems={model.counts.allItems} />}
      <DashboardPagination model={model} query={query} />
    </section>
  </div>;
}

export function PmoDashboardError() {
  return <div className="mx-auto max-w-[1440px]"><header><h1 className="text-[26px] font-bold leading-[34px] text-slate-950 md:text-[32px] md:leading-10">项目总览</h1><p className="mt-2 text-sm leading-[22px] text-slate-600">查看全部项目、申请、异常和当前协作事项。</p></header><section role="alert" className="mt-6 rounded-2xl border border-red-200 bg-white p-8 text-center"><h2 className="font-semibold text-red-800">项目总览读取失败</h2><p className="mt-2 text-sm text-slate-600">请稍后重试。导航、角色切换和账号操作仍可使用。</p><Link href="/workspace/projects" className="button-secondary mt-4 inline-flex min-h-11 items-center">重试</Link></section></div>;
}

function DashboardToolbar({ model, query }: { model: PmoDashboardPageModel; query: PmoDashboardQuery }) {
  return <div className="border-b border-slate-200 p-4 sm:p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><form action="/workspace/projects" className="flex w-full gap-2 xl:max-w-2xl"><HiddenQuery query={query} omit="q" /><label className="sr-only" htmlFor="pmo-dashboard-search">搜索项目名称、编号或负责人</label><div className="relative flex-1"><input id="pmo-dashboard-search" name="q" defaultValue={query.q} placeholder="搜索项目名称、编号或负责人" className="field-control min-h-11 pr-20" />{query.q ? <Link href={dashboardHref(query, { q: "", page: 1 })} className="absolute right-2 top-1/2 inline-flex min-h-9 -translate-y-1/2 items-center px-2 text-xs font-semibold text-teal-700">清除</Link> : null}</div><button className="button-primary min-h-11">搜索</button></form>
      <div className="flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end"><PmoHideFinishedToggle query={query} /><span>数据更新至 {formatGeneratedAt(model.generatedAt)}</span><span aria-live="polite">显示 {model.items.length} / {model.filteredTotal} 条</span></div></div></div>;
}

function HiddenQuery({ query, omit }: { query: PmoDashboardQuery; omit?: "q" | "hideFinished" }) {
  return <>{<input type="hidden" name="focus" value={query.focus} />}{query.focus === "applications" ? <input type="hidden" name="applicationView" value={query.applicationView} /> : null}<input type="hidden" name="sort" value={query.sort} /><input type="hidden" name="order" value={query.order} />{omit !== "q" && query.q ? <input type="hidden" name="q" value={query.q} /> : null}{omit !== "hideFinished" && query.hideFinished ? <input type="hidden" name="hideFinished" value="1" /> : null}</>;
}

function DashboardEmpty({ query, allItems }: { query: PmoDashboardQuery; allItems: number }) {
  let message = "当前筛选条件下没有记录";
  if (allItems === 0) message = "暂无项目或申请";
  else if (query.q) message = `没有与“${query.q}”匹配的项目或申请`;
  else if (query.hideFinished) message = "当前条件下没有进行中的项目";
  else if (query.focus !== "all") message = "当前分类下没有记录";
  return <div className="p-10 text-center"><p className="text-sm text-slate-600">{message}</p><div className="mt-4 flex flex-wrap justify-center gap-2">{query.q ? <Link href={dashboardHref(query, { q: "", page: 1 })} className="button-secondary min-h-11">清除搜索</Link> : null}{query.hideFinished ? <Link href={dashboardHref(query, { hideFinished: false, page: 1 })} className="button-secondary min-h-11">取消隐藏已完成</Link> : null}{query.focus !== "all" ? <Link href={dashboardHref(query, { focus: "all", page: 1 })} className="button-secondary min-h-11">查看全部</Link> : null}</div></div>;
}

function ApplicationViewFilters({ query }: { query: PmoDashboardQuery }) {
  const views = [{ value: "active", label: "未结束" }, { value: "editing", label: "待完善" }, { value: "in_review", label: "审核中" }, { value: "finished", label: "已结束" }] as const;
  return <nav aria-label="申请状态筛选" className="flex gap-2 overflow-x-auto border-b border-slate-200 px-4 py-3 sm:px-5">{views.map(({ value, label }) => <Link key={value} href={dashboardHref(query, { applicationView: value, page: 1 })} aria-current={query.applicationView === value ? "page" : undefined} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${query.applicationView === value ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"}`}>{label}</Link>)}</nav>;
}

function DashboardPagination({ model, query }: { model: PmoDashboardPageModel; query: PmoDashboardQuery }) {
  const pages = Math.max(1, Math.ceil(model.filteredTotal / model.pageSize));
  if (pages <= 1) return null;
  return <nav aria-label="项目列表分页" className="flex flex-wrap items-center justify-center gap-3 border-t border-slate-200 p-4 text-sm"><Link aria-disabled={model.page <= 1} tabIndex={model.page <= 1 ? -1 : undefined} href={dashboardHref(query, { page: Math.max(1, model.page - 1) })} className={`button-secondary min-h-11 ${model.page <= 1 ? "pointer-events-none opacity-50" : ""}`}>上一页</Link><span>第 {model.page} 页，共 {pages} 页</span><Link aria-disabled={model.page >= pages} tabIndex={model.page >= pages ? -1 : undefined} href={dashboardHref(query, { page: Math.min(pages, model.page + 1) })} className={`button-secondary min-h-11 ${model.page >= pages ? "pointer-events-none opacity-50" : ""}`}>下一页</Link></nav>;
}
