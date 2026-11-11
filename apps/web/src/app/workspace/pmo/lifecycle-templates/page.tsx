import { redirect } from "next/navigation";

import {
  createLifecycleTemplateDraft,
  createLifecycleTemplateSolution,
  deleteLifecycleTemplateVersion,
  publishLifecycleTemplateDraft,
  saveLifecycleTemplateDraft,
} from "@/app/workspace/lifecycle-template-actions";
import { ExecutionShell } from "@/components/collaboration/execution-shell";
import { LifecycleTemplateWorkspace } from "@/components/collaboration/lifecycle-template-workspace";
import { requireCollaborationActor } from "@/server/collaboration-session";
import { getLifecycleTemplateRuntime } from "@/server/progress-runtime";

export default async function LifecycleTemplatesPage({ searchParams }: {
  searchParams: Promise<{ templateError?: string; templateSaved?: string; selectedTemplateVersionId?: string }>;
}) {
  const actor = await requireCollaborationActor();
  if (actor.roleCode !== "PMO") redirect("/forbidden");
  const [versions, query] = await Promise.all([
    getLifecycleTemplateRuntime().listVersions(actor),
    searchParams,
  ]);
  const selected = versions.find(({ id }) => id === query.selectedTemplateVersionId);
  const successMessage = query.templateSaved === "published" && selected
    ? `工作流方案《${selected.templateName}》已发布，可用于新申请。`
    : query.templateSaved
      ? `工作流方案已${query.templateSaved === "created" ? "创建" : query.templateSaved === "deleted" ? "删除" : "保存"}。`
      : null;
  return <ExecutionShell eyebrow="PMO 工作区" title="工作流方案" backHref={null}>
    <p className="mt-2 text-sm text-slate-600">按名称管理可供申请者选择的完整泳道方案。阶段为列、工作流为行，节点位于交叉区。</p>
    {query.templateError ? <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errorLabel(query.templateError)}</p> : null}
    {successMessage ? <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{successMessage}</p> : null}
    <div className="mt-6"><LifecycleTemplateWorkspace versions={versions} preferredVersionId={selected?.id ?? null} saveAction={saveLifecycleTemplateDraft} publishAction={publishLifecycleTemplateDraft} deleteAction={deleteLifecycleTemplateVersion} createDraftAction={createLifecycleTemplateDraft} createSolutionAction={createLifecycleTemplateSolution} /></div>
  </ExecutionShell>;
}

function errorLabel(code: string): string { const labels: Record<string, string> = { WORKFLOW_DEPENDENCY_SELF_REFERENCE: "节点不能依赖自身。", WORKFLOW_DEPENDENCY_NODE_NOT_FOUND: "依赖引用了当前方案之外的节点。", WORKFLOW_DEPENDENCY_DUPLICATE: "存在重复依赖或矩阵交叉区。", WORKFLOW_DEPENDENCY_CYCLE: "依赖关系形成环路，无法发布。", WORKFLOW_DEPENDENCY_NOT_APPLICABLE_PREDECESSOR: "适用节点不能依赖不适用节点。", WORKFLOW_DEPENDENCY_REQUIRED_HAS_OPTIONAL_ANCESTOR: "必需节点不能存在可选祖先。", LIFECYCLE_TEMPLATE_INVALID_INPUT: "方案结构字段不完整或重复。", LIFECYCLE_TEMPLATE_NAME_DUPLICATE: "工作流方案名称已存在，请使用其他名称。", LIFECYCLE_TEMPLATE_CONFLICT: "方案已变化或已被发布，请刷新后重试。", LIFECYCLE_TEMPLATE_VERSION_REFERENCED: "此方案已有申请、计划或执行引用，不能删除。", COLLABORATION_FORBIDDEN: "仅 PMO 可以维护工作流方案。" }; return labels[code] ?? "工作流方案操作未完成，请核对配置。"; }
