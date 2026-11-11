"use client";

import type { CollaborationRoleCode, WorkflowProgressRecord } from "@researchflow/collaboration";
import { useMemo, useState, type FormEvent } from "react";

import {
  completeProgressAttachmentUpload,
  correctWorkflowProgress,
  createProgressAttachmentDraft,
  prepareProgressAttachmentUpload,
  submitWorkflowProgress,
} from "@/app/workspace/progress-actions";

const ATTACHMENT_DECLARATION_VERSION = "PROGRESS_ATTACHMENT_DECLARATION_V1";
const ACCEPTED_FILE_TYPES = ".pdf,.docx,.xlsx,.jpg,.jpeg,.png";

export interface ReportableWorkflowNode {
  workflowStageId: string;
  label: string;
  attachmentRequirement: "NONE" | "OPTIONAL" | "REQUIRED";
}

export function WorkflowProgressPanel({
  actor,
  projectId,
  nodes,
  progress,
  recordedBudgetTotal,
  writable = true,
  embedded = false,
  showForm = true,
  showRecords = true,
}: {
  actor: { personId: string; roleCode: CollaborationRoleCode };
  projectId: string;
  nodes: ReportableWorkflowNode[];
  progress: WorkflowProgressRecord[];
  recordedBudgetTotal: string;
  writable?: boolean;
  embedded?: boolean;
  showForm?: boolean;
  showRecords?: boolean;
}) {
  const nodeLabels = useMemo(() => new Map(nodes.map((node) => [node.workflowStageId, node.label])), [nodes]);
  const [selectedNodeId, setSelectedNodeId] = useState(nodes[0]?.workflowStageId ?? "");
  const selectedNode = nodes.find((node) => node.workflowStageId === selectedNodeId);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const fileInput = form.elements.namedItem("attachments") as HTMLInputElement | null;
    const files = [...(fileInput?.files ?? [])];
    try {
      let attachmentDraftIds: string[] = [];
      if (files.length > 0) {
        if (data.get("attachmentDeclaration") !== "accepted") throw new Error("DECLARATION_REQUIRED");
        const draftResult = await createProgressAttachmentDraft({
          projectId,
          projectWorkflowStageId: selectedNodeId,
        });
        if (!draftResult.ok) throw new Error(draftResult.error);
        attachmentDraftIds = [draftResult.value.draftId];
        for (const file of files) {
          const prepared = await prepareProgressAttachmentUpload({
            draftId: draftResult.value.draftId,
            idempotencyKey: crypto.randomUUID(),
            fileName: file.name,
            declaredMediaType: file.type,
            sizeBytes: file.size,
            sha256: await sha256(file),
            declarationVersion: ATTACHMENT_DECLARATION_VERSION,
          });
          if (!prepared.ok) throw new Error(prepared.error);
          const uploaded = await fetch(prepared.value.uploadUrl, {
            method: "PUT",
            headers: prepared.value.requiredHeaders,
            body: file,
          });
          if (!uploaded.ok) throw new Error("OBJECT_STORAGE_UPLOAD_FAILED");
          const completed = await completeProgressAttachmentUpload(prepared.value.assetId);
          if (!completed.ok) throw new Error(completed.error);
        }
      }
      const submitted = await submitWorkflowProgress({
        projectId,
        projectWorkflowStageId: selectedNodeId,
        progressSummary: String(data.get("progressSummary") ?? ""),
        basis: String(data.get("basis") ?? ""),
        expectedCompletionDate: nullableFormText(data, "expectedCompletionDate"),
        budgetAmountCny: nullableFormText(data, "budgetAmountCny"),
        attachmentDraftIds,
      });
      if (!submitted.ok) throw new Error(submitted.error);
      window.location.assign(`/workspace/projects/${projectId}/execution?node=${encodeURIComponent(selectedNodeId)}&tab=progress&progress=${encodeURIComponent(submitted.value.recordId)}&progressSaved=progress#progress-${encodeURIComponent(submitted.value.recordId)}`);
    } catch (error) {
      setMessage(progressErrorLabel(error instanceof Error ? error.message : "PROGRESS_OPERATION_FAILED"));
      setSubmitting(false);
    }
  }

  return (
    <section className={embedded ? "" : "mt-8 rounded-xl border border-slate-200 bg-white p-5"}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">项目进展</h2>
          <p className="mt-1 text-sm text-slate-600">按执行节点记录普通进展；纠错以追加记录保留审计轨迹。</p>
        </div>
        <div className="rounded-lg bg-teal-50 px-4 py-2 text-right">
          <p className="text-xs text-teal-700">已记录经费使用合计</p>
          <p className="font-semibold text-teal-950">¥ {recordedBudgetTotal}</p>
          <p className="text-xs text-teal-700">项目进展记录口径，非财务数据</p>
        </div>
      </header>

      {showForm && writable && actor.roleCode === "KEY_SUB_I" ? (
        <form className="mt-5 grid gap-4 rounded-xl border border-teal-100 bg-teal-50/40 p-4" onSubmit={handleSubmit}>
          <h3 className="font-semibold text-slate-950">提交项目进展</h3>
          {nodes.length === 1 ? <input type="hidden" name="projectWorkflowStageId" value={selectedNodeId} /> : <label className="grid gap-1 text-sm font-medium">执行节点
            <select name="projectWorkflowStageId" required value={selectedNodeId} onChange={(event) => setSelectedNodeId(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2">
              {nodes.map((node) => <option key={node.workflowStageId} value={node.workflowStageId}>{node.label}</option>)}
            </select>
          </label>}
          {nodes.length === 0 ? <p role="alert" className="text-sm text-amber-800">当前没有可填报的执行节点。</p> : null}
          <label className="grid gap-1 text-sm font-medium">进展摘要
            <textarea name="progressSummary" required rows={3} className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          <label className="grid gap-1 text-sm font-medium">填报依据
            <textarea name="basis" required rows={2} className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">预计完成日期（选填）
              <input name="expectedCompletionDate" type="date" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium">本次经费使用金额（元）（选填）
              <input name="budgetAmountCny" inputMode="decimal" placeholder="例如 1200.00" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </label>
          </div>
          <fieldset disabled={selectedNode?.attachmentRequirement === "NONE"} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 disabled:opacity-60">
            <legend className="px-1 text-sm font-semibold">受控附件（选填）</legend>
            <input name="attachments" type="file" multiple accept={ACCEPTED_FILE_TYPES} className="text-sm" />
            <p className="text-xs text-slate-600">支持 PDF、DOCX、XLSX、JPG、JPEG、PNG；单个 20 MB，最多 10 个，合计 100 MB。</p>
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input name="attachmentDeclaration" type="checkbox" value="accepted" className="mt-0.5" />
              <span>我确认附件只包含虚拟或正式项目级资料，不包含患者/受试者数据、发票、支付流水或个人账户资料。</span>
            </label>
            {selectedNode?.attachmentRequirement === "NONE" ? <p className="text-xs text-amber-700">该节点不接收附件。</p> : null}
          </fieldset>
          {message ? <p role="alert" className="text-sm text-red-700">{message}</p> : null}
          <button disabled={submitting || nodes.length === 0} className="w-fit rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{submitting ? "正在提交…" : "提交项目进展"}</button>
        </form>
      ) : showForm ? <p className="mt-5 text-sm text-slate-500">项目进展仅供查看；只有项目 Key Sub-I 可以提交或纠错。</p> : null}

      {showRecords ? <div className="mt-6 grid gap-4">
        {progress.length === 0 ? <p className="text-sm text-slate-500">暂无项目进展记录。</p> : progress.map((item) => (
          <WorkflowProgressRecordCard key={item.id} actor={actor} projectId={projectId} item={item} label={nodeLabels.get(item.projectWorkflowStageId) ?? "执行节点"} writable={writable} />
        ))}
      </div> : null}
    </section>
  );
}

export function WorkflowProgressRecordCard({ actor, projectId, item, label, writable = true }: { actor: { personId: string; roleCode: CollaborationRoleCode }; projectId: string; item: WorkflowProgressRecord; label: string; writable?: boolean }) {
  return <article id={`progress-${item.id}`} tabIndex={-1} className="scroll-mt-4 rounded-xl border border-slate-200 p-4">
    <header className="flex flex-wrap justify-between gap-2"><div><span className="text-xs font-semibold text-teal-700">正常填报</span><h3 className="font-semibold">{label}</h3></div><time className="text-sm text-slate-500">{formatDateTime(item.submittedAt)}</time></header>
    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-900">{item.progressSummary}</p>
    <dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3"><div><dt className="font-medium">填报依据</dt><dd>{item.basis}</dd></div><div><dt className="font-medium">预计完成</dt><dd>{item.expectedCompletionDate ?? "未填写"}</dd></div><div><dt className="font-medium">经费使用金额</dt><dd>{item.effectiveBudgetAmountCny ? `¥ ${item.effectiveBudgetAmountCny}` : "未填写"}</dd></div></dl>
    {item.attachments.length > 0 ? <ul className="mt-3 flex flex-wrap gap-2 text-sm">{item.attachments.map((attachment) => <li key={attachment.assetId}><a aria-label={`下载附件 ${attachment.fileName}`} className="font-semibold text-teal-700" href={`/workspace/attachments/${attachment.assetId}/download`}>{attachment.fileName}</a> <span className="text-xs text-slate-500">({formatBytes(attachment.sizeBytes)})</span></li>)}</ul> : null}
    {writable && actor.roleCode === "KEY_SUB_I" ? <details className="mt-4 rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-semibold text-teal-800">纠错</summary><form action={correctWorkflowProgress} className="mt-3 grid gap-3"><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="workflowUpdateId" value={item.id} /><input type="hidden" name="returnNode" value={item.projectWorkflowStageId} /><input type="hidden" name="expectedLatestSequenceNo" value={item.latestCorrectionSequenceNo} /><label className="grid gap-1 text-sm">纠错原因<input required name="correctionReason" className="rounded border border-slate-300 bg-white px-3 py-2" /></label><label className="grid gap-1 text-sm">修订进展摘要（留空保持）<textarea name="revisedProgressSummary" rows={2} className="rounded border border-slate-300 bg-white px-3 py-2" /></label><label className="grid gap-1 text-sm">修订填报依据（留空保持）<textarea name="revisedBasis" rows={2} className="rounded border border-slate-300 bg-white px-3 py-2" /></label><div className="grid gap-3 sm:grid-cols-2"><RevisionControl label="预计完成日期" modeName="revisedExpectedDateMode" valueName="revisedExpectedDate" inputType="date" /><RevisionControl label="经费使用金额" modeName="budgetAmountMode" valueName="revisedBudgetAmountCny" inputType="text" /></div><button className="w-fit rounded bg-slate-800 px-3 py-2 text-sm font-semibold text-white">提交纠错</button></form></details> : null}
  </article>;
}

function RevisionControl({ label, modeName, valueName, inputType }: { label: string; modeName: string; valueName: string; inputType: "date" | "text" }) {
  return <fieldset className="grid gap-1 text-sm"><legend className="font-medium">{label}</legend><select name={modeName} defaultValue="KEEP" className="rounded border border-slate-300 bg-white px-3 py-2"><option value="KEEP">保持</option><option value="SET">修改为</option><option value="CLEAR">清空</option></select><input name={valueName} type={inputType} placeholder={inputType === "text" ? "选择修改为时填写" : undefined} className="rounded border border-slate-300 bg-white px-3 py-2" /></fieldset>;
}

function nullableFormText(data: FormData, key: string): string | null {
  const value = data.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formatBytes(value: number): string {
  return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(value));
}

function progressErrorLabel(code: string): string {
  const labels: Record<string, string> = {
    DECLARATION_REQUIRED: "上传附件前必须确认禁限数据声明。",
    ATTACHMENT_LIMIT_EXCEEDED: "附件数量或总大小超过限制。",
    FILE_TYPE_MISMATCH: "附件内容与文件类型不一致。",
    FILE_METADATA_MISMATCH: "附件上传后的类型或大小不一致。",
    FILE_HASH_MISMATCH: "附件上传后的校验值不一致。",
    INVALID_BUDGET_AMOUNT: "经费使用金额必须为正数且最多保留两位小数。",
    OBJECT_STORAGE_UPLOAD_FAILED: "附件未能上传到私有存储，请重试。",
  };
  return labels[code] ?? "操作未完成，请核对填写内容后重试。";
}
