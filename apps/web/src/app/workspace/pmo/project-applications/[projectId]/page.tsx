import { randomUUID } from "node:crypto";

import { notFound } from "next/navigation";
import type { ProjectApplicationDetail } from "@researchflow/project-application";

import {
  approveApplication,
  holdApplication,
  rejectApplication,
  resumeApplication,
  returnApplication,
} from "@/app/workspace/project-application-actions";
import {
  ApplicationShell,
  Feedback,
} from "@/components/project-application/application-shell";
import { getProjectApplicationRuntime } from "@/server/project-application-runtime";
import { requireProjectApplicationActor } from "@/server/project-application-session";

export default async function PmoApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; completed?: string; returnTo?: string }>;
}) {
  const actor = await requireProjectApplicationActor("PMO");
  const { projectId } = await params;
  const [detail, query] = await Promise.all([
    getProjectApplicationRuntime().queries.getPmoApplicationDetail(
      actor,
      projectId,
    ),
    searchParams,
  ]);
  if (!detail) notFound();
  const primary = detail.form.owners.find(({ isPrimary }) => isPrimary);
  const returnTo = projectReturnHref(query.returnTo);
  return (
    <ApplicationShell
      eyebrow="PMO 项目申请审核"
      title={detail.projectCode ? `${detail.projectCode} · ${detail.projectName}` : detail.projectName}
      actions={<a href={returnTo}>返回项目总览</a>}
    >
      <Feedback
        error={query.error}
        success={
          query.completed ? "操作已提交并重新读取服务端状态。" : undefined
        }
      />
      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <article className="min-w-0 space-y-6 rounded-xl border border-slate-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Read label="申请编号" value={detail.applicationCode} />
            {detail.projectCode ? <Read label="正式项目编号" value={detail.projectCode} /> : null}
            <Read label="状态" value={detail.status} />
            <Read
              label="审核轮次"
              value={String(detail.reviewSubmissionNo ?? 0)}
            />
          </div>
          <div>
            <h2 className="font-semibold">
              冻结申请版本 v{detail.applicationVersionNo}
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Read label="申请人" value={detail.applicantDisplayName} />
              <Read
                label="拟任主 Key Sub-I"
                value={
                  primary
                    ? (detail.primaryOwnerDisplayName ?? primary.personId)
                    : "未指定"
                }
              />
              <Read
                label="项目简介"
                value={detail.form.projectSummary ?? "未填写"}
              />
              <Read
                label="项目经费金额（仅作记录）"
                value={detail.form.fundingRecordAmountCny ? `¥${detail.form.fundingRecordAmountCny}` : "未填写"}
              />
              {detail.form.directionOtherText ? <Read label="疾病方向（其它）" value={detail.form.directionOtherText} /> : null}
              {detail.form.researchTypeOtherText ? <Read label="研究类型（其它）" value={detail.form.researchTypeOtherText} /> : null}
            </dl>
          </div>
          <ApplicationWorkflowMatrix detail={detail} />
        </article>
        <aside className="min-w-0 space-y-5">
          <section className="rounded-xl border border-teal-200 bg-teal-50 p-5">
            <h2 className="font-semibold text-teal-950">建档影响预览</h2>
            <ul className="mt-3 space-y-2 text-sm text-teal-900">
              <li>生成正式编号 DEMO-…</li>
              <li>创建首个活动计划版本</li>
              <li>仅激活唯一主 Key Sub-I 授权</li>
              <li>申请、审核、通知与审计同事务提交</li>
            </ul>
          </section>
          <ReviewActions detail={detail} returnTo={returnTo} />
        </aside>
      </section>
    </ApplicationShell>
  );
}

function projectReturnHref(value?: string) {
  return value === "/workspace/projects" || value?.startsWith("/workspace/projects?") ? value : "/workspace/projects?focus=applications&applicationView=in_review&sort=action&order=desc";
}

function ApplicationWorkflowMatrix({ detail }: { detail: ProjectApplicationDetail }) {
  const solution = detail.swimlane;
  if (!solution.stages.length) return <div><h2 className="font-semibold">申请泳道</h2><p className="mt-2 text-sm text-slate-500">未选择工作流方案。</p></div>;
  const stages = [...solution.stages].sort((left, right) => left.sortOrder - right.sortOrder);
  const workflows = [...solution.workflows].sort((left, right) => left.sortOrder - right.sortOrder);
  return <div><h2 className="font-semibold">冻结申请泳道</h2><p className="mt-2 text-sm text-slate-600">{solution.name}{solution.sourceTemplateName ? ` · 基于：${solution.sourceTemplateName}` : ""} · 审核页只读</p><div className="mt-4 overflow-x-auto"><table className="min-w-full border-collapse text-sm"><thead><tr><th className="min-w-40 border border-slate-200 bg-slate-50 p-3 text-left">工作流 / 阶段</th>{stages.map((stage) => <th key={stage.id} className="min-w-52 border border-slate-200 bg-slate-50 p-3 text-left"><p>{stage.name}</p><p className="mt-1 text-xs font-normal text-slate-600">{stage.plannedStartDate ?? "未设开始"} 至 {stage.plannedEndDate ?? "未设结束"}</p></th>)}</tr></thead><tbody>{workflows.map((workflow) => <tr key={workflow.id}><th className="border border-slate-200 p-3 align-top text-left"><p>{workflow.name}</p><p className="mt-1 text-xs font-normal text-slate-500">{workflow.description}</p></th>{stages.map((stage) => { const nodes = solution.nodes.filter((candidate) => candidate.workflowId === workflow.id && candidate.stageId === stage.id); return <td key={stage.id} className="border border-slate-200 p-3 align-top">{nodes.length ? <div className="grid gap-2">{nodes.map((node) => <div key={node.id} className="rounded-lg bg-slate-50 p-3"><p className="font-medium">{node.taskName}</p><p className="mt-1 text-xs text-slate-500">{node.plannedStartDate ?? "未设开始"} 至 {node.plannedEndDate ?? "未设结束"}</p></div>)}</div> : <span className="text-slate-400">—</span>}</td>; })}</tr>)}</tbody></table></div></div>;
}

function ReviewActions({ detail, returnTo }: { detail: ProjectApplicationDetail; returnTo: string }) {
  const pending = detail.status === "PENDING_ESTABLISHMENT_REVIEW";
  const onHold = detail.status === "ON_HOLD";
  if (!pending && !onHold)
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        当前状态没有可执行的审核动作。
      </p>
    );
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">审核动作</h2>
      {pending ? (
        <>
          <ActionForm
            detail={detail}
            action={returnApplication}
            label="退回修改"
            commentRequired
            returnTo={returnTo}
          />
          <ActionForm
            detail={detail}
            action={holdApplication}
            label="暂缓审核"
            commentRequired
            returnTo={returnTo}
          />
          <ActionForm
            detail={detail}
            action={approveApplication}
            label="批准并建档"
            returnTo={returnTo}
          />
        </>
      ) : (
        <ActionForm
          detail={detail}
          action={resumeApplication}
          label="恢复审核"
          returnTo={returnTo}
        />
      )}
      <form
        action={rejectApplication}
        className="space-y-2 border-t border-slate-200 pt-4"
      >
        <Identity detail={detail} commandId={randomUUID()} returnTo={returnTo} />
        <label>
          <span className="field-label">拒绝原因</span>
          <textarea
            name="comment"
            required
            className="field-control"
            rows={3}
          />
        </label>
        <label className="flex items-start gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            name="confirmIrreversible"
            value="yes"
            required
            className="mt-0.5"
          />
          我确认拒绝后申请不可恢复
        </label>
        <button className="text-sm font-semibold text-red-700" type="submit">
          最终拒绝
        </button>
      </form>
    </section>
  );
}

function ActionForm({
  detail,
  action,
  label,
  commentRequired = false,
  returnTo,
}: {
  detail: ProjectApplicationDetail;
  action: (formData: FormData) => Promise<void>;
  label: string;
  commentRequired?: boolean;
  returnTo: string;
}) {
  return (
    <form action={action} className="space-y-2">
      <Identity detail={detail} commandId={randomUUID()} returnTo={returnTo} />
      <label>
        <span className="field-label">
          {label}说明{commentRequired ? "（必填）" : "（选填）"}
        </span>
        <textarea
          name="comment"
          required={commentRequired}
          className="field-control"
          rows={2}
        />
      </label>
      <button type="submit" className="button-secondary w-full">
        {label}
      </button>
    </form>
  );
}
function Identity({ detail, commandId, returnTo }: { detail: ProjectApplicationDetail; commandId: string; returnTo: string }) {
  return (
    <>
      <input type="hidden" name="projectId" value={detail.projectId} />
      <input
        type="hidden"
        name="applicationVersionId"
        value={detail.applicationVersionId}
      />
      <input
        type="hidden"
        name="expectedRowVersion"
        value={detail.rowVersion}
      />
      <input type="hidden" name="reviewId" value={detail.reviewId ?? ""} />
      <input type="hidden" name="commandId" value={commandId} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );
}
function Read({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{value}</dd>
    </div>
  );
}
