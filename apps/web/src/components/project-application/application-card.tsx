import type { ProjectApplicationListItem } from "@researchflow/project-application";
import Link from "next/link";

import { applicationStatusLabel } from "@/components/workspace/workspace-list-view";

export function ApplicationCard({ application, returnHref }: { application: ProjectApplicationListItem; returnHref?: string }) {
  const baseHref = `/workspace/applications/${application.projectId}`;
  const href = returnHref ? `${baseHref}?returnTo=${encodeURIComponent(returnHref)}` : baseHref;
  const editable = application.status === "DRAFT" || application.status === "RETURNED_FOR_REVISION";
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-[18px] shadow-sm transition hover:border-teal-300 sm:p-5">
      <div className="flex min-w-0 flex-col justify-between gap-3 min-[480px]:flex-row min-[480px]:items-start">
        <div className="min-w-0">
          <h3 className="line-clamp-2 [overflow-wrap:anywhere] text-lg font-semibold text-slate-950" title={application.projectName}>{application.projectName}</h3>
          <p className="mt-2 whitespace-nowrap text-xs font-semibold text-teal-700">{application.applicationCode}</p>
        </div>
        <ApplicationStatus status={application.status} />
      </div>
      <dl className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm md:grid-cols-3">
        <Definition term="拟任主负责人" value={application.primaryOwnerDisplayName ?? "尚未指定"} />
        <Definition term="提交轮次" value={application.reviewSubmissionNo ? `第 ${application.reviewSubmissionNo} 轮` : "尚未提交"} />
        <Definition term="提交时间" value={formatTime(application.submittedAt)} />
        <Definition term="最近更新时间" value={formatTime(application.updatedAt)} />
      </dl>
      <div className="mt-auto flex flex-col gap-4 pt-5 min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between">
        <p className="text-sm text-slate-600">{nextStep(application.status)}</p>
        <Link href={href} className="button-secondary min-h-11 shrink-0 text-center leading-7 max-[479px]:w-full">{editable ? "继续编辑" : "查看申请"}</Link>
      </div>
    </article>
  );
}

function Definition({ term, value }: { term: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-slate-500">{term}</dt><dd className="mt-1 [overflow-wrap:anywhere] font-semibold text-slate-800">{value}</dd></div>;
}

function ApplicationStatus({ status }: { status: ProjectApplicationListItem["status"] }) {
  const styles: Record<ProjectApplicationListItem["status"], string> = { DRAFT: "bg-slate-100 text-slate-700", PENDING_ESTABLISHMENT_REVIEW: "bg-violet-50 text-violet-800", RETURNED_FOR_REVISION: "bg-amber-50 text-amber-800", ON_HOLD: "bg-orange-50 text-orange-800", ACTIVE: "bg-emerald-50 text-emerald-800", REJECTED: "bg-rose-50 text-rose-800", CANCELLED: "bg-slate-200 text-slate-700" };
  return <span className={`inline-flex self-start whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${styles[status]}`}>{applicationStatusLabel(status)}</span>;
}

function nextStep(status: ProjectApplicationListItem["status"]) {
  if (status === "DRAFT") return "完善申请后提交 PMO 审核";
  if (status === "RETURNED_FOR_REVISION") return "根据退回结果补充后重新提交";
  if (status === "PENDING_ESTABLISHMENT_REVIEW") return "等待 PMO 审核处理";
  if (status === "ON_HOLD") return "当前暂缓，等待 PMO 恢复或处理";
  if (status === "ACTIVE") return "已完成建档，可按项目授权进入正式项目";
  return "申请流程已结束，历史继续保留";
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
