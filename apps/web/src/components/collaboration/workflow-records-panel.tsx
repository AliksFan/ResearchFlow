import type { CollaborationRoleCode, WorkflowCompletionRecord, WorkflowProgressRecord } from "@researchflow/collaboration";

import { WorkflowCompletionRecordCard } from "@/components/collaboration/workflow-completion-panel";
import { WorkflowProgressRecordCard } from "@/components/collaboration/workflow-progress-panel";

const COMPLETION_TERMINAL_STATUSES = new Set<WorkflowCompletionRecord["status"]>([
  "APPROVED",
  "WITHDRAWN",
  "TERMINATED_BY_PLAN_CHANGE",
]);

export function WorkflowRecordsPanel({ actor, projectId, nodeLabel, progress, completionRequests, writable, returnTo }: {
  actor: { personId: string; roleCode: CollaborationRoleCode };
  projectId: string;
  nodeLabel: string;
  progress: WorkflowProgressRecord[];
  completionRequests: WorkflowCompletionRecord[];
  writable: boolean;
  returnTo?: string;
}) {
  const pending = completionRequests.filter((request) => !COMPLETION_TERMINAL_STATUSES.has(request.status));
  const history = [
    ...progress.map((record) => ({ kind: "progress" as const, at: record.submittedAt, id: record.id, record })),
    ...completionRequests.filter((request) => COMPLETION_TERMINAL_STATUSES.has(request.status)).map((record) => ({ kind: "completion" as const, at: record.lastActivityAt, id: record.id, record })),
  ].sort((left, right) => right.at.localeCompare(left.at) || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
  const reportParams = new URLSearchParams({ node: completionRequests[0]?.projectWorkflowStageId ?? "", tab: "report", reportType: "completion" });
  if (returnTo) reportParams.set("returnTo", returnTo);
  const completionReportHref = `?${reportParams}`;

  return <section>
    {pending.length > 0 ? <section><h2 className="font-semibold">待处理完成申请</h2><div className="mt-4 grid gap-4">{pending.map((request) => <WorkflowCompletionRecordCard key={request.id} actorRole={actor.roleCode} projectId={projectId} request={request} label={nodeLabel} writable={writable} keySubIActionHref={actor.roleCode === "KEY_SUB_I" ? completionReportHref : undefined} />)}</div></section> : null}
    <section className={pending.length > 0 ? "mt-7 border-t border-slate-200 pt-6" : ""}><h2 className="font-semibold">历史记录</h2><div className="mt-4 grid gap-4">{history.length === 0 ? <p className="text-sm text-slate-500">暂无进展或完成申请记录。</p> : history.map((item) => item.kind === "progress"
      ? <WorkflowProgressRecordCard key={`progress:${item.id}`} actor={actor} projectId={projectId} item={item.record} label={nodeLabel} writable={writable} />
      : <WorkflowCompletionRecordCard key={`completion:${item.id}`} actorRole={actor.roleCode} projectId={projectId} request={item.record} label={nodeLabel} writable={writable} />)}</div></section>
  </section>;
}
