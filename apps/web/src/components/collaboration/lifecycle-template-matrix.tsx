"use client";

import { useEffect, useState } from "react";

import type {
  LifecycleTemplateNodeDraft,
  LifecycleTemplateStageDraft,
  LifecycleTemplateVersionRecord,
  LifecycleTemplateWorkflowDraft,
} from "@researchflow/collaboration";

type EditorTarget = { kind: "version" } | { kind: "stage" | "workflow" | "node"; id: string } | null;

export function LifecycleTemplateMatrix({
  initialVersion,
  saveAction,
  publishAction,
  deleteAction,
  createDraftAction,
  onDirtyChange,
}: {
  initialVersion: LifecycleTemplateVersionRecord;
  saveAction: (formData: FormData) => Promise<void>;
  publishAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  createDraftAction: (formData: FormData) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [version, setVersion] = useState(initialVersion);
  const [editor, setEditor] = useState<EditorTarget>(null);
  const editable = version.status === "DRAFT";
  const stages = [...version.stages].sort((left, right) => left.sortOrder - right.sortOrder);
  const workflows = [...version.workflows].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  useEffect(() => {
    onDirtyChange?.(JSON.stringify(version) !== JSON.stringify(initialVersion));
  }, [initialVersion, onDirtyChange, version]);

  function addStage() {
    const id = crypto.randomUUID();
    setVersion((current) => ({ ...current, stages: [...current.stages, {
      id,
      code: `S${current.stages.length + 1}`,
      name: `新阶段 ${current.stages.length + 1}`,
      sortOrder: current.stages.length + 1,
      applicability: "REQUIRED",
    }] }));
    setEditor({ kind: "stage", id });
  }

  function addWorkflow() {
    const id = crypto.randomUUID();
    setVersion((current) => ({ ...current, workflows: [...current.workflows, {
      id,
      code: `FLOW_${current.workflows.length + 1}`,
      name: `新工作流 ${current.workflows.length + 1}`,
      description: "虚拟项目工作流说明",
      requiredByDefault: true,
      enabled: true,
    }] }));
    setEditor({ kind: "workflow", id });
  }

  function addNode() {
    const occupied = new Set(version.nodes.map(({ workflowId, stageId }) => `${workflowId}:${stageId}`));
    const cell = version.workflows.flatMap((workflow) => version.stages.map((stage) => ({ workflow, stage })))
      .find(({ workflow, stage }) => !occupied.has(`${workflow.id}:${stage.id}`));
    if (!cell) return;
    const id = crypto.randomUUID();
    setVersion((current) => ({ ...current, nodes: [...current.nodes, {
      id,
      workflowId: cell.workflow.id,
      stageId: cell.stage.id,
      task: "新节点",
      ownerRole: "KEY_SUB_I",
      sortOrder: current.nodes.length + 1,
      applicability: "REQUIRED",
      attachmentRequirement: "NONE",
      predecessorIds: [],
    }] }));
    setEditor({ kind: "node", id });
  }

  function removeTarget(target: Exclude<EditorTarget, null>) {
    if (target.kind === "version") return;
    const nodeCount = target.kind === "stage"
      ? version.nodes.filter(({ stageId }) => stageId === target.id).length
      : target.kind === "workflow"
        ? version.nodes.filter(({ workflowId }) => workflowId === target.id).length
        : 0;
    if (nodeCount > 0) {
      const label = target.kind === "stage" ? "阶段" : "工作流";
      if (!window.confirm(`删除该${label}将同时删除 ${nodeCount} 个节点及相关直接前置依赖。是否继续？`)) return;
    }
    setVersion((current) => target.kind === "stage"
      ? removeTemplateStage(current, target.id)
      : target.kind === "workflow"
        ? removeTemplateWorkflow(current, target.id)
        : removeTemplateNode(current, target.id));
    setEditor(null);
  }

  return <article className="rounded-xl border border-slate-200 bg-white p-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold text-teal-700">{version.templateCode}</p><h2 className="font-semibold">{version.templateName}</h2></div>
      <div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{version.displayStatus === "UNPUBLISHED" ? "未发布" : version.displayStatus === "EDITING" ? "编辑中" : "已发布"}</span><button type="button" className="button-secondary" onClick={() => setEditor({ kind: "version" })}>查看完整详情</button></div>
    </header>
    <form className="mt-4 grid gap-4">
      <input type="hidden" name="templateVersionId" value={version.id} />
      <input type="hidden" name="templateName" value={version.templateName} />
      <input type="hidden" name="sourceTemplateVersionId" value={version.id} />
      <input type="hidden" name="expectedFingerprint" value={version.fingerprint} />
      <TemplateHiddenFields version={version} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead><tr><th className="border border-slate-200 bg-slate-50 p-2">工作流 / 阶段</th>{stages.map((stage) => <th key={stage.id} className="border border-slate-200 bg-slate-50 p-2"><button type="button" className="font-semibold text-teal-700" onClick={() => setEditor({ kind: "stage", id: stage.id })}>{stage.name}</button><p className="mt-1 text-xs font-normal text-slate-500">{stage.code} · {stage.applicability}</p></th>)}</tr></thead>
          <tbody>{workflows.map((workflow) => <tr key={workflow.id}><th className="border border-slate-200 p-2 align-top"><button type="button" className="font-semibold text-teal-700" onClick={() => setEditor({ kind: "workflow", id: workflow.id })}>{workflow.name}</button><p className="mt-1 text-xs font-normal text-slate-500">{workflow.code} · {workflow.enabled ? "启用" : "停用"}</p></th>{stages.map((stage) => {
            const node = version.nodes.find((item) => item.workflowId === workflow.id && item.stageId === stage.id);
            return <td key={stage.id} className="min-w-52 border border-slate-200 p-2 align-top">{node ? <button type="button" className="w-full rounded-lg border border-teal-100 bg-teal-50 p-3 text-left" onClick={() => setEditor({ kind: "node", id: node.id })}><span className="font-medium text-slate-900">{node.task}</span><span className="mt-1 block text-xs text-slate-600">{node.applicability} · 附件 {node.attachmentRequirement}</span><span className="mt-1 block text-xs text-slate-500">前置 {node.predecessorIds.length} 项</span></button> : <span className="text-xs text-slate-400">无节点</span>}</td>;
          })}</tr>)}</tbody>
        </table>
      </div>
      {editable ? <div className="flex flex-wrap gap-2"><button type="button" className="button-secondary" onClick={addStage}>新增阶段</button><button type="button" className="button-secondary" onClick={addWorkflow}>新增工作流</button><button type="button" className="button-secondary" onClick={addNode} disabled={!version.stages.length || !version.workflows.length}>新增节点</button><span className="flex-1" /><button formAction={saveAction} className="button-secondary">保存方案</button><button formAction={publishAction} className="button-primary">保存并发布</button></div> : null}
    </form>
    {editable ? <form action={deleteAction} className="mt-3"><input type="hidden" name="templateVersionId" value={version.id} /><input type="hidden" name="expectedFingerprint" value={version.fingerprint} /><button className="text-sm font-semibold text-red-700">{version.displayStatus === "EDITING" ? "丢弃未发布修改" : "删除方案"}</button></form> : <div className="mt-4 flex flex-wrap gap-2"><form action={createDraftAction}><input type="hidden" name="sourceTemplateVersionId" value={version.id} /><button className="button-secondary">编辑方案</button></form><form action={deleteAction}><input type="hidden" name="templateVersionId" value={version.id} /><input type="hidden" name="expectedFingerprint" value={version.fingerprint} /><button className="button-secondary border-red-200 text-red-700">删除方案</button></form></div>}
    {editor ? <EditorDialog version={version} target={editor} editable={editable} onChange={setVersion} onDelete={() => removeTarget(editor)} onClose={() => setEditor(null)} /> : null}
  </article>;
}

function TemplateHiddenFields({ version }: { version: LifecycleTemplateVersionRecord }) {
  return <>{version.stages.map((stage) => <span key={stage.id}><input type="hidden" name="stageId" value={stage.id} /><input type="hidden" name={`stageCode:${stage.id}`} value={stage.code} /><input type="hidden" name={`stageName:${stage.id}`} value={stage.name} /><input type="hidden" name={`stageOrder:${stage.id}`} value={stage.sortOrder} /><input type="hidden" name={`stageApplicability:${stage.id}`} value={stage.applicability} /></span>)}{version.workflows.map((workflow) => <span key={workflow.id}><input type="hidden" name="workflowId" value={workflow.id} /><input type="hidden" name={`workflowCode:${workflow.id}`} value={workflow.code} /><input type="hidden" name={`workflowName:${workflow.id}`} value={workflow.name} /><input type="hidden" name={`workflowDescription:${workflow.id}`} value={workflow.description} /><input type="hidden" name={`workflowRequired:${workflow.id}`} value={workflow.requiredByDefault ? "1" : "0"} /><input type="hidden" name={`workflowEnabled:${workflow.id}`} value={workflow.enabled ? "1" : "0"} /></span>)}{version.nodes.map((node) => <span key={node.id}><input type="hidden" name="nodeId" value={node.id} /><input type="hidden" name={`nodeWorkflow:${node.id}`} value={node.workflowId} /><input type="hidden" name={`nodeStage:${node.id}`} value={node.stageId} /><input type="hidden" name={`nodeTask:${node.id}`} value={node.task} /><input type="hidden" name={`nodeOwner:${node.id}`} value={node.ownerRole} /><input type="hidden" name={`nodeOrder:${node.id}`} value={node.sortOrder} /><input type="hidden" name={`applicability:${node.id}`} value={node.applicability} /><input type="hidden" name={`attachment:${node.id}`} value={node.attachmentRequirement} />{node.predecessorIds.map((id) => <input key={id} type="hidden" name={`predecessor:${node.id}`} value={id} />)}</span>)}</>;
}

function EditorDialog({ version, target, editable, onChange, onDelete, onClose }: { version: LifecycleTemplateVersionRecord; target: Exclude<EditorTarget, null>; editable: boolean; onChange: (value: LifecycleTemplateVersionRecord) => void; onDelete: () => void; onClose: () => void }) {
  return <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl"><div className="flex items-center justify-between"><h3 className="font-semibold">{target.kind === "version" ? "方案完整详情" : target.kind === "stage" ? "阶段详情" : target.kind === "workflow" ? "工作流详情" : "节点详情"}</h3><button type="button" className="button-secondary" onClick={onClose}>关闭</button></div><div className="mt-4">{target.kind === "version" ? <VersionDetail version={version} onChange={onChange} /> : target.kind === "stage" ? <StageEditor value={version.stages.find(({ id }) => id === target.id)!} editable={editable} onChange={(value) => onChange({ ...version, stages: version.stages.map((item) => item.id === value.id ? value : item) })} /> : target.kind === "workflow" ? <WorkflowEditor value={version.workflows.find(({ id }) => id === target.id)!} editable={editable} onChange={(value) => onChange({ ...version, workflows: version.workflows.map((item) => item.id === value.id ? value : item) })} /> : <NodeEditor version={version} value={version.nodes.find(({ id }) => id === target.id)!} editable={editable} onChange={(value) => onChange({ ...version, nodes: version.nodes.map((item) => item.id === value.id ? value : item) })} />}</div>{editable && target.kind !== "version" ? <div className="mt-6 border-t border-slate-200 pt-4"><button type="button" className="text-sm font-semibold text-red-700" onClick={onDelete}>删除{target.kind === "stage" ? "阶段" : target.kind === "workflow" ? "工作流" : "节点"}</button></div> : null}</div></div>;
}

function VersionDetail({ version, onChange }: { version: LifecycleTemplateVersionRecord; onChange: (value: LifecycleTemplateVersionRecord) => void }) { return <div className="grid gap-3 text-sm">{version.nameEditable ? <Field label="方案名称（首次发布前可修改）" value={version.templateName} disabled={false} onChange={(templateName) => onChange({ ...version, templateName })} /> : <p>方案名称：{version.templateName}</p>}<p>状态：{version.displayStatus === "UNPUBLISHED" ? "未发布" : version.displayStatus === "EDITING" ? "编辑中" : "已发布"}</p><p>阶段：{version.stages.map(({ name }) => name).join("、") || "未配置"}</p><p>工作流：{version.workflows.map(({ name }) => name).join("、") || "未配置"}</p><ul className="grid gap-2">{version.nodes.map((node) => <li key={node.id} className="rounded bg-slate-50 p-2">{node.task} · {version.workflows.find(({ id }) => id === node.workflowId)?.name} / {version.stages.find(({ id }) => id === node.stageId)?.name} · {node.ownerRole} · {node.applicability} · {node.attachmentRequirement} · 前置 {node.predecessorIds.length} 项</li>)}</ul></div>; }

function StageEditor({ value, editable, onChange }: { value: LifecycleTemplateStageDraft; editable: boolean; onChange: (value: LifecycleTemplateStageDraft) => void }) { return <div className="grid gap-3"><Field label="编码" value={value.code} disabled={!editable} onChange={(code) => onChange({ ...value, code })} /><Field label="名称" value={value.name} disabled={!editable} onChange={(name) => onChange({ ...value, name })} /><NumberField label="顺序" value={value.sortOrder} disabled={!editable} onChange={(sortOrder) => onChange({ ...value, sortOrder })} /><SelectField label="默认适用性" value={value.applicability} disabled={!editable} options={["REQUIRED", "OPTIONAL", "NOT_APPLICABLE"]} onChange={(applicability) => onChange({ ...value, applicability: applicability as LifecycleTemplateStageDraft["applicability"] })} /></div>; }

function WorkflowEditor({ value, editable, onChange }: { value: LifecycleTemplateWorkflowDraft; editable: boolean; onChange: (value: LifecycleTemplateWorkflowDraft) => void }) { return <div className="grid gap-3"><Field label="编码" value={value.code} disabled={!editable} onChange={(code) => onChange({ ...value, code })} /><Field label="名称" value={value.name} disabled={!editable} onChange={(name) => onChange({ ...value, name })} /><Field label="说明" value={value.description} disabled={!editable} onChange={(description) => onChange({ ...value, description })} /><label className="flex gap-2"><input type="checkbox" checked={value.requiredByDefault} disabled={!editable} onChange={(event) => onChange({ ...value, requiredByDefault: event.target.checked })} />默认必需</label><label className="flex gap-2"><input type="checkbox" checked={value.enabled} disabled={!editable} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} />启用</label></div>; }

function NodeEditor({ version, value, editable, onChange }: { version: LifecycleTemplateVersionRecord; value: LifecycleTemplateNodeDraft; editable: boolean; onChange: (value: LifecycleTemplateNodeDraft) => void }) { return <div className="grid gap-3"><Field label="节点任务" value={value.task} disabled={!editable} onChange={(task) => onChange({ ...value, task })} /><SelectField label="所属阶段" value={value.stageId} disabled={!editable} options={version.stages.map(({ id }) => id)} labels={Object.fromEntries(version.stages.map(({ id, name }) => [id, name]))} onChange={(stageId) => onChange({ ...value, stageId })} /><SelectField label="所属工作流" value={value.workflowId} disabled={!editable} options={version.workflows.map(({ id }) => id)} labels={Object.fromEntries(version.workflows.map(({ id, name }) => [id, name]))} onChange={(workflowId) => onChange({ ...value, workflowId })} /><SelectField label="责任角色" value={value.ownerRole} disabled={!editable} options={["PMO", "DEAN", "KEY_SUB_I", "CRC", "STATISTICIAN", "COLLABORATION_LEAD"]} onChange={(ownerRole) => onChange({ ...value, ownerRole: ownerRole as LifecycleTemplateNodeDraft["ownerRole"] })} /><NumberField label="顺序" value={value.sortOrder} disabled={!editable} onChange={(sortOrder) => onChange({ ...value, sortOrder })} /><SelectField label="适用性" value={value.applicability} disabled={!editable} options={["REQUIRED", "OPTIONAL", "NOT_APPLICABLE"]} onChange={(applicability) => onChange({ ...value, applicability: applicability as LifecycleTemplateNodeDraft["applicability"] })} /><SelectField label="附件要求" value={value.attachmentRequirement} disabled={!editable} options={["NONE", "OPTIONAL", "REQUIRED"]} onChange={(attachmentRequirement) => onChange({ ...value, attachmentRequirement: attachmentRequirement as LifecycleTemplateNodeDraft["attachmentRequirement"] })} /><fieldset><legend className="field-label">直接前置</legend><div className="grid gap-1">{version.nodes.filter(({ id }) => id !== value.id).map((candidate) => <label key={candidate.id} className="flex gap-2"><input type="checkbox" disabled={!editable} checked={value.predecessorIds.includes(candidate.id)} onChange={(event) => onChange({ ...value, predecessorIds: event.target.checked ? [...value.predecessorIds, candidate.id] : value.predecessorIds.filter((id) => id !== candidate.id) })} />{candidate.task}</label>)}</div></fieldset></div>; }

function Field({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) { return <label><span className="field-label">{label}</span><input className="field-control" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>; }
function NumberField({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (value: number) => void }) { return <label><span className="field-label">{label}</span><input className="field-control" type="number" value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function SelectField({ label, value, disabled, options, labels, onChange }: { label: string; value: string; disabled: boolean; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) { return <label><span className="field-label">{label}</span><select className="field-control" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{labels?.[option] ?? option}</option>)}</select></label>; }

export function removeTemplateNode(version: LifecycleTemplateVersionRecord, nodeId: string): LifecycleTemplateVersionRecord {
  return {
    ...version,
    nodes: version.nodes
      .filter(({ id }) => id !== nodeId)
      .map((node) => ({ ...node, predecessorIds: node.predecessorIds.filter((id) => id !== nodeId) })),
  };
}

export function removeTemplateStage(version: LifecycleTemplateVersionRecord, stageId: string): LifecycleTemplateVersionRecord {
  const nodeIds = new Set(version.nodes.filter((node) => node.stageId === stageId).map(({ id }) => id));
  return removeTemplateNodes({ ...version, stages: version.stages.filter(({ id }) => id !== stageId) }, nodeIds);
}

export function removeTemplateWorkflow(version: LifecycleTemplateVersionRecord, workflowId: string): LifecycleTemplateVersionRecord {
  const nodeIds = new Set(version.nodes.filter((node) => node.workflowId === workflowId).map(({ id }) => id));
  return removeTemplateNodes({ ...version, workflows: version.workflows.filter(({ id }) => id !== workflowId) }, nodeIds);
}

function removeTemplateNodes(version: LifecycleTemplateVersionRecord, nodeIds: Set<string>): LifecycleTemplateVersionRecord {
  return {
    ...version,
    nodes: version.nodes
      .filter(({ id }) => !nodeIds.has(id))
      .map((node) => ({ ...node, predecessorIds: node.predecessorIds.filter((id) => !nodeIds.has(id)) })),
  };
}
