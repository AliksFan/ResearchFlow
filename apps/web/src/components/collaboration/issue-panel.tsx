import { randomUUID } from "node:crypto";

import type { IssueContact, IssueListItem, IssueTypeOption } from "@researchflow/collaboration";

import {
  acceptIssueDeanReviewTransfer,
  appendIssueCoordination,
  closeIssueInvalid,
  confirmIssueResolution,
  createIssue,
  escalateIssueToDean,
  recordIssueDeanDecision,
  recordIssueManualEmail,
  requestIssueDeanReviewTransfer,
  requestIssueDecisionSupplement,
  resubmitIssueDecisionMaterials,
  returnIssueForSupplement,
  reviewIssueImplementation,
  submitIssueImplementation,
  submitIssueResolution,
  supplementIssue,
} from "@/app/workspace/issue-actions";
import { IssueAttachmentField } from "@/components/collaboration/issue-attachment-field";
import {
  DeanDecisionFields,
  ImplementationReviewFields,
  InvalidCloseFields,
  IssueTypeFields,
  ResolutionConfirmationFields,
} from "@/components/collaboration/issue-conditional-fields";

type CoreRole = "PMO" | "DEAN" | "KEY_SUB_I";
type NodeOption = { id: string; label: string };

export function IssuePanel({
  actor,
  issues,
  contacts,
  writable,
  focusedIssueId,
  embedded = false,
}: {
  actor: { personId: string; roleCode: CoreRole };
  issues: IssueListItem[];
  contacts: IssueContact[];
  writable: boolean;
  focusedIssueId?: string;
  embedded?: boolean;
}) {
  const unresolvedIssues = issues.filter((issue) => issue.currentState !== "RESOLVED" && issue.currentState !== "CLOSED_INVALID");
  const terminalIssues = issues.filter((issue) => issue.currentState === "RESOLVED" || issue.currentState === "CLOSED_INVALID");
  return (
    <section className={embedded ? "" : "mt-8 rounded-xl border border-slate-200 bg-white p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">项目问题与决定落实</h2>
          <p className="mt-2 text-sm text-slate-600">问题按真实状态流转；历史详情由服务端按角色可见范围过滤。</p>
        </div>
        {actor.roleCode === "DEAN" ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">院长不能创建问题</span> : null}
      </div>

      <div className="mt-6 grid gap-4">
        {issues.length === 0 ? <p className="text-sm text-slate-500">当前没有问题记录。</p> : unresolvedIssues.length === 0 ? <p className="text-sm text-slate-500">当前没有未解决问题。</p> : unresolvedIssues.map((issue) => (
          <IssueCard key={issue.id} actor={actor} issue={issue} contacts={contacts} writable={writable} focused={issue.id === focusedIssueId} />
        ))}
      </div>

      {terminalIssues.length > 0 ? (
        <details open={terminalIssues.some((issue) => issue.id === focusedIssueId)} className="group mt-5">
          <summary className="inline-flex cursor-pointer list-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <span className="group-open:hidden">显示已解决/关闭问题（{terminalIssues.length}）</span>
            <span className="hidden group-open:inline">隐藏已解决/关闭问题（{terminalIssues.length}）</span>
          </summary>
          <div className="mt-4 grid gap-4">
            {terminalIssues.map((issue) => (
              <IssueCard key={issue.id} actor={actor} issue={issue} contacts={contacts} writable={writable} focused={issue.id === focusedIssueId} />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

export function CreateIssueForm({ projectId, nodes, issueTypes, returnNodeId }: { projectId: string; nodes: NodeOption[]; issueTypes: IssueTypeOption[]; returnNodeId: string | null }) {
  return (
    <details open className="mt-5 rounded-lg border border-teal-200 bg-teal-50/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-teal-800">创建真实项目问题</summary>
      <form action={createIssue} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="projectId" value={projectId} />
        {returnNodeId ? <input type="hidden" name="returnNode" value={returnNodeId} /> : null}
        <input type="hidden" name="commandId" value={randomUUID()} />
        {returnNodeId ? <input type="hidden" name="projectWorkflowStageId" value={returnNodeId} /> : <label className="grid gap-1 text-sm">关联节点<select name="projectWorkflowStageId" required className={fieldClass}>{nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label>}
        <IssueTypeFields issueTypes={issueTypes} />
        <label className="grid gap-1 text-sm sm:col-span-2">标题<input name="title" required className={fieldClass} /></label>
        <label className="grid gap-1 text-sm sm:col-span-2">问题说明<textarea name="description" required className={fieldClass} rows={3} /></label>
        <label className="grid gap-1 text-sm sm:col-span-2">期望支持（选填）<textarea name="expectedSupport" className={fieldClass} rows={2} /></label>
        <label className="grid gap-1 text-sm">当前灯态<select name="currentRiskLevel" className={fieldClass}><option value="RISK">黄色风险</option><option value="BLOCKED">红色阻塞</option></select></label>
        <div className="sm:col-span-2"><IssueAttachmentField projectId={projectId} projectWorkflowStageId={null} issueId={null} parentType="ISSUE" visibilityScope="ISSUE_PARTICIPANTS" /></div>
        <button className={`${buttonClass} sm:col-span-2`}>提交问题</button>
      </form>
    </details>
  );
}

function IssueCard({ actor, issue, contacts, writable, focused }: { actor: { personId: string; roleCode: CoreRole }; issue: IssueListItem; contacts: IssueContact[]; writable: boolean; focused: boolean }) {
  const isReporter = issue.reportedByPersonId === actor.personId && issue.reportedRoleCode === actor.roleCode;
  return (
    <article id={`issue-${issue.id}`} tabIndex={-1} className={`scroll-mt-6 rounded-xl border p-4 ${focused ? "border-teal-500 bg-teal-50/40 ring-2 ring-teal-200" : "border-slate-200"}`}>
      <header className="flex flex-wrap justify-between gap-3">
        <div><p className="text-xs font-semibold text-teal-700">{issue.issueNo}</p><h3 className="mt-1 font-semibold">{issue.title}</h3></div>
        <div className="text-right text-xs"><p className="font-semibold text-slate-800">{stateLabel(issue.currentState)}</p><p className={issue.currentRiskLevel === "BLOCKED" ? "text-red-700" : "text-amber-700"}>{riskLabel(issue.currentRiskLevel)}</p></div>
      </header>
      <p className="mt-3 text-sm leading-6 text-slate-700">{issue.description}</p>
      {issue.expectedSupport ? <p className="mt-2 text-sm text-slate-600"><span className="font-medium">期望支持：</span>{issue.expectedSupport}</p> : null}
      <IssueAttachmentList attachments={issue.attachments} />

      <details className="mt-4 rounded-lg bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">查看可见处理历史（{issue.activities.length + issue.sharedSummaries.length}）</summary>
        <div className="mt-3 grid gap-2 text-sm">
          {issue.activities.map((activity) => <div key={activity.id} className="rounded border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">#{activity.sequenceNo} · {activity.performedRoleCode} · {visibilityLabel(activity.visibilityScope)} · {formatDate(activity.createdAt)}</p><p className="mt-1 whitespace-pre-wrap text-slate-700">{displayDetail(activity.detail)}</p><IssueAttachmentList attachments={activity.attachments} /></div>)}
          {issue.sharedSummaries.map((summary) => <div key={summary.id} className="rounded border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs text-emerald-700">公开摘要 · {summary.publishedRoleCode} · {formatDate(summary.publishedAt)}</p><p className="mt-1 whitespace-pre-wrap text-slate-700">{summary.content}</p></div>)}
          {issue.activities.length + issue.sharedSummaries.length === 0 ? <p className="text-slate-500">当前角色没有可见的处理详情。</p> : null}
        </div>
      </details>

      <div className="mt-4 grid gap-3">
        {writable && actor.roleCode === "PMO" ? <PmoActions issue={issue} contacts={contacts} /> : null}
        {writable && actor.roleCode === "DEAN" ? <DeanActions issue={issue} /> : null}
        {writable && isReporter ? <ReporterActions issue={issue} /> : null}
      </div>
    </article>
  );
}

function PmoActions({ issue, contacts }: { issue: IssueListItem; contacts: IssueContact[] }) {
  const email = issue.currentState === "RESOLVED" || issue.currentState === "CLOSED_INVALID" ? null : <ManualEmailForm issue={issue} contacts={contacts} />;
  if (issue.currentState === "PMO_INITIAL_REVIEW") return <>
    {email}
    <ActionForm title="退回原提报人补充" action={returnIssueForSupplement} issue={issue}><Textarea name="reason" label="退回原因" /></ActionForm>
    <ActionForm title="记录协调" action={appendIssueCoordination} issue={issue}><Textarea name="detail" label="协调记录" /><VisibilitySelect /><IssueAttachmentField projectId={issue.projectId} projectWorkflowStageId={issue.projectWorkflowStageId} issueId={issue.id} parentType="ISSUE_ACTIVITY" visibilityScope={null} /></ActionForm>
    <EscalateForm issue={issue} />
    <InvalidCloseForm issue={issue} />
  </>;
  if (issue.currentState === "PMO_COORDINATION") return <>
    {email}
    <ActionForm title="记录协调" action={appendIssueCoordination} issue={issue}><Textarea name="detail" label="协调记录" /><VisibilitySelect /><IssueAttachmentField projectId={issue.projectId} projectWorkflowStageId={issue.projectWorkflowStageId} issueId={issue.id} parentType="ISSUE_ACTIVITY" visibilityScope={null} /></ActionForm>
    <ActionForm title="提交处理结果给原提报人" action={submitIssueResolution} issue={issue}><Textarea name="result" label="项目成员可见处理结果" /><IssueAttachmentField projectId={issue.projectId} projectWorkflowStageId={issue.projectWorkflowStageId} issueId={issue.id} parentType="ISSUE_ACTIVITY" visibilityScope="ISSUE_PARTICIPANTS" /></ActionForm>
    <ActionForm title="退回补充" action={returnIssueForSupplement} issue={issue}><Textarea name="reason" label="退回原因" /></ActionForm>
    <EscalateForm issue={issue} />
    <InvalidCloseForm issue={issue} />
  </>;
  if (issue.currentState === "PMO_DECISION_SUPPLEMENT") return <>{email}<ActionForm title="补充并重提决策材料" action={resubmitIssueDecisionMaterials} issue={issue}><Textarea name="content" label="补充材料" /></ActionForm></>;
  if (issue.currentState === "PMO_IMPLEMENTATION" && issue.currentDecisionRoundId) return <>
    {email}
    <ActionForm title="提交本轮落实结果" action={submitIssueImplementation} issue={issue}><input type="hidden" name="decisionRoundId" value={issue.currentDecisionRoundId} /><Textarea name="resultSummary" label="项目成员可见落实结果" /><IssueAttachmentField projectId={issue.projectId} projectWorkflowStageId={issue.projectWorkflowStageId} issueId={issue.id} parentType="ISSUE_IMPLEMENTATION_SUBMISSION" visibilityScope="ISSUE_PARTICIPANTS" /></ActionForm>
  </>;
  if (issue.currentState === "DEAN_IMPLEMENTATION_CONFIRMATION" && issue.currentDecisionRoundId) return <>{email}<ActionForm title="申请院长复核转交" action={requestIssueDeanReviewTransfer} issue={issue}><input type="hidden" name="decisionRoundId" value={issue.currentDecisionRoundId} /><Textarea name="reason" label="原决定院长不可处理或逾期的依据" /></ActionForm></>;
  return email;
}

function ManualEmailForm({ issue, contacts }: { issue: IssueListItem; contacts: IssueContact[] }) {
  return <details className="rounded-lg border border-amber-200 bg-amber-50/40 p-3"><summary className="cursor-pointer text-sm font-semibold text-amber-800">记录人工问题邮件</summary><form action={recordIssueManualEmail} className="mt-3 grid gap-3"><IssueFields issue={issue} /><fieldset className="grid gap-2"><legend className="text-sm">收件人</legend>{contacts.map((contact) => <label key={contact.ref} className="flex items-center gap-2 text-sm"><input type="checkbox" name="recipientRefs" value={contact.ref} />{contact.name} · {contact.email}</label>)}</fieldset><Input name="subject" label="主题" /><Textarea name="body" label="正文" /><p className="text-xs text-amber-800">当前未配置邮件投递器：提交后会保留邮件、收件人与明确失败尝试，不会伪装为已发送。</p><button className={buttonClass}>记录投递尝试</button></form></details>;
}

function DeanActions({ issue }: { issue: IssueListItem }) {
  if (issue.currentState === "DEAN_DECISION") return <>
    <ActionForm title="要求 PMO补充决策材料" action={requestIssueDecisionSupplement} issue={issue}><Textarea name="reason" label="补充要求" /></ActionForm>
    <ActionForm title="记录院长正式决定" action={recordIssueDeanDecision} issue={issue}>
      <DeanDecisionFields />
      <label className="grid gap-1 text-sm">是否需要院长复核<select name="implementationReviewRequired" className={fieldClass}><option value="1">需要</option><option value="0">不需要</option></select></label>
      <IssueAttachmentField projectId={issue.projectId} projectWorkflowStageId={issue.projectWorkflowStageId} issueId={issue.id} parentType="ISSUE_DEAN_DECISION" visibilityScope="PMO_AND_DEAN" />
    </ActionForm>
  </>;
  if (issue.currentState === "DEAN_IMPLEMENTATION_CONFIRMATION") return <>
    {issue.pendingReviewTransferId ? <ActionForm title="接受复核转交" action={acceptIssueDeanReviewTransfer} issue={issue}><input type="hidden" name="transferId" value={issue.pendingReviewTransferId} /><p className="text-sm text-slate-600">接受后由当前院长承担本轮复核。</p></ActionForm> : null}
    <ActionForm title="复核 PMO落实结果" action={reviewIssueImplementation} issue={issue}><ImplementationReviewFields /></ActionForm>
  </>;
  return null;
}

function ReporterActions({ issue }: { issue: IssueListItem }) {
  if (issue.currentState === "REPORTER_SUPPLEMENT") return <ActionForm title="补充问题并重提" action={supplementIssue} issue={issue}><Textarea name="supplementalDetail" label="补充说明" /><Textarea name="latestProgress" label="最新进展（选填）" required={false} /><Textarea name="expectedSupport" label="当前期望支持（选填）" required={false} /><IssueAttachmentField projectId={issue.projectId} projectWorkflowStageId={issue.projectWorkflowStageId} issueId={issue.id} parentType="ISSUE_ACTIVITY" visibilityScope="ISSUE_PARTICIPANTS" /></ActionForm>;
  if (issue.currentState === "REPORTER_RESOLUTION_CONFIRMATION") return <ActionForm title="原提报人确认解决结果" action={confirmIssueResolution} issue={issue}><ResolutionConfirmationFields /></ActionForm>;
  return null;
}

function EscalateForm({ issue }: { issue: IssueListItem }) { return <ActionForm title="升级院长决定" action={escalateIssueToDean} issue={issue}><Textarea name="decisionQuestion" label="请院长决定的问题" /><Textarea name="pmoAssessment" label="PMO判断（选填）" required={false} /><Textarea name="recommendation" label="PMO建议（选填）" required={false} /><Input name="suggestedDeadline" label="建议期限" type="date" required={false} /><IssueAttachmentField projectId={issue.projectId} projectWorkflowStageId={issue.projectWorkflowStageId} issueId={issue.id} parentType="ISSUE_ACTIVITY" visibilityScope="PMO_AND_DEAN" /></ActionForm>; }
function InvalidCloseForm({ issue }: { issue: IssueListItem }) { return <ActionForm title="无效关闭" action={closeIssueInvalid} issue={issue}><InvalidCloseFields /><Textarea name="conclusionSummary" label="项目成员可见结论" /></ActionForm>; }

function ActionForm({ title, action, issue, children }: { title: string; action: (formData: FormData) => Promise<void>; issue: IssueListItem; children: React.ReactNode }) {
  return <details className="rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-700">{title}</summary><form action={action} className="mt-3 grid gap-3"><IssueFields issue={issue} />{children}<button className={buttonClass}>确认提交</button></form></details>;
}
function IssueFields({ issue }: { issue: IssueListItem }) { return <><input type="hidden" name="projectId" value={issue.projectId} /><input type="hidden" name="returnNode" value={issue.projectWorkflowStageId} /><input type="hidden" name="issueId" value={issue.id} /><input type="hidden" name="expectedRowVersion" value={issue.rowVersion} /><input type="hidden" name="commandId" value={randomUUID()} /></>; }
function Input({ name, label, type = "text", required = true }: { name: string; label: string; type?: string; required?: boolean }) { return <label className="grid gap-1 text-sm">{label}<input name={name} type={type} required={required} className={fieldClass} /></label>; }
function Textarea({ name, label, required = true }: { name: string; label: string; required?: boolean }) { return <label className="grid gap-1 text-sm">{label}<textarea name={name} required={required} rows={2} className={fieldClass} /></label>; }
function VisibilitySelect() { return <label className="grid gap-1 text-sm">可见范围<select name="visibilityScope" className={fieldClass}><option value="PMO_ONLY">仅 PMO</option><option value="PMO_AND_DEAN">PMO 与院长</option><option value="ISSUE_PARTICIPANTS">问题参与者</option></select></label>; }

function stateLabel(value: string) { const labels: Record<string, string> = { PMO_INITIAL_REVIEW: "PMO初审", REPORTER_SUPPLEMENT: "原提报人补充", PMO_COORDINATION: "PMO协调", DEAN_DECISION: "院长决定", PMO_DECISION_SUPPLEMENT: "PMO补充决策材料", PMO_IMPLEMENTATION: "PMO落实", DEAN_IMPLEMENTATION_CONFIRMATION: "院长复核落实", REPORTER_RESOLUTION_CONFIRMATION: "原提报人确认", RESOLVED: "已解决", CLOSED_INVALID: "无效关闭" }; return labels[value] ?? value; }
function riskLabel(value: string) { return value === "BLOCKED" ? "红色阻塞" : value === "RISK" ? "黄色风险" : "绿色"; }
function visibilityLabel(value: string) { return value === "PMO_ONLY" ? "仅 PMO" : value === "PMO_AND_DEAN" ? "PMO与院长" : "问题参与者"; }
function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(value)); }
function displayDetail(value: string) { try { const parsed = JSON.parse(value) as Record<string, unknown>; return Object.entries(parsed).map(([key, item]) => `${key}: ${String(item ?? "")}`).join("\n"); } catch { return value; } }
function IssueAttachmentList({ attachments }: { attachments: IssueListItem["attachments"] }) { return attachments.length ? <ul className="mt-3 flex flex-wrap gap-2 text-sm">{attachments.map((attachment) => <li key={attachment.assetId}><a aria-label={`下载附件 ${attachment.fileName}`} className="font-semibold text-teal-700" href={`/workspace/attachments/${attachment.assetId}/download`}>{attachment.fileName}</a> <span className="text-xs text-slate-500">({formatBytes(attachment.sizeBytes)})</span></li>)}</ul> : null; }
function formatBytes(value: number) { return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }

const fieldClass = "rounded-md border border-slate-300 bg-white px-3 py-2";
const buttonClass = "rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800";
