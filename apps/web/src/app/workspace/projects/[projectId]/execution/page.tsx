import { notFound } from "next/navigation";
import Link from "next/link";

import { configureProjectCollaborationTimeLimit } from "@/app/workspace/collaboration-actions";
import { decideProjectBasicInformationChange, submitProjectBasicInformationChange } from "@/app/workspace/project-basic-information-actions";
import { ExecutionShell } from "@/components/collaboration/execution-shell";
import { LifecycleSwimlane } from "@/components/collaboration/lifecycle-swimlane";
import { CollaborationTimeLimitTable } from "@/components/collaboration/time-limit-settings";
import { CreateIssueForm, IssuePanel } from "@/components/collaboration/issue-panel";
import { ProjectClosurePanel } from "@/components/collaboration/project-closure-panel";
import { ProjectBasicInformation } from "@/components/collaboration/project-basic-information";
import { WorkflowNodeDialog } from "@/components/collaboration/workflow-node-dialog";
import { normalizeWorkflowNodeTab, normalizeWorkflowReportType, type WorkflowReportType } from "@/components/collaboration/workflow-node-navigation";
import { WorkflowRecordsPanel } from "@/components/collaboration/workflow-records-panel";
import { WorkflowProgressPanel } from "@/components/collaboration/workflow-progress-panel";
import { WorkflowCompletionPanel } from "@/components/collaboration/workflow-completion-panel";
import { InfoTip } from "@/components/workspace/info-tip";
import { getCollaborationRuntime } from "@/server/collaboration-runtime";
import { requireCollaborationActor } from "@/server/collaboration-session";
import { getProjectSwimlaneRuntime } from "@/server/project-swimlane-runtime";
import { getProjectBasicInformationRuntime } from "@/server/project-basic-information-runtime";
import { getIssueRuntime, getProjectClosureRuntime, getWorkflowCompletionRuntime, getWorkflowProgressRuntime } from "@/server/progress-runtime";

export default async function ProjectExecutionPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ node?: string; tab?: string; reportType?: string; progress?: string; completion?: string; issue?: string; panel?: string; returnTo?: string; error?: string; saved?: string; progressError?: string; progressSaved?: string; completionError?: string; completionSaved?: string; issueError?: string; issueSaved?: string; closureError?: string; closureSaved?: string; basicInfoError?: string; basicInfoSaved?: string }>;
}) {
  const actor = await requireCollaborationActor();
  const { projectId } = await params;
  const overview = await getCollaborationRuntime().getOverview(actor, projectId);
  if (!overview) notFound();
  const query = await searchParams;
  const editableSwimlane = overview.canEditSwimlane ? await getProjectSwimlaneRuntime().getEditable(actor, projectId) : null;
  const timeLimits = await getCollaborationRuntime().listTimeLimits(actor, projectId);
  const progress = await getWorkflowProgressRuntime().list(actor, projectId);
  const recordedBudgetTotal = await getWorkflowProgressRuntime().getRecordedBudgetTotal(actor, projectId);
  const completionRequests = await getWorkflowCompletionRuntime().list(actor, projectId);
  const issues = await getIssueRuntime().list(actor, projectId);
  const issueTypes = await getIssueRuntime().listIssueTypes(actor, projectId);
  const issueContacts = actor.roleCode === "PMO" ? await getIssueRuntime().listContacts(actor, projectId) : [];
  const closureState = await getProjectClosureRuntime().getState(actor, projectId);
  const basicInformationWorkspace = await getProjectBasicInformationRuntime().getWorkspace(actor, projectId);
  const selected = overview.stages.flatMap((stage) => stage.workflows.map((node) => ({ stage, node }))).find(({ node }) => node.workflowStageId === query.node);
  const selectedTab = normalizeWorkflowNodeTab(actor.roleCode, query.tab);
  const selectedReportType = normalizeWorkflowReportType(query.reportType);
  const selectedProgress = selected ? progress.filter((item) => item.projectWorkflowStageId === selected.node.workflowStageId) : [];
  const selectedRequests = selected ? completionRequests.filter((item) => item.projectWorkflowStageId === selected.node.workflowStageId) : [];
  const selectedIssues = selected ? issues.filter((item) => item.projectWorkflowStageId === selected.node.workflowStageId) : [];
  const selectedNodeOption = selected ? [{
    workflowStageId: selected.node.workflowStageId,
    rowVersion: selected.node.rowVersion,
    label: `${selected.node.workflowName} · ${selected.node.taskName}`,
    executionStatus: selected.node.executionStatus,
    attachmentRequirement: selected.node.attachmentRequirement,
  }] : [];
  const selectedNodeWritable = Boolean(selected && overview.projectStatus === "ACTIVE" && selected.node.applicability !== "NOT_APPLICABLE" && selected.node.ownerRoles.includes("KEY_SUB_I"));
  const predecessorLabels = selected ? predecessorDisplayLabels(overview, selected.node.predecessorWorkflowStageIds) : [];
  const activeClosure = closureState.requests.find((request) => ["CLOSURE_BLOCKED", "CLOSURE_PENDING_PMO_REVIEW", "CLOSURE_RETURNED_FOR_SUPPLEMENT"].includes(request.status));
  const closureReadiness = actor.roleCode === "KEY_SUB_I" && closureState.isPrimaryKeySubI && closureState.projectStatus === "ACTIVE" && !activeClosure
    ? await getProjectClosureRuntime().checkInitialReadiness(actor, projectId)
    : null;
  const closureLabel = closureActionLabel(actor.roleCode, closureState);
  const closureGateLabels = Object.fromEntries([
    ...overview.stages.flatMap((stage) => stage.workflows.map((node) => [node.workflowStageId, `${stage.stageName} · ${node.workflowName} · ${node.taskName}`] as const)),
    ...issues.map((issue) => [issue.id, `${issue.issueNo} · ${issue.title}`] as const),
  ]);

  return (
    <ExecutionShell backHref={projectReturnHref(query.returnTo)} eyebrow={overview.projectCode} title={overview.projectName} status={projectStatusLabel(overview.projectStatus)} actions={<><a href={detailPanelHref(query.returnTo, "time-limits")} className="button-secondary">协作时限</a>{closureLabel ? <span className="inline-flex items-center gap-2"><a href={detailPanelHref(query.returnTo, "closure")} className="button-primary">{closureLabel}</a>{actor.roleCode === "KEY_SUB_I" && closureState.projectStatus === "ACTIVE" ? <InfoTip label="了解申请结题规则">申请结题始终可以进入准备检查；只有必需节点完成、没有未关闭问题且结题材料完整时才能正式提交。</InfoTip> : null}</span> : null}</>}>
      {query.error ? <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">时限配置未保存：{errorLabel(query.error)}</p> : null}
      {query.saved ? <p role="status" className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">协作时限配置已保存。</p> : null}
      {query.progressError ? <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">进展操作未完成：{progressErrorLabel(query.progressError)}</p> : null}
      {query.progressSaved ? <p role="status" className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{query.progressSaved === "correction" ? "进展纠错已追加。" : "项目进展已提交。"}</p> : null}
      {query.completionError ? <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">完成申请操作未完成：{completionErrorLabel(query.completionError)}</p> : null}
      {query.completionSaved ? <p role="status" className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">节点完成申请已更新。</p> : null}
      {query.issueError ? <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">问题操作未完成：{issueErrorLabel(query.issueError)}</p> : null}
      {query.issueSaved ? <p role="status" className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">问题记录已更新。</p> : null}
      {query.closureError ? <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">结题或归档操作未完成：{closureErrorLabel(query.closureError)}</p> : null}
      {query.closureSaved ? <p role="status" className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">结题或归档状态已更新。</p> : null}
      {query.basicInfoError ? <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">基础信息操作未完成：{basicInformationErrorLabel(query.basicInfoError)}</p> : null}
      {query.basicInfoSaved ? <p role="status" className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{query.basicInfoSaved === "submitted" ? "基础信息变更已提交。" : query.basicInfoSaved === "returned" ? "基础信息变更已退回并关闭。" : "基础信息变更已确认并生效。"}</p> : null}
      <ProjectBasicInformation overview={overview} recordedUsedAmount={recordedBudgetTotal} workspace={basicInformationWorkspace} editOpen={query.panel === "basic-information-edit"} submitAction={submitProjectBasicInformationChange} decideAction={decideProjectBasicInformationChange} />
      <div className="mt-6"><LifecycleSwimlane overview={overview} editable={editableSwimlane} returnTo={query.returnTo} /></div>
      {query.panel === "time-limits" ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><a href={detailCloseHref(query.returnTo)} className="absolute inset-0" aria-label="关闭协作时限" /><section role="dialog" aria-modal="true" aria-label="项目协作时限" className="relative z-10 max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">项目协作时限</h2><p className="mt-2 text-sm text-slate-600">项目配置覆盖全局默认；配置修改不追溯已开始的责任轮次。</p></div><a href={detailCloseHref(query.returnTo)} className="rounded-lg px-2 py-1 text-2xl text-slate-500">×</a></div>
        <CollaborationTimeLimitTable settings={timeLimits} projectId={projectId} configureAction={actor.roleCode === "PMO" ? configureProjectCollaborationTimeLimit : undefined} />
        {actor.roleCode === "PMO" ? <p className="mt-4 text-sm text-slate-600">只提交本项目差异；可恢复跟随全局默认。全局基线请前往 <a className="font-semibold text-teal-700" href="/workspace/pmo/collaboration-time-limits">全局协作时限</a>。</p> : <p className="mt-5 text-sm text-slate-500">当前角色只读，只有 PMO 可以维护项目配置。</p>}
      </section></div> : null}
      {query.panel === "closure" && closureLabel ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><a href={detailCloseHref(query.returnTo)} className="absolute inset-0" aria-label="关闭结题与归档" /><section role="dialog" aria-modal="true" aria-label="项目结题与归档" className="relative z-10 max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-4 flex justify-end"><a href={detailCloseHref(query.returnTo)} aria-label="关闭弹窗" className="rounded-lg px-2 py-1 text-2xl text-slate-500">×</a></div>{query.closureError ? <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">操作未完成：{closureErrorLabel(query.closureError)}</p> : null}{query.closureSaved ? <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">结题或归档状态已更新。</p> : null}<ProjectClosurePanel embedded actorRole={actor.roleCode} state={closureState} readiness={closureReadiness} gateLabels={closureGateLabels} /></section></div> : null}
      {selected ? <WorkflowNodeDialog actorRole={actor.roleCode} node={selected.node} predecessorLabels={predecessorLabels} tab={selectedTab} returnTo={query.returnTo} content={selectedTab === "report" && actor.roleCode === "KEY_SUB_I" ? <><ReportTypeNavigation projectWorkflowStageId={selected.node.workflowStageId} selected={selectedReportType} returnTo={query.returnTo} />{selectedReportType === "progress" ? <WorkflowProgressPanel embedded showRecords={false} actor={{ personId: actor.personId, roleCode: actor.roleCode }} projectId={projectId} nodes={selectedNodeOption.map((node) => ({ workflowStageId: node.workflowStageId, label: node.label, attachmentRequirement: node.attachmentRequirement }))} progress={selectedProgress} recordedBudgetTotal={recordedBudgetTotal} writable={selectedNodeWritable} /> : selectedReportType === "issue" ? (overview.projectStatus === "ACTIVE" || overview.projectStatus === "CLOSING" ? <CreateIssueForm projectId={projectId} nodes={[{ id: selected.node.workflowStageId, label: selected.node.taskName }]} issueTypes={issueTypes} returnNodeId={selected.node.workflowStageId} /> : <p className="text-sm text-slate-500">项目当前状态不允许创建问题。</p>) : <WorkflowCompletionPanel embedded actorRole={actor.roleCode} projectId={projectId} nodes={selectedNodeOption} requests={selectedRequests.filter((request) => !completionTerminal(request.status))} writable={selectedNodeWritable} />}</> : selectedTab === "progress" ? <WorkflowRecordsPanel actor={{ personId: actor.personId, roleCode: actor.roleCode }} projectId={projectId} nodeLabel={selected.node.taskName} progress={selectedProgress} completionRequests={selectedRequests} writable={selectedNodeWritable} returnTo={query.returnTo} /> : <IssuePanel embedded actor={{ personId: actor.personId, roleCode: actor.roleCode }} issues={selectedIssues} contacts={issueContacts} writable={overview.projectStatus === "ACTIVE" || overview.projectStatus === "CLOSING"} focusedIssueId={query.issue} />} /> : null}
    </ExecutionShell>
  );
}

function projectStatusLabel(value: string) { return value === "ACTIVE" ? "执行中" : value === "CLOSING" ? "结题中" : value === "COMPLETED" ? "已完成" : "已归档 · 只读"; }
function projectReturnHref(value?: string) { return value === "/workspace/projects" || value?.startsWith("/workspace/projects?") ? value : "/workspace/projects"; }
function ReportTypeNavigation({ projectWorkflowStageId, selected, returnTo }: { projectWorkflowStageId: string; selected: WorkflowReportType; returnTo?: string }) { const options: Array<[WorkflowReportType, string]> = [["progress", "正常填报"], ["issue", "问题"], ["completion", "完成申请"]]; return <nav aria-label="填报类型" className="mb-5 grid gap-2 sm:grid-cols-3">{options.map(([value, label]) => { const params = new URLSearchParams({ node: projectWorkflowStageId, tab: "report", reportType: value }); if (returnTo) params.set("returnTo", returnTo); return <Link key={value} href={`?${params}`} scroll={false} aria-current={selected === value ? "page" : undefined} className={`rounded-lg border px-4 py-3 text-center text-sm font-semibold ${selected === value ? "border-teal-700 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600 hover:border-teal-300"}`}>{label}</Link>; })}</nav>; }
function completionTerminal(value: string) { return value === "APPROVED" || value === "WITHDRAWN" || value === "TERMINATED_BY_PLAN_CHANGE"; }
function predecessorDisplayLabels(overview: Awaited<ReturnType<ReturnType<typeof getCollaborationRuntime>["getOverview"]>>, predecessorIds: string[]) { if (!overview) return []; const nodes = overview.stages.flatMap((stage) => stage.workflows); const counts = new Map<string, number>(); for (const node of nodes) counts.set(node.taskName, (counts.get(node.taskName) ?? 0) + 1); const byId = new Map(nodes.map((node) => [node.workflowStageId, node])); return predecessorIds.map((id) => byId.get(id)).filter((node): node is NonNullable<typeof node> => Boolean(node)).map((node) => (counts.get(node.taskName) ?? 0) > 1 ? `${node.workflowName} · ${node.taskName}` : node.taskName); }
function closureActionLabel(role: "PMO" | "DEAN" | "KEY_SUB_I", state: Awaited<ReturnType<ReturnType<typeof getProjectClosureRuntime>["getState"]>>) { const current = state.requests.find((request) => ["CLOSURE_BLOCKED", "CLOSURE_PENDING_PMO_REVIEW", "CLOSURE_RETURNED_FOR_SUPPLEMENT"].includes(request.status)); if (role === "KEY_SUB_I" && state.isPrimaryKeySubI && state.projectStatus === "ACTIVE" && !current) return "申请结题"; if (role === "KEY_SUB_I" && state.isPrimaryKeySubI && current?.status === "CLOSURE_RETURNED_FOR_SUPPLEMENT") return "补充结题材料"; if (role === "KEY_SUB_I" && state.isPrimaryKeySubI && current) return "查看结题申请"; if (role === "PMO" && current?.status === "CLOSURE_PENDING_PMO_REVIEW") return "结题审核"; if (role === "PMO" && current) return "查看结题申请"; if (role === "PMO" && state.projectStatus === "CLOSING") return "查看结题状态"; if (role === "PMO" && state.projectStatus === "COMPLETED") return "归档项目"; if (role === "PMO" && state.projectStatus === "ARCHIVED") return "取消归档"; return null; }
function detailPanelHref(returnTo: string | undefined, panel: "time-limits" | "closure") { const params = new URLSearchParams({ panel }); if (returnTo) params.set("returnTo", returnTo); return `?${params}`; }
function detailCloseHref(returnTo: string | undefined) { return returnTo ? `?${new URLSearchParams({ returnTo })}` : "?"; }
function errorLabel(value: string) { return value === "COLLABORATION_FORBIDDEN" ? "当前账号或角色无权配置。" : value === "PROJECT_NOT_FOUND" ? "项目不存在或不在访问范围内。" : "请输入正整数时限和提醒周期。"; }
function progressErrorLabel(value: string) { return value === "PROGRESS_CORRECTION_CONFLICT" ? "记录已被他人修订，请刷新后重试。" : value === "PROGRESS_CORRECTION_FORBIDDEN" ? "仅原填报人或当前主 Key Sub-I 可以纠错。" : value === "PROJECT_NOT_ACTIVE" ? "项目当前状态不允许修改进展。" : "请核对纠错原因和修订内容。"; }
function completionErrorLabel(value: string) { const labels: Record<string, string> = { WORKFLOW_COMPLETION_CONFLICT: "记录已变化，请刷新后重试。", WORKFLOW_COMPLETION_PREDECESSOR_BLOCKED: "直接前置节点尚未全部正式完成。", WORKFLOW_COMPLETION_ISSUE_BLOCKED: "节点仍有未关闭问题。", WORKFLOW_COMPLETION_ATTACHMENT_REQUIRED: "该节点必须提供至少一份可用完成附件。", COLLABORATION_FORBIDDEN: "当前账号或角色无权执行此操作。" }; return labels[value] ?? "请核对申请状态与填写内容。"; }
function issueErrorLabel(value: string) { const labels: Record<string, string> = { ISSUE_CONFLICT: "问题已被他人更新，请刷新后重试。", ISSUE_INVALID_TRANSITION: "当前状态不允许此操作。", ISSUE_REPORTER_FORBIDDEN: "仅原提报人可以执行确认或补充。", ISSUE_NOTIFICATION_RECIPIENT_REQUIRED: "项目没有有效 Key Sub-I，无法创建并逐人通知问题。", ISSUE_INVALID_INPUT: "请核对必填内容和关联记录。", COLLABORATION_FORBIDDEN: "当前账号或角色无权执行此操作。", PROJECT_NOT_ACTIVE: "项目当前状态不允许修改问题。" }; return labels[value] ?? "请核对问题状态与填写内容。"; }
function closureErrorLabel(value: string) { const labels: Record<string, string> = { PROJECT_CLOSURE_BLOCKED: "结题硬门禁未通过，请核对必需节点、开放问题和治理材料。", PROJECT_CLOSURE_CONFLICT: "结题或项目状态已变化，请刷新后重试。", PROJECT_CLOSURE_INVALID_INPUT: "请完整填写固定治理材料或公开原因。", COLLABORATION_FORBIDDEN: "当前账号或角色无权执行此操作。" }; return labels[value] ?? "请核对项目与结题状态。"; }
function basicInformationErrorLabel(value: string) { const labels: Record<string, string> = { PROJECT_BASIC_INFORMATION_FORBIDDEN: "当前角色、项目授权或处理责任不允许此操作。", PROJECT_NOT_ACTIVE: "只有执行中的项目可以修改基础信息。", PROJECT_BASIC_INFORMATION_INVALID_INPUT: "请核对必填字段、字典选项、金额和变更原因。", PROJECT_BASIC_INFORMATION_PATIENT_DATA_PROHIBITED: "基础信息只能填写项目级内容。", PROJECT_BASIC_INFORMATION_NO_CHANGES: "没有检测到实际变化。", PROJECT_BASIC_INFORMATION_CONFLICT: "项目正式值、状态或主负责人已经变化，请刷新后重新提交。", PROJECT_BASIC_INFORMATION_OPERATION_FAILED: "系统暂时无法保存基础信息变更，请稍后重试或联系管理员查看错误记录。" }; return labels[value] ?? "请核对基础信息变更内容。"; }
