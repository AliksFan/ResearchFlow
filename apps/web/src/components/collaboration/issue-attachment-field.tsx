"use client";

import { useState } from "react";

import {
  completeIssueAttachmentUpload,
  createIssueAttachmentDraft,
  prepareIssueAttachmentUpload,
} from "@/app/workspace/issue-actions";

const ACCEPTED_FILE_TYPES = ".pdf,.docx,.xlsx,.jpg,.jpeg,.png";
const DECLARATION_VERSION = "PROJECT_LEVEL_NO_PATIENT_DATA_V1";

export function IssueAttachmentField({
  projectId,
  projectWorkflowStageId,
  issueId,
  parentType,
  visibilityScope,
}: {
  projectId: string;
  projectWorkflowStageId: string | null;
  issueId: string | null;
  parentType: "ISSUE" | "ISSUE_ACTIVITY" | "ISSUE_DEAN_DECISION" | "ISSUE_IMPLEMENTATION_SUBMISSION";
  visibilityScope: "PMO_ONLY" | "PMO_AND_DEAN" | "ISSUE_PARTICIPANTS" | null;
}) {
  const [declared, setDeclared] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("");

  async function upload(files: FileList | null, form: HTMLFormElement | null) {
    if (!files?.length) return;
    if (!declared) { setStatus("请先确认附件禁限数据声明。"); return; }
    setStatus("正在上传并校验附件……");
    try {
      const nodeField = form?.elements.namedItem("projectWorkflowStageId") as HTMLSelectElement | null;
      const effectiveNodeId = projectWorkflowStageId ?? (nodeField?.value || null);
      const visibilityField = form?.elements.namedItem("visibilityScope") as HTMLSelectElement | null;
      const effectiveVisibility = visibilityScope ?? parseVisibility(visibilityField?.value);
      const draft = await createIssueAttachmentDraft({ projectId, projectWorkflowStageId: effectiveNodeId, issueId, parentType, visibilityScope: effectiveVisibility });
      if (!draft.ok) throw new Error(draft.error);
      for (const file of [...files]) {
        const prepared = await prepareIssueAttachmentUpload({
          draftId: draft.value.draftId,
          idempotencyKey: crypto.randomUUID(),
          fileName: file.name,
          declaredMediaType: file.type,
          sizeBytes: file.size,
          sha256: await sha256(file),
          declarationVersion: DECLARATION_VERSION,
        });
        if (!prepared.ok) throw new Error(prepared.error);
        const uploaded = await fetch(prepared.value.uploadUrl, { method: "PUT", headers: prepared.value.requiredHeaders, body: file });
        if (!uploaded.ok) throw new Error("OBJECT_STORAGE_UPLOAD_FAILED");
        const completed = await completeIssueAttachmentUpload(prepared.value.assetId);
        if (!completed.ok) throw new Error(completed.error);
      }
      setDraftIds((current) => [...current, draft.value.draftId]);
      setStatus(`已准备 ${files.length} 个附件，可随表单提交。`);
    } catch (error) {
      setStatus(attachmentError(error instanceof Error ? error.message : "ATTACHMENT_FAILED"));
    }
  }

  return <fieldset className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3">
    <legend className="px-1 text-sm font-semibold">附件（选填）</legend>
    {draftIds.map((draftId) => <input key={draftId} type="hidden" name="attachmentDraftIds" value={draftId} />)}
    <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={declared} onChange={(event) => setDeclared(event.target.checked)} className="mt-0.5" /><span>我确认附件只包含虚拟或正式项目级资料，不含患者/受试者数据、发票、支付流水或个人账户资料。</span></label>
    <input type="file" multiple accept={ACCEPTED_FILE_TYPES} onChange={(event) => void upload(event.target.files, event.currentTarget.form)} className="text-sm" />
    <p className="text-xs text-slate-500">支持 PDF、DOCX、XLSX、JPG、JPEG、PNG；文件会先上传私有存储并完成内容校验。</p>
    {status ? <p role="status" className="text-xs text-slate-700">{status}</p> : null}
  </fieldset>;
}

async function sha256(file: File): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer()); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function attachmentError(code: string): string { const labels: Record<string, string> = { ATTACHMENT_FORBIDDEN: "当前角色或问题状态不允许上传附件。", ATTACHMENT_LIMIT_EXCEEDED: "附件数量或总大小超过限制。", FILE_TYPE_MISMATCH: "附件内容与文件类型不一致。", FILE_METADATA_MISMATCH: "附件上传后的类型或大小不一致。", FILE_HASH_MISMATCH: "附件上传后的校验值不一致。", OBJECT_STORAGE_UPLOAD_FAILED: "附件未能上传到私有存储。" }; return labels[code] ?? "附件上传未完成，请重试。"; }
function parseVisibility(value: string | undefined): "PMO_ONLY" | "PMO_AND_DEAN" | "ISSUE_PARTICIPANTS" { if (value === "PMO_AND_DEAN" || value === "ISSUE_PARTICIPANTS") return value; return "PMO_ONLY"; }
