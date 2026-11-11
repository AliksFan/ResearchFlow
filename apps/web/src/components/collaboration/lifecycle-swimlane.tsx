import type { EditableProjectSwimlane, ProjectExecutionOverview } from "@researchflow/collaboration";
import Link from "next/link";

import { ProjectSwimlaneEditor } from "@/components/collaboration/project-swimlane-editor";

type Stage = ProjectExecutionOverview["stages"][number];
type Node = Stage["workflows"][number];

export function LifecycleSwimlane({ overview, editable, returnTo }: { overview: ProjectExecutionOverview; editable?: EditableProjectSwimlane | null; returnTo?: string }) {
  const workstreams = uniqueWorkstreams(overview.stages);
  const columns = `minmax(10rem, 1.15fr) repeat(${overview.stages.length}, minmax(9rem, 1fr))`;
  return <section className="rounded-xl border border-slate-200 bg-white">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
      <div><h2 className="font-semibold">项目生命周期泳道</h2><p className="mt-1 text-sm text-slate-600">阶段为列、工作流为行；点击节点进行填报或查看进展与问题。</p></div>
      <div className="flex items-center gap-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{overview.swimlaneName}</span>{editable?.canEdit ? <ProjectSwimlaneEditor initial={editable} /> : null}</div>
    </header>
    <div className="overflow-x-auto">
      <div className="min-w-[1040px]" style={{ display: "grid", gridTemplateColumns: columns }}>
        <div className="sticky left-0 z-20 grid min-h-16 place-items-center border-b border-r border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-700">工作流</div>
        {overview.stages.map((stage) => <div key={stage.stageId} className="grid min-h-16 place-items-center border-b border-r border-slate-200 bg-slate-100 px-3 text-center"><div><p className="font-semibold text-slate-800">{stage.stageName}</p><p className="mt-1 text-xs text-slate-500">{stage.plannedStartDate ?? "未设置"} — {stage.plannedEndDate ?? "未设置"}</p></div></div>)}
        {workstreams.map((workstream, rowIndex) => <SwimlaneRow key={workstream.code} stages={overview.stages} workstream={workstream} rowIndex={rowIndex} returnTo={returnTo} />)}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 px-5 py-4 text-xs text-slate-600">
      <Legend tone="bg-emerald-600" label="已完成" /><Legend tone="bg-sky-600" label="进行中" /><Legend tone="bg-violet-600" label="待完成确认" /><Legend tone="bg-amber-400 border border-amber-600" label="存在风险" /><Legend tone="bg-red-600" label="严重阻塞" /><Legend tone="bg-slate-200 border border-slate-300" label="未开始" />
      <span className="ml-auto">数字表示当前未关闭问题数量；色块同时显示文字状态。</span>
    </div>
  </section>;
}

function SwimlaneRow({ stages, workstream, rowIndex, returnTo }: { stages: Stage[]; workstream: { code: string; name: string }; rowIndex: number; returnTo?: string }) {
  return <>
    <div className={`sticky left-0 z-10 flex min-h-20 items-center border-b border-r border-slate-200 px-4 text-sm font-semibold text-slate-700 ${rowIndex % 2 ? "bg-slate-50" : "bg-white"}`}>{workstream.name}</div>
    {stages.map((stage) => {
      const nodes = stage.workflows.filter((node) => node.workflowCode === workstream.code);
      return <div key={stage.stageId} className={`flex min-h-20 flex-col justify-center gap-2 border-b border-r border-slate-200 p-2 ${rowIndex % 2 ? "bg-slate-50/70" : "bg-white"}`}>{nodes.length ? nodes.map((node) => <NodeLink key={node.workflowStageId} node={node} returnTo={returnTo} />) : <span className="text-center text-xs text-slate-300">—</span>}</div>;
    })}
  </>;
}

function NodeLink({ node, returnTo }: { node: Node; returnTo?: string }) {
  const visual = nodeVisual(node);
  const params = new URLSearchParams({ node: node.workflowStageId });
  if (returnTo) params.set("returnTo", returnTo);
  return <Link href={`?${params}`} scroll={false} className={`relative rounded-lg px-3 py-2 text-left text-xs font-semibold shadow-sm transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-teal-800 focus:ring-offset-1 ${visual.className}`} aria-label={`${node.taskName}，${visual.label}${node.openIssueCount ? `，${node.openIssueCount} 个未关闭问题` : ""}`}>
    <span className="block truncate">{node.taskName}</span><span className="mt-1 block text-[11px] font-medium opacity-90">{visual.label}</span>
    {node.openIssueCount ? <span className="absolute right-1.5 top-1.5 grid min-w-5 place-items-center rounded-full border border-white/70 bg-slate-900/70 px-1 text-[10px] text-white">{node.openIssueCount}</span> : null}
  </Link>;
}

function nodeVisual(node: Node): { label: string; className: string } {
  if (node.issueRiskLevel === "BLOCKED") return { label: "严重阻塞", className: "bg-red-600 text-white" };
  if (node.issueRiskLevel === "RISK") return { label: "存在风险", className: "border border-amber-600 bg-amber-300 text-amber-950" };
  if (node.executionStatus === "COMPLETED") return { label: "已完成", className: "bg-emerald-600 text-white" };
  if (node.executionStatus === "PENDING_COMPLETION_CONFIRMATION") return { label: "待完成确认", className: "bg-violet-600 text-white" };
  if (node.executionStatus === "ACTIVE") return { label: "进行中", className: "bg-sky-600 text-white" };
  return { label: node.applicability === "NOT_APPLICABLE" ? "不适用" : "未开始", className: "border border-slate-300 bg-slate-200 text-slate-600" };
}

function uniqueWorkstreams(stages: Stage[]): Array<{ code: string; name: string }> {
  const result = new Map<string, string>();
  for (const node of stages.flatMap((stage) => stage.workflows)) if (!result.has(node.workflowCode)) result.set(node.workflowCode, node.workflowName);
  return [...result].map(([code, name]) => ({ code, name }));
}

function Legend({ tone, label }: { tone: string; label: string }) { return <span className="inline-flex items-center gap-1.5"><i className={`size-3 rounded-sm ${tone}`} />{label}</span>; }
