import type { PmoDashboardApplicationItem, PmoDashboardItem, PmoDashboardProjectItem, PmoDashboardQuery } from "@researchflow/collaboration";
import Link from "next/link";

import { actionHref, applicationDetailHref, exceptionLabels, formatActionLabel, projectDetailHref, projectStatusLabel, sortHref } from "./pmo-project-summary";

const columns = [
  { key: "project", label: "项目", width: "w-[32%] min-w-[300px]" },
  { key: "owner", label: "负责人", width: "w-[12%] min-w-[150px]" },
  { key: "stage", label: "当前主阶段", width: "w-[16%] min-w-[190px]" },
  { key: "exception", label: "异常", width: "w-[14%] min-w-[170px]" },
  { key: "action", label: "处置", width: "w-[26%] min-w-[260px]" },
] as const;

export function PmoProjectTable({ items, query, generatedAt, returnTo }: { items: PmoDashboardItem[]; query: PmoDashboardQuery; generatedAt: string; returnTo: string }) {
  return <div className="hidden overflow-x-auto lg:block"><table className="min-w-[1070px] table-fixed text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-slate-700"><tr>{columns.map((column) => <th key={column.key} className={`px-5 py-3 font-semibold ${column.width}`} aria-sort={query.sort === column.key ? query.order === "asc" ? "ascending" : "descending" : "none"}><Link href={sortHref(query, column.key)} className="inline-flex min-h-11 items-center gap-1">{column.label}<span aria-hidden="true">{query.sort === column.key ? query.order === "asc" ? "↑" : "↓" : "↕"}</span></Link></th>)}</tr></thead>
    <tbody>{items.map((item) => <tr key={item.projectId} className="border-b border-slate-100 align-top hover:bg-slate-50"><td className="px-5 py-4"><ProjectIdentity item={item} returnTo={returnTo} /></td><td className="px-5 py-4"><OwnerSummary item={item} /></td><td className="px-5 py-4"><StageSummary item={item} /></td><td className="px-5 py-4"><ExceptionSummary item={item} /></td><td className="px-5 py-4"><ActionSummary item={item} generatedAt={generatedAt} returnTo={returnTo} limit={3} /></td></tr>)}</tbody>
  </table></div>;
}

export function ProjectIdentity({ item, returnTo }: { item: PmoDashboardItem; returnTo: string }) {
  if (item.itemType === "PROJECT_APPLICATION") return <div className="min-w-0"><span className="mb-1 inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">项目申请</span><Link href={applicationDetailHref(item.projectId, returnTo)} title={item.projectName} className="block line-clamp-2 font-semibold text-slate-950 [overflow-wrap:anywhere] hover:text-teal-800">{item.projectName}</Link><p className="mt-1 text-xs text-slate-500">{item.applicationCode} · 尚未建档</p></div>;
  const status = projectStatusLabel(item.projectStatus);
  return <div className="min-w-0"><Link href={projectDetailHref(item.projectId, returnTo)} title={item.projectName} className="line-clamp-2 font-semibold text-slate-950 [overflow-wrap:anywhere] hover:text-teal-800">{item.projectName}</Link><p className="mt-1 text-xs text-slate-500">{item.projectCode}{item.leadOrganizationName ? ` · ${item.leadOrganizationName}` : ""}</p>{status ? <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{status}</span> : null}</div>;
}

export function OwnerSummary({ item }: { item: PmoDashboardItem }) {
  if (item.itemType === "PROJECT_APPLICATION") return <div><p className="font-medium text-slate-900">{item.primaryOwnerDisplayName ?? "拟任主负责人未配置"}</p><p className="mt-1 text-xs text-slate-500">申请人：{item.applicantDisplayName}</p></div>;
  const others = item.otherKeySubIDisplayNames;
  return <div>{item.primaryKeySubIDisplayName ? <p className="font-medium text-slate-900">{item.primaryKeySubIDisplayName}</p> : <p className="font-medium text-amber-700">主负责人未配置</p>}{others.length === 1 ? <p className="mt-1 text-xs text-slate-500">{others[0]}</p> : others.length > 1 ? <details className="mt-1 text-xs text-slate-500"><summary className="min-h-11 cursor-pointer py-2">{others[0]} 等 {others.length} 人</summary><p className="rounded-lg bg-slate-50 p-2 leading-5">{others.join("、")}</p></details> : null}</div>;
}

export function StageSummary({ item }: { item: PmoDashboardItem }) {
  if (item.itemType === "PROJECT_APPLICATION") return <div><p className="font-medium text-slate-900">{applicationStatusLabel(item.applicationStatus)}</p><p className="mt-1 text-xs text-slate-500">{item.submittedAt ? `提交于 ${formatDate(item.submittedAt)}` : `更新于 ${formatDate(item.updatedAt)}`}</p></div>;
  return <div><p className="font-medium text-slate-900">{item.stageSummary.currentStageName}</p><p className="mt-1 text-xs text-slate-500">{item.stageSummary.applicableStageCount ? `${item.stageSummary.completedStageCount} / ${item.stageSummary.applicableStageCount} 阶段完成` : "暂无阶段进度"}</p></div>;
}

export function ExceptionSummary({ item }: { item: PmoDashboardItem }) {
  if (item.itemType === "PROJECT_APPLICATION") return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">尚未建档</span>;
  return <div className="flex flex-wrap gap-2">{exceptionLabels(item).map(({ label, tone }) => <span key={label} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone === "red" ? "bg-red-50 text-red-800" : tone === "amber" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{label}</span>)}</div>;
}

export function ActionSummary({ item, generatedAt, returnTo, limit }: { item: PmoDashboardItem; generatedAt: string; returnTo: string; limit: number }) {
  if (item.itemType === "PROJECT_APPLICATION") return <ApplicationActionLink item={item} returnTo={returnTo} />;
  if (!item.actionSummaries.length) return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">无需处置</span>;
  const visible = item.actionSummaries.slice(0, limit);
  const remaining = item.actionSummaries.slice(limit);
  return <div className="flex flex-wrap gap-2">{visible.map((action) => <ActionLink key={action.category} item={item} action={action} generatedAt={generatedAt} returnTo={returnTo} />)}{remaining.length ? <details className="basis-full"><summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-semibold text-teal-700">另 {remaining.length} 类</summary><div className="flex flex-wrap gap-2">{remaining.map((action) => <ActionLink key={action.category} item={item} action={action} generatedAt={generatedAt} returnTo={returnTo} />)}</div></details> : null}</div>;
}

function ApplicationActionLink({ item, returnTo }: { item: PmoDashboardApplicationItem; returnTo: string }) {
  const actionable = item.applicationStatus === "PENDING_ESTABLISHMENT_REVIEW" || item.applicationStatus === "ON_HOLD";
  return <Link href={applicationDetailHref(item.projectId, returnTo)} className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${actionable ? "bg-violet-50 text-violet-800" : "bg-slate-100 text-slate-700"}`}>{actionable ? "审核申请" : item.applicationStatus === "RETURNED_FOR_REVISION" ? "等待申请人补充" : "查看申请"}</Link>;
}

function applicationStatusLabel(status: PmoDashboardApplicationItem["applicationStatus"]): string {
  return ({ DRAFT: "草稿", PENDING_ESTABLISHMENT_REVIEW: "待 PMO 审核", RETURNED_FOR_REVISION: "已退回修改", ON_HOLD: "暂缓审核", REJECTED: "已拒绝", CANCELLED: "已撤回" })[status];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function ActionLink({ item, action, generatedAt, returnTo }: { item: PmoDashboardProjectItem; action: PmoDashboardProjectItem["actionSummaries"][number]; generatedAt: string; returnTo: string }) {
  const tone = action.category === "PMO" ? "bg-sky-50 text-sky-800" : action.category === "DEAN_DECISION" ? "bg-violet-50 text-violet-800" : action.category === "PMO_IMPLEMENTATION" ? "bg-amber-50 text-amber-800" : action.category === "CONFIRMATION" ? "bg-violet-50 text-violet-800" : "bg-emerald-50 text-emerald-800";
  return <Link href={actionHref(item.projectId, action, returnTo)} className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{formatActionLabel(action, generatedAt)}</Link>;
}
