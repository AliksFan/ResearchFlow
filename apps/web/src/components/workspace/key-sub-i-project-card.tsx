import type { ProjectExecutionOverview } from "@researchflow/collaboration";
import Link from "next/link";

import {
  deriveProjectWorkspaceSummary,
  formatWorkspaceDate,
  projectStatusLabel,
} from "@/components/workspace/workspace-list-view";

export function KeySubIProjectCard({ overview, historyMode, returnHref }: { overview: ProjectExecutionOverview; historyMode?: "completed" | "archived"; returnHref: string }) {
  const summary = deriveProjectWorkspaceSummary(overview);
  const owners = [overview.basicInformation.primaryKeySubIDisplayName, ...overview.basicInformation.otherKeySubIDisplayNames].filter((value): value is string => Boolean(value));
  const detailHref = `/workspace/projects/${overview.projectId}/execution?returnTo=${encodeURIComponent(returnHref)}`;
  return (
    <article className="flex min-h-[360px] min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm min-[768px]:p-7">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="whitespace-nowrap text-xs font-semibold text-teal-700">申请编号：{overview.basicInformation.applicationCode}</p>
          <p className="mt-1 whitespace-nowrap text-xs font-semibold text-slate-500">正式项目编号：{overview.projectCode}</p>
          <h3 className="mt-3 line-clamp-2 [overflow-wrap:anywhere] text-xl font-bold leading-7 text-slate-950 min-[768px]:text-[22px] min-[768px]:leading-[30px]" title={overview.projectName}>{overview.projectName}</h3>
        </div>
        <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(overview.projectStatus)}`}>{projectStatusLabel(overview.projectStatus)}</span>
      </div>

      <dl className="mt-6 grid min-w-0 gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
        <Definition term="负责人"><OwnerSummary owners={owners} /></Definition>
        {historyMode ? <Definition term={historyMode === "archived" ? "归档时间" : "完成时间"} value={formatWorkspaceDate(historyMode === "archived" ? overview.basicInformation.archivedAt : overview.basicInformation.completedAt) ?? "时间未记录"} /> : <Definition term="当前主阶段" value={summary.currentStageLabel} />}
        <Definition term="问题概况"><IssueSummary count={summary.openIssueCount} risk={summary.issueRiskLevel} /></Definition>
        <Definition term="节点完成概况" value={summary.applicableNodeCount === 0 ? "暂无适用执行节点" : `已完成 ${summary.completedNodeCount} / ${summary.applicableNodeCount} 个适用节点`} />
        <Definition term="项目计划结束日期" value={formatWorkspaceDate(overview.basicInformation.plannedEndDate) ?? "未设置计划结束日期"} />
      </dl>

      <div className="mt-auto flex justify-end pt-6">
        <Link href={detailHref} className="button-primary min-h-11 text-center leading-7 max-[479px]:w-full">{historyMode === "archived" ? "查看归档项目" : historyMode === "completed" ? "查看已完成项目" : "进入项目"}</Link>
      </div>
    </article>
  );
}

function Definition({ term, value, children }: { term: string; value?: string; children?: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-slate-500">{term}</dt><dd className="mt-1 [overflow-wrap:anywhere] font-semibold leading-6 text-slate-800">{children ?? value}</dd></div>;
}

function OwnerSummary({ owners }: { owners: string[] }) {
  if (owners.length === 0) return <>未记录负责人</>;
  if (owners.length <= 2) return <>{owners.join("、")}</>;
  return <details><summary className="min-h-6 cursor-pointer list-none rounded focus-visible:outline-offset-2">{owners.slice(0, 2).join("、")}等 {owners.length} 人</summary><p className="mt-2 font-normal text-slate-600">完整名单：{owners.join("、")}</p></details>;
}

function IssueSummary({ count, risk }: { count: number; risk: "NONE" | "RISK" | "BLOCKED" }) {
  if (count === 0) return <span className="text-slate-600">无未关闭问题</span>;
  const blocked = risk === "BLOCKED";
  return <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs ${blocked ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}`}><span aria-hidden="true" className={`size-2 rounded-full ${blocked ? "bg-rose-600" : "bg-amber-500"}`} />{count} 个未关闭问题 · {blocked ? "存在阻塞" : "存在风险"}</span>;
}

function statusStyle(status: ProjectExecutionOverview["projectStatus"]) {
  return status === "ACTIVE" ? "bg-emerald-50 text-emerald-800" : status === "CLOSING" ? "bg-amber-50 text-amber-800" : status === "COMPLETED" ? "bg-sky-50 text-sky-800" : "bg-slate-100 text-slate-700";
}
