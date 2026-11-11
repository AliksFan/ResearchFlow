import { redirect } from "next/navigation";

import { ExecutionShell } from "@/components/collaboration/execution-shell";
import { DictionaryManagement } from "@/components/collaboration/dictionary-management";
import {
  MANAGEMENT_DICTIONARIES,
  managementDictionaryCode,
} from "@/components/collaboration/dictionary-management-config";
import { getDictionaryRuntime } from "@/server/progress-runtime";
import { requireCollaborationActor } from "@/server/collaboration-session";

export default async function DictionaryPage({ searchParams }: { searchParams: Promise<{ dictionary?: string; error?: string; saved?: string }> }) {
  const actor = await requireCollaborationActor();
  if (actor.roleCode !== "PMO") redirect("/forbidden");
  const query = await searchParams;
  const code = managementDictionaryCode(query.dictionary);
  const workspace = await getDictionaryRuntime().listWorkspace(actor, code);
  return <ExecutionShell eyebrow="PMO 工作区" title="字典管理" backHref={null}>
    <p className="mt-6 text-sm text-slate-600">正式选项由 PMO 统一维护；编码创建后不可修改，停用选项继续用于历史展示。</p>
    {query.error ? <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{dictionaryErrorMessage(query.error)}</p> : null}
    {query.saved ? <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{query.saved === "deleted" ? "选项已删除并记录审计。" : "修改已保存并重新读取服务端状态。"}</p> : null}
    <nav className="mt-6 flex flex-wrap gap-2">{MANAGEMENT_DICTIONARIES.map((item) => <a key={item.code} href={`/workspace/pmo/dictionaries?dictionary=${item.code}`} className={item.code === code ? "button-primary" : "button-secondary"}>{item.label}</a>)}</nav>
    <div className="mt-6"><DictionaryManagement workspace={workspace} /></div>
  </ExecutionShell>;
}

function dictionaryErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    COLLABORATION_FORBIDDEN: "当前角色无权维护字典。",
    DICTIONARY_OPTION_IN_USE: "该选项已有业务引用，请停用后保留历史。",
    DICTIONARY_OPTION_RESERVED: "系统保留的“其它”不能删除或修改。",
    DICTIONARY_CONFLICT: "字典已被其他操作更新，请刷新后重试。",
    DICTIONARY_INVALID_INPUT: "请核对选项名称、顺序和状态。",
  };
  return messages[code] ?? "字典操作未完成，请刷新后重试。";
}
