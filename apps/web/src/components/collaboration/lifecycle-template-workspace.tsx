"use client";

import type { LifecycleTemplateVersionRecord } from "@researchflow/collaboration";
import { useState } from "react";

import { LifecycleTemplateMatrix } from "@/components/collaboration/lifecycle-template-matrix";

export function LifecycleTemplateWorkspace({ versions, preferredVersionId, saveAction, publishAction, deleteAction, createDraftAction, createSolutionAction }: {
  versions: LifecycleTemplateVersionRecord[];
  preferredVersionId?: string | null;
  saveAction: (formData: FormData) => Promise<void>;
  publishAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  createDraftAction: (formData: FormData) => Promise<void>;
  createSolutionAction: (formData: FormData) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(selectInitialVersionId(versions, preferredVersionId));
  const [dirty, setDirty] = useState(false);
  const selected = versions.find(({ id }) => id === selectedId) ?? versions[0];

  return <>
    <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><label className="w-full max-w-xl"><span className="field-label">工作流方案</span><select className="field-control" value={selected?.id ?? ""} onChange={(event) => { if (dirty && !window.confirm("当前方案存在未保存修改，确定切换并放弃这些修改吗？")) return; setDirty(false); setSelectedId(event.target.value); }}><option value="" disabled>请选择方案</option>{versions.map((version) => <option key={version.id} value={version.id}>{version.templateName} · {statusLabel(version.displayStatus)}</option>)}</select></label><NewSolution action={createSolutionAction} /></div><p className="mt-4 text-sm text-slate-600">共 <span className="font-semibold text-slate-900">{versions.length}</span> 个方案；内部审计快照不会在日常页面显示为版本。</p></section>
    {selected ? <div className="mt-5"><LifecycleTemplateMatrix key={selected.id} initialVersion={selected} saveAction={saveAction} publishAction={publishAction} deleteAction={deleteAction} createDraftAction={createDraftAction} onDirtyChange={setDirty} /></div> : <p className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">当前没有工作流方案，请先新建方案。</p>}
  </>;
}

function NewSolution({ action }: { action: (formData: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="button-primary" onClick={() => setOpen(true)}>新建工作流方案</button>{open ? <div role="dialog" aria-modal="true" aria-labelledby="new-workflow-solution-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form action={action} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"><h2 id="new-workflow-solution-title" className="text-lg font-semibold">新建工作流方案</h2><p className="mt-2 text-sm text-slate-600">名称由 PMO 自行填写；内部编码由服务端生成。</p><label className="mt-5 block"><span className="field-label">方案名称</span><input name="templateName" className="field-control" required autoFocus /></label><div className="mt-6 flex justify-end gap-2"><button type="button" className="button-secondary" onClick={() => setOpen(false)}>取消</button><button className="button-primary">创建方案</button></div></form></div> : null}</>;
}

function statusLabel(status: LifecycleTemplateVersionRecord["displayStatus"]): string {
  return status === "UNPUBLISHED" ? "未发布" : status === "EDITING" ? "编辑中" : status === "PUBLISHED" ? "已发布" : "停用";
}

export function selectInitialVersionId(versions: LifecycleTemplateVersionRecord[], preferredVersionId?: string | null): string {
  if (preferredVersionId && versions.some(({ id }) => id === preferredVersionId)) return preferredVersionId;
  return versions.find(({ status }) => status === "DRAFT")?.id ?? versions[0]?.id ?? "";
}
