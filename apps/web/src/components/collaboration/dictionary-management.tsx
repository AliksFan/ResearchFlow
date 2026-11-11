"use client";

import { useState } from "react";

import type { DictionaryWorkspace } from "@researchflow/collaboration";

import {
  createDictionaryOption,
  deleteDictionaryOption,
  reviewDictionarySuggestion,
  saveDictionaryOptions,
} from "@/app/workspace/dictionary-actions";

export function DictionaryManagement({ workspace }: { workspace: DictionaryWorkspace }) {
  const saveFormId = `save-dictionary-options-${workspace.dictionaryCode}`;
  const initial = Object.fromEntries(workspace.options.map((option) => [option.id, option]));
  const [rows, setRows] = useState(initial);
  const dirtyIds = workspace.options
    .filter((option) => {
      const row = rows[option.id] ?? option;
      return row.displayName !== option.displayName || row.sortOrder !== option.sortOrder || row.enabled !== option.enabled;
    })
    .map(({ id }) => id);
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <form id={saveFormId} action={saveDictionaryOptions}>
          <input type="hidden" name="dictionaryCode" value={workspace.dictionaryCode} />
          {dirtyIds.map((id) => <input key={id} type="hidden" name="changeId" value={id} />)}
        </form>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead><tr className="border-b border-slate-200"><th className="p-2">稳定编码</th><th className="p-2">显示名称</th><th className="p-2">顺序</th><th className="p-2">启用</th><th className="p-2">操作</th></tr></thead>
            <tbody>{workspace.options.map((option) => {
              const row = rows[option.id] ?? option;
              return <tr key={option.id} className="border-b border-slate-100">
                <td className="p-2 font-mono text-xs">{option.optionCode}{option.systemReserved ? <span className="ml-2 rounded bg-slate-100 px-2 py-1 font-sans">系统保留</span> : null}</td>
                <td className="p-2"><input form={saveFormId} className="field-control min-w-52" name={`displayName:${option.id}`} value={row.displayName} disabled={option.systemReserved} onChange={(event) => setRows({ ...rows, [option.id]: { ...row, displayName: event.target.value } })} /><input form={saveFormId} type="hidden" name={`expectedUpdatedAt:${option.id}`} value={option.expectedUpdatedAt} /></td>
                <td className="p-2"><input form={saveFormId} className="field-control w-24" type="number" max={9998} name={`sortOrder:${option.id}`} value={row.sortOrder} disabled={option.systemReserved} onChange={(event) => setRows({ ...rows, [option.id]: { ...row, sortOrder: Number(event.target.value) } })} /></td>
                <td className="p-2"><label className="flex items-center gap-2"><input form={saveFormId} type="checkbox" name={`enabled:${option.id}`} value="1" checked={row.enabled} disabled={option.systemReserved} onChange={(event) => setRows({ ...rows, [option.id]: { ...row, enabled: event.target.checked } })} />{row.enabled ? "是" : "否"}</label></td>
                <td className="p-2">{option.systemReserved
                  ? <span className="text-xs text-slate-500">系统保留，不可删除</span>
                  : option.referenceCount > 0
                    ? <span className="text-xs text-slate-500">已引用，仅可停用</span>
                    : <form action={deleteDictionaryOption}>
                        <input type="hidden" name="dictionaryCode" value={workspace.dictionaryCode} />
                        <input type="hidden" name="optionId" value={option.id} />
                        <input type="hidden" name="expectedUpdatedAt" value={option.expectedUpdatedAt} />
                        <button
                          className="text-sm font-semibold text-red-700"
                          type="submit"
                          aria-label={`删除${option.displayName}`}
                          onClick={(event) => {
                            if (!window.confirm(`确定永久删除“${option.displayName}”吗？删除后无法恢复。`)) event.preventDefault();
                          }}
                        >删除</button>
                      </form>}
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <button form={saveFormId} className="button-primary mt-4" disabled={dirtyIds.length === 0}>保存修改</button>
      </section>

      <form action={createDictionaryOption} className="rounded-xl border border-slate-200 bg-white p-5">
        <input type="hidden" name="dictionaryCode" value={workspace.dictionaryCode} />
        <h2 className="font-semibold">新增正式选项</h2>
        <div className="mt-3 flex flex-wrap gap-3"><input className="field-control max-w-md" name="displayName" maxLength={100} required placeholder="显示名称" /><button className="button-secondary">新增选项</button></div>
      </form>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">待审候选</h2>
        <p className="mt-1 text-sm text-slate-600">候选来自首次不可变业务提交；审核不会改写历史记录中的“其它”原始文本。</p>
        <div className="mt-4 space-y-4">{workspace.suggestions.length ? workspace.suggestions.map((suggestion) => (
          <article key={suggestion.id} className="rounded-lg border border-slate-200 p-4">
            <div className="flex flex-wrap justify-between gap-2"><strong>{suggestion.proposedDisplayName}</strong><span className="text-xs text-slate-500">使用 {suggestion.usageCount} 次 · {suggestion.firstSubmittedAt.slice(0, 10)} 至 {suggestion.lastSubmittedAt.slice(0, 10)}</span></div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <form action={reviewDictionarySuggestion} className="space-y-2"><SuggestionIdentity workspace={workspace} suggestion={suggestion} decision="PROMOTE" /><input className="field-control" name="displayName" defaultValue={suggestion.proposedDisplayName} required /><button className="button-secondary w-full">提升为正式选项</button></form>
              <form action={reviewDictionarySuggestion} className="space-y-2"><SuggestionIdentity workspace={workspace} suggestion={suggestion} decision="MERGE" /><select className="field-control" name="targetOptionId" required><option value="">选择已有选项</option>{workspace.options.filter(({ enabled, systemReserved }) => enabled && !systemReserved).map((option) => <option key={option.id} value={option.id}>{option.displayName}</option>)}</select><button className="button-secondary w-full">合并到已有选项</button></form>
              <form action={reviewDictionarySuggestion} className="space-y-2"><SuggestionIdentity workspace={workspace} suggestion={suggestion} decision="REJECT" /><input className="field-control" name="comment" required placeholder="内部驳回说明" /><button className="w-full text-sm font-semibold text-red-700">驳回候选</button></form>
            </div>
          </article>
        )) : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">当前没有待审候选。</p>}</div>
      </section>
    </div>
  );
}

function SuggestionIdentity({ workspace, suggestion, decision }: { workspace: DictionaryWorkspace; suggestion: DictionaryWorkspace["suggestions"][number]; decision: "PROMOTE" | "MERGE" | "REJECT" }) {
  return <><input type="hidden" name="dictionaryCode" value={workspace.dictionaryCode} /><input type="hidden" name="suggestionId" value={suggestion.id} /><input type="hidden" name="expectedRowVersion" value={suggestion.rowVersion} /><input type="hidden" name="decision" value={decision} /></>;
}
