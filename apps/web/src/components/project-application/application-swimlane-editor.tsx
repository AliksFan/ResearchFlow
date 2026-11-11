"use client";

import type { EditableProjectSwimlane } from "@researchflow/collaboration";
import type { ApplicationSwimlaneInput, ProjectApplicationFormOptions } from "@researchflow/project-application";
import { useState } from "react";

import { saveApplicationSwimlane } from "@/app/workspace/project-application-actions";
import { ProjectSwimlaneEditor } from "@/components/collaboration/project-swimlane-editor";

export function ApplicationSwimlaneEditor({ projectId, applicationVersionId, rowVersion, editable, initial, templates }: {
  projectId: string;
  applicationVersionId: string;
  rowVersion: number;
  editable: boolean;
  initial: ApplicationSwimlaneInput & { sourceTemplateName: string | null };
  templates: ProjectApplicationFormOptions["lifecycleTemplates"];
}) {
  const [sourceTemplateVersionId, setSourceTemplateVersionId] = useState(initial.sourceTemplateVersionId);
  const [swimlane, setSwimlane] = useState<ApplicationSwimlaneInput>(initial);
  const selected = templates.find(({ id }) => id === sourceTemplateVersionId);
  const sourceName = selected?.displayName ?? initial.sourceTemplateName;
  const selectTemplate = (id: string) => {
    if (!id || id === sourceTemplateVersionId) return;
    if ((swimlane.stages.length || swimlane.workflows.length || swimlane.nodes.length) && !window.confirm("切换方案会整体替换当前申请的阶段、工作流、节点、日期、角色和依赖，尚未保存的泳道修改将丢失。是否继续？")) return;
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setSourceTemplateVersionId(id);
    setSwimlane({
      name: template.displayName,
      expectedRevision: initial.expectedRevision,
      sourceTemplateVersionId: id,
      stages: template.stages.map((item) => ({ id: item.id, code: item.code, name: item.displayName, sortOrder: item.sortOrder, applicability: item.applicability, plannedStartDate: null, plannedEndDate: null })),
      workflows: template.workflows.map((item) => ({ id: item.id, code: item.code, name: item.displayName, description: item.description, sortOrder: item.sortOrder, enabled: item.enabled })),
      nodes: template.nodes.map((item) => ({ id: item.id, workflowId: item.workflowId, stageId: item.stageId, taskName: item.displayName, taskDescription: "", sortOrder: item.sortOrder, applicability: item.applicability, plannedStartDate: null, plannedEndDate: null, updateIntervalDays: null, overdueReminderIntervalDays: 7, attachmentRequirement: item.attachmentRequirement, ownerRoles: item.ownerRoles, predecessorIds: item.predecessorIds })),
    });
  };
  const editorValue: EditableProjectSwimlane = {
    projectId,
    projectStatus: "ACTIVE",
    name: swimlane.name,
    expectedRevision: String(swimlane.expectedRevision),
    canEdit: editable && Boolean(sourceTemplateVersionId),
    stages: swimlane.stages,
    workflows: swimlane.workflows,
    nodes: swimlane.nodes.map((node) => ({ ...node, executionStatus: "NOT_STARTED", hasExecutionHistory: false })),
  };
  return <div>
    {editable ? <label className="block max-w-xl"><span className="field-label">工作流方案</span><select className="field-control" value={sourceTemplateVersionId ?? ""} onChange={(event) => selectTemplate(event.target.value)}><option value="">请选择</option>{initial.sourceTemplateVersionId && !selected ? <option value={initial.sourceTemplateVersionId}>已删除方案（提交前必须重新选择）</option> : null}{templates.map((template) => <option key={template.id} value={template.id}>{template.displayName}</option>)}</select></label> : null}
    {sourceName ? <p className="mt-2 text-sm text-slate-600">基于：{sourceName}</p> : <p className="mt-2 text-sm text-slate-500">尚未选择工作流方案。</p>}
    {editable ? <p className="mt-1 text-xs text-slate-500">选择或切换方案后，请先保存泳道，再提交项目申请。</p> : null}
    {initial.sourceTemplateVersionId && !selected ? <p role="alert" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">原工作流方案已删除。已保存的申请泳道仍可查看；提交前必须选择当前可用方案并保存替换。</p> : null}
    {(swimlane.stages.length || swimlane.workflows.length || swimlane.nodes.length) ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4"><div><p className="font-medium">{swimlane.name}</p><p className="mt-1 text-xs text-slate-500">阶段、工作流、节点、日期、角色与直接前置依赖。</p></div><ProjectSwimlaneEditor key={`${sourceTemplateVersionId ?? "none"}-${swimlane.expectedRevision}`} initial={editorValue} variant="application" onSave={async (draft) => {
      const result = await saveApplicationSwimlane({ commandId: crypto.randomUUID(), projectId, applicationVersionId, expectedRowVersion: rowVersion, swimlane: { name: draft.name, expectedRevision: Number(draft.expectedRevision), sourceTemplateVersionId, stages: draft.stages, workflows: draft.workflows, nodes: draft.nodes.map((node) => ({ id: node.id, workflowId: node.workflowId, stageId: node.stageId, taskName: node.taskName, taskDescription: node.taskDescription, sortOrder: node.sortOrder, applicability: node.applicability, plannedStartDate: node.plannedStartDate, plannedEndDate: node.plannedEndDate, updateIntervalDays: node.updateIntervalDays, overdueReminderIntervalDays: node.overdueReminderIntervalDays, attachmentRequirement: node.attachmentRequirement, ownerRoles: node.ownerRoles.filter((role): role is Exclude<typeof role, "DEAN"> => role !== "DEAN"), predecessorIds: node.predecessorIds })) } });
      return result.ok ? { ok: true } : { ok: false, message: applicationErrorMessage(result.code) };
    }} /></div> : null}
  </div>;
}

function applicationErrorMessage(code: string) {
  const decoded = decodeURIComponent(code);
  if (decoded === "PROJECT_APPLICATION_FORBIDDEN") return "当前账号无权修改这份申请泳道。";
  if (decoded === "PROJECT_APPLICATION_INVALID_STATE") return "当前申请状态不允许修改泳道。";
  if (decoded === "PROJECT_APPLICATION_CONFLICT") return "申请已被其他操作更新，请刷新后核对。";
  if (decoded === "PROJECT_APPLICATION_TEMPLATE_INVALID") return "所选工作流方案已不可用，请重新选择。";
  if (decoded === "PROJECT_APPLICATION_SWIMLANE_INVALID") return "泳道存在无效阶段、工作流、节点、日期、责任角色或依赖，请逐项核对。";
  return "申请泳道未保存，系统处理时发生异常。";
}
