import type { CollaborationRoleCode, ProjectExecutionOverview } from "@researchflow/collaboration";
import Link from "next/link";
import type { ReactNode } from "react";

import type { WorkflowNodeTab } from "@/components/collaboration/workflow-node-navigation";
import { RouteDialogBehavior } from "@/components/collaboration/route-dialog-behavior";
import { UnsavedReportGuard } from "@/components/collaboration/unsaved-report-guard";

type Stage = ProjectExecutionOverview["stages"][number];
type Node = Stage["workflows"][number];

export function WorkflowNodeDialog({ actorRole, node, predecessorLabels, tab, content, returnTo }: { actorRole: CollaborationRoleCode; node: Node; predecessorLabels: string[]; tab: WorkflowNodeTab; content?: ReactNode; returnTo?: string }) {
  const tabs: Array<[WorkflowNodeTab, string]> = actorRole === "KEY_SUB_I"
    ? [["report", "填报"], ["progress", "进展记录"], ["issues", "问题记录"]]
    : [["progress", "进展记录"], ["issues", "问题记录"]];
  const closeParams = new URLSearchParams();
  if (returnTo) closeParams.set("returnTo", returnTo);
  const closeHref = closeParams.size ? `?${closeParams}` : "?";
  const base = new URLSearchParams({ node: node.workflowStageId });
  if (returnTo) base.set("returnTo", returnTo);
  return <UnsavedReportGuard enabled={actorRole === "KEY_SUB_I" && tab === "report"}><div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
    <RouteDialogBehavior focusTargetHrefPart={`node=${node.workflowStageId}`} />
    <Link href={closeHref} scroll={false} aria-label="关闭节点详情" className="absolute inset-0" data-route-dialog-close />
    <section role="dialog" aria-modal="true" aria-labelledby="node-dialog-title" className="relative z-10 max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5"><div className="min-w-0"><div className="flex flex-wrap items-baseline gap-x-4 gap-y-2"><h2 id="node-dialog-title" className="text-xl font-semibold">{node.taskName}</h2><dl className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600"><Meta term="适用性" value={applicabilityLabel(node.applicability)} /><Meta term="附件要求" value={attachmentLabel(node.attachmentRequirement)} /><Meta term="直接前置" value={predecessorLabels.join("、") || "无"} /><Meta term="责任角色" value={node.ownerRoles.map(roleLabel).join("、") || "未配置"} /></dl></div>{node.taskDescription ? <p className="mt-2 text-sm text-slate-600">{node.taskDescription}</p> : null}</div><Link href={closeHref} scroll={false} aria-label="关闭弹窗" className="rounded-lg px-2 py-1 text-2xl text-slate-500 hover:bg-slate-100">×</Link></header>
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 px-5" aria-label="节点详情页签">{tabs.map(([value, label]) => { const params = new URLSearchParams(base); params.set("tab", value); return <Link key={value} href={`?${params}`} scroll={false} aria-current={tab === value ? "page" : undefined} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold ${tab === value ? "border-teal-700 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{label}</Link>; })}</nav>
      <div className="p-5">{content}</div>
      <footer className="flex justify-end border-t border-slate-200 px-5 py-4"><Link href={closeHref} scroll={false} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">关闭</Link></footer>
    </section>
  </div></UnsavedReportGuard>;
}
function Meta({ term, value }: { term: string; value: string }) { return <div className="inline-flex gap-1"><dt className="font-semibold text-slate-500">{term}</dt><dd>{value}</dd></div>; }
function applicabilityLabel(value: Node["applicability"]) { return value === "REQUIRED" ? "必需" : value === "OPTIONAL" ? "可选" : "不适用"; }
function attachmentLabel(value: Node["attachmentRequirement"]) { return value === "REQUIRED" ? "必需" : value === "OPTIONAL" ? "可选" : "不要求"; }
function roleLabel(value: CollaborationRoleCode) { return value === "KEY_SUB_I" ? "Key Sub-I" : value === "DEAN" ? "院长" : "PMO"; }
