"use client";

import type { CollaborationRoleCode, WorkflowCompletionRecord } from "@researchflow/collaboration";
import { useState, type FormEvent } from "react";

import {
  completeWorkflowCompletionAttachmentUpload,
  createWorkflowCompletionAttachmentDraft,
  prepareWorkflowCompletionAttachmentUpload,
  reconfirmWorkflowCompletion,
  resubmitWorkflowCompletionCommand,
  reviewWorkflowCompletion,
  revokeFormalWorkflowCompletion,
  submitWorkflowCompletionCommand,
  supplementWorkflowCompletionCommand,
  withdrawWorkflowCompletion,
} from "@/app/workspace/workflow-completion-actions";

const ATTACHMENT_DECLARATION_VERSION = "WORKFLOW_COMPLETION_ATTACHMENT_DECLARATION_V1";
const ACCEPTED_FILE_TYPES = ".pdf,.docx,.xlsx,.jpg,.jpeg,.png";

export interface CompletionNode {
  workflowStageId: string;
  rowVersion: number;
  label: string;
  executionStatus: "NOT_STARTED" | "ACTIVE" | "PENDING_COMPLETION_CONFIRMATION" | "COMPLETED";
  attachmentRequirement: "NONE" | "OPTIONAL" | "REQUIRED";
}

export function WorkflowCompletionPanel({ actorRole, projectId, nodes, requests, writable = true, embedded = false, showSubmission = true, showRequests = true }: {
  actorRole: CollaborationRoleCode;
  projectId: string;
  nodes: CompletionNode[];
  requests: WorkflowCompletionRecord[];
  writable?: boolean;
  embedded?: boolean;
  showSubmission?: boolean;
  showRequests?: boolean;
}) {
  const labels = new Map(nodes.map((node) => [node.workflowStageId, node.label]));
  return <section className={embedded ? "" : "mt-8 rounded-xl border border-slate-200 bg-white p-5"}>
    <h2 className="font-semibold">节点完成申请</h2>
    <p className="mt-1 text-sm text-slate-600">暂定绿色可乐观开放下游；只有 PMO正式批准后才成为正式绿色。</p>
    {showSubmission && writable && actorRole === "KEY_SUB_I" ? <div className="mt-5 grid gap-3">
      {nodes.filter((node) => node.executionStatus === "NOT_STARTED" || node.executionStatus === "ACTIVE").map((node) =>
        <details open key={node.workflowStageId} className="rounded-lg border border-teal-100 bg-teal-50/40 p-3">
          <summary className="cursor-pointer font-semibold text-teal-900">申请完成：{node.label}</summary>
          <CompletionSubmissionForm projectId={projectId} node={node} />
        </details>)}
    </div> : null}
    {showRequests ? <div className="mt-5 grid gap-4">
      {requests.length === 0 ? <p className="text-sm text-slate-500">暂无完成申请。</p> : requests.map((request) => <WorkflowCompletionRecordCard key={request.id} actorRole={actorRole} projectId={projectId} request={request} label={labels.get(request.projectWorkflowStageId) ?? "执行节点"} writable={writable} />)}
    </div> : null}
  </section>;
}

export function WorkflowCompletionRecordCard({ actorRole, projectId, request, label, writable = true, keySubIActionHref }: { actorRole: CollaborationRoleCode; projectId: string; request: WorkflowCompletionRecord; label: string; writable?: boolean; keySubIActionHref?: string }) {
  return <article id={`completion-${request.id}`} tabIndex={-1} className="scroll-mt-4 rounded-lg border border-slate-200 p-4">
    <header className="flex flex-wrap justify-between gap-2"><div><span className="text-xs font-semibold text-violet-700">完成申请</span><h3 className="font-semibold">{label}</h3></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{statusLabel(request.status)}</span></header>
    <p className="mt-3 whitespace-pre-wrap text-sm">{request.progressSummary}</p><p className="mt-2 text-sm text-slate-600">依据：{request.basis}</p>
    {request.reviewRound ? <p className="mt-2 text-xs text-slate-500">审核轮次 {request.reviewRound.roundNo} · 截止 {formatDate(request.reviewRound.dueAt)}</p> : null}
    {request.supplements.map((item) => <p key={item.id} className="mt-2 rounded bg-slate-50 p-2 text-sm">补充：{item.content}</p>)}
    {request.attachments.length > 0 ? <ul className="mt-3 flex flex-wrap gap-2 text-sm">{request.attachments.map((attachment) => <li key={attachment.assetId}><a aria-label={`下载附件 ${attachment.fileName}`} className="font-semibold text-teal-700" href={`/workspace/attachments/${attachment.assetId}/download`}>{attachment.fileName}</a> <span className="text-xs text-slate-500">({attachment.source === "SUBMISSION" ? "申请材料" : "补充材料"} · {formatBytes(attachment.sizeBytes)})</span></li>)}</ul> : null}
    {writable && actorRole === "KEY_SUB_I" && keySubIActionHref ? <a href={keySubIActionHref} className="button-primary mt-4 inline-flex">去填报</a> : null}
    {writable && actorRole === "KEY_SUB_I" && !keySubIActionHref ? <KeySubIActions projectId={projectId} request={request} /> : null}
    {writable && actorRole === "PMO" && ["WAITING_FOR_PREDECESSOR", "PENDING_PMO_REVIEW", "ISSUE_RESOLUTION_REQUIRED"].includes(request.status) ? <PmoActions projectId={projectId} request={request} /> : null}
    {writable && actorRole === "PMO" && request.status === "APPROVED" ? <form action={revokeFormalWorkflowCompletion} className="mt-4 grid gap-2 rounded border border-red-100 bg-red-50 p-3"><MutationIdentity projectId={projectId} request={request} /><label className="grid gap-1 text-sm font-semibold text-red-900">项目成员可见的撤销原因<textarea required name="reason" className="field-control" /></label><button className="button-secondary w-fit">撤销正式绿色</button></form> : null}
  </article>;
}

function MutationIdentity({ projectId, request }: { projectId: string; request: WorkflowCompletionRecord }) {
  return <><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="returnNode" value={request.projectWorkflowStageId} /><input type="hidden" name="completionRequestId" value={request.id} /><input type="hidden" name="expectedRowVersion" value={request.rowVersion} /></>;
}

function KeySubIActions({ projectId, request }: { projectId: string; request: WorkflowCompletionRecord }) {
  if (request.status === "RETURNED_FOR_RESUBMISSION") return <CompletionResubmissionForm projectId={projectId} request={request} />;
  if (request.status === "PREDECESSOR_RETURNED_CONFIRMATION") return <form action={reconfirmWorkflowCompletion} className="mt-4 flex flex-wrap gap-2"><MutationIdentity projectId={projectId} request={request} /><input required name="confirmation" placeholder="确认材料仍然有效" className="field-control flex-1" /><button className="button-primary">重新确认</button></form>;
  if (!["WAITING_FOR_PREDECESSOR", "PENDING_PMO_REVIEW", "ISSUE_RESOLUTION_REQUIRED"].includes(request.status)) return null;
  return <div className="mt-4 grid gap-2 sm:grid-cols-2"><CompletionSupplementForm projectId={projectId} request={request} /><form action={withdrawWorkflowCompletion} className="flex gap-2"><MutationIdentity projectId={projectId} request={request} /><input required name="reason" placeholder="撤回原因" className="field-control flex-1" /><button className="button-secondary">撤回</button></form></div>;
}

function PmoActions({ projectId, request }: { projectId: string; request: WorkflowCompletionRecord }) {
  return <form action={reviewWorkflowCompletion} className="mt-4 grid gap-2 rounded bg-slate-50 p-3"><MutationIdentity projectId={projectId} request={request} /><textarea required name="comment" placeholder="审核意见" className="field-control" /><div className="flex gap-2"><button name="decision" value="RETURN" className="button-secondary">退回</button><button disabled={request.status !== "PENDING_PMO_REVIEW"} name="decision" value="APPROVE" className="button-primary">正式批准</button></div></form>;
}

function CompletionSubmissionForm({ projectId, node }: { projectId: string; node: CompletionNode }) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const attachmentDraftIds = await uploadAttachments(form, projectId, node.workflowStageId, "WORKFLOW_COMPLETION_SUBMISSION");
      if (node.attachmentRequirement === "REQUIRED" && attachmentDraftIds.length === 0) throw new Error("WORKFLOW_COMPLETION_ATTACHMENT_REQUIRED");
      const result = await submitWorkflowCompletionCommand({
        projectId,
        projectWorkflowStageId: node.workflowStageId,
        expectedNodeRowVersion: node.rowVersion,
        progressSummary: String(data.get("progressSummary") ?? ""),
        basis: String(data.get("basis") ?? ""),
        expectedCompletionDate: nullableFormText(data, "expectedCompletionDate"),
        attachmentDraftIds,
      });
      if (!result.ok) throw new Error(result.error);
      window.location.assign(`/workspace/projects/${projectId}/execution?node=${encodeURIComponent(node.workflowStageId)}&tab=progress&completion=${encodeURIComponent(result.value.requestId)}&completionSaved=submitted#completion-${encodeURIComponent(result.value.requestId)}`);
    } catch (error) {
      setMessage(completionErrorLabel(error instanceof Error ? error.message : "WORKFLOW_COMPLETION_FAILED"));
      setSubmitting(false);
    }
  }
  return <form onSubmit={handleSubmit} className="mt-3 grid gap-3">
    <label className="grid gap-1 text-sm">完成摘要<textarea required name="progressSummary" className="field-control" /></label>
    <label className="grid gap-1 text-sm">完成依据<textarea required name="basis" className="field-control" /></label>
    <label className="grid gap-1 text-sm">预计完成日期（选填）<input name="expectedCompletionDate" type="date" className="field-control" /></label>
    <CompletionAttachmentFields requirement={node.attachmentRequirement} />
    {message ? <p role="alert" className="text-sm text-red-700">{message}</p> : null}
    <button disabled={submitting} className="button-primary w-fit">{submitting ? "正在提交…" : "提交完成申请"}</button>
  </form>;
}

function CompletionSupplementForm({ projectId, request }: { projectId: string; request: WorkflowCompletionRecord }) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const attachmentDraftIds = await uploadAttachments(form, projectId, request.projectWorkflowStageId, "WORKFLOW_COMPLETION_SUPPLEMENT");
      const result = await supplementWorkflowCompletionCommand({
        projectId,
        projectWorkflowStageId: request.projectWorkflowStageId,
        completionRequestId: request.id,
        expectedRowVersion: request.rowVersion,
        content: String(data.get("content") ?? ""),
        attachmentDraftIds,
      });
      if (!result.ok) throw new Error(result.error);
      window.location.assign(`/workspace/projects/${projectId}/execution?node=${encodeURIComponent(request.projectWorkflowStageId)}&tab=progress&completion=${encodeURIComponent(request.id)}&completionSaved=supplemented#completion-${encodeURIComponent(request.id)}`);
    } catch (error) {
      setMessage(completionErrorLabel(error instanceof Error ? error.message : "WORKFLOW_COMPLETION_FAILED"));
      setSubmitting(false);
    }
  }
  return <form onSubmit={handleSubmit} className="grid gap-2 rounded bg-slate-50 p-3"><input required name="content" placeholder="追加审核材料说明" className="field-control" /><CompletionAttachmentFields requirement="OPTIONAL" compact />{message ? <p role="alert" className="text-xs text-red-700">{message}</p> : null}<button disabled={submitting} className="button-primary w-fit">{submitting ? "正在补充…" : "补充"}</button></form>;
}

function CompletionResubmissionForm({ projectId, request }: { projectId: string; request: WorkflowCompletionRecord }) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const attachmentDraftIds = await uploadAttachments(form, projectId, request.projectWorkflowStageId, "WORKFLOW_COMPLETION_SUBMISSION");
      const result = await resubmitWorkflowCompletionCommand({
        projectId,
        projectWorkflowStageId: request.projectWorkflowStageId,
        completionRequestId: request.id,
        expectedRowVersion: request.rowVersion,
        progressSummary: String(data.get("progressSummary") ?? ""),
        basis: String(data.get("basis") ?? ""),
        expectedCompletionDate: nullableFormText(data, "expectedCompletionDate"),
        attachmentDraftIds,
      });
      if (!result.ok) throw new Error(result.error);
      window.location.assign(`/workspace/projects/${projectId}/execution?node=${encodeURIComponent(request.projectWorkflowStageId)}&tab=progress&completion=${encodeURIComponent(request.id)}&completionSaved=resubmitted#completion-${encodeURIComponent(request.id)}`);
    } catch (error) {
      setMessage(completionErrorLabel(error instanceof Error ? error.message : "WORKFLOW_COMPLETION_FAILED"));
      setSubmitting(false);
    }
  }
  return <form onSubmit={handleSubmit} className="mt-4 grid gap-2 rounded bg-amber-50 p-3"><textarea required name="progressSummary" placeholder="修订完成摘要" className="field-control" /><textarea required name="basis" placeholder="修订完成依据" className="field-control" /><input name="expectedCompletionDate" type="date" className="field-control" /><CompletionAttachmentFields requirement={request.attachmentRequirement} />{message ? <p role="alert" className="text-sm text-red-700">{message}</p> : null}<button disabled={submitting} className="button-primary w-fit">{submitting ? "正在重新提交…" : "重新提交"}</button></form>;
}

function CompletionAttachmentFields({ requirement, compact = false }: { requirement: "NONE" | "OPTIONAL" | "REQUIRED"; compact?: boolean }) {
  if (requirement === "NONE") return <p className="text-xs text-slate-500">该节点不接收完成附件。</p>;
  return <fieldset className={`grid gap-2 rounded-lg border border-slate-200 bg-white ${compact ? "p-2" : "p-3"}`}>
    <legend className="px-1 text-sm font-semibold">完成附件{requirement === "REQUIRED" ? "（必需）" : "（选填）"}</legend>
    <input name="attachments" type="file" multiple required={requirement === "REQUIRED"} accept={ACCEPTED_FILE_TYPES} className="text-sm" />
    <p className="text-xs text-slate-600">支持 PDF、DOCX、XLSX、JPG、JPEG、PNG；单个 20 MB，最多 10 个，合计 100 MB。</p>
    <label className="flex items-start gap-2 text-xs text-slate-700"><input name="attachmentDeclaration" type="checkbox" value="accepted" className="mt-0.5" /><span>我确认附件只包含虚拟或正式项目级资料，不包含患者/受试者数据、发票、支付流水或个人账户资料。</span></label>
  </fieldset>;
}

async function uploadAttachments(form: HTMLFormElement, projectId: string, projectWorkflowStageId: string, parentType: "WORKFLOW_COMPLETION_SUBMISSION" | "WORKFLOW_COMPLETION_SUPPLEMENT"): Promise<string[]> {
  const fileInput = form.elements.namedItem("attachments") as HTMLInputElement | null;
  const files = [...(fileInput?.files ?? [])];
  if (files.length === 0) return [];
  const data = new FormData(form);
  if (data.get("attachmentDeclaration") !== "accepted") throw new Error("DECLARATION_REQUIRED");
  const draft = await createWorkflowCompletionAttachmentDraft({ projectId, projectWorkflowStageId, parentType });
  if (!draft.ok) throw new Error(draft.error);
  for (const file of files) {
    const prepared = await prepareWorkflowCompletionAttachmentUpload({
      draftId: draft.value.draftId,
      idempotencyKey: crypto.randomUUID(),
      fileName: file.name,
      declaredMediaType: file.type,
      sizeBytes: file.size,
      sha256: await sha256(file),
      declarationVersion: ATTACHMENT_DECLARATION_VERSION,
    });
    if (!prepared.ok) throw new Error(prepared.error);
    const uploaded = await fetch(prepared.value.uploadUrl, { method: "PUT", headers: prepared.value.requiredHeaders, body: file });
    if (!uploaded.ok) throw new Error("OBJECT_STORAGE_UPLOAD_FAILED");
    const completed = await completeWorkflowCompletionAttachmentUpload(prepared.value.assetId);
    if (!completed.ok) throw new Error(completed.error);
  }
  return [draft.value.draftId];
}

function nullableFormText(data: FormData, key: string): string | null { const value = data.get(key); return typeof value === "string" && value.trim() ? value.trim() : null; }
async function sha256(file: File): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer()); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function formatBytes(value: number): string { return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }
function completionErrorLabel(code: string): string { const labels: Record<string, string> = { DECLARATION_REQUIRED: "上传附件前必须确认禁限数据声明。", ATTACHMENT_LIMIT_EXCEEDED: "附件数量或总大小超过限制。", FILE_TYPE_MISMATCH: "附件内容与文件类型不一致。", FILE_METADATA_MISMATCH: "附件上传后的类型或大小不一致。", FILE_HASH_MISMATCH: "附件上传后的校验值不一致。", OBJECT_STORAGE_UPLOAD_FAILED: "附件未能上传到私有存储，请重试。", WORKFLOW_COMPLETION_ATTACHMENT_REQUIRED: "该节点必须提供至少一份可用完成附件。", WORKFLOW_COMPLETION_CONFLICT: "记录已变化，请刷新后重试。" }; return labels[code] ?? "操作未完成，请核对填写内容后重试。"; }

function statusLabel(status: string): string { const labels: Record<string, string> = { WAITING_FOR_PREDECESSOR: "暂定绿色 · 等待前置", PENDING_PMO_REVIEW: "暂定绿色 · 待 PMO审核", ISSUE_RESOLUTION_REQUIRED: "暂定绿色 · 等待问题解决", PREDECESSOR_RETURNED_CONFIRMATION: "前置失效 · 待重新确认", RETURNED_FOR_RESUBMISSION: "已退回 · 待重提", APPROVED: "正式绿色", WITHDRAWN: "已撤回", TERMINATED_BY_PLAN_CHANGE: "计划变更终止" }; return labels[status] ?? status; }
function formatDate(value: string): string { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(value)); }
