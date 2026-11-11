import {
  CollaborationError,
  type CollaborationActor,
  type DeanDashboardActionSummary,
  type DeanDashboardProjectItem,
  type DeanDashboardQuery,
  type DeanDashboardRepository,
  type DeanProjectDashboardResult,
} from "@researchflow/collaboration";

import type { Prisma } from "../generated/client.js";
import type { ApplicationPrismaClient } from "./client.js";
import { dashboardProjectSelect, type DashboardProjectRow } from "./pmo-dashboard-repositories.js";

const visibleStatuses = ["ACTIVE", "CLOSING", "COMPLETED", "ARCHIVED"] as const;

export class PrismaDeanDashboardRepository implements DeanDashboardRepository {
  constructor(private readonly client: ApplicationPrismaClient) {}

  queryProjects(actor: CollaborationActor, query: DeanDashboardQuery): Promise<DeanProjectDashboardResult> {
    return this.client.$transaction(async (transaction) => {
      await requireActiveDean(transaction, actor);
      const rows = await transaction.project.findMany({
        where: { status: { in: [...visibleStatuses] }, projectCode: { not: null } },
        select: dashboardProjectSelect,
      });
      return buildDeanDashboardResult(rows, actor.personId, query, new Date());
    }, { isolationLevel: "RepeatableRead" });
  }
}

export function buildDeanDashboardResult(
  rows: readonly DashboardProjectRow[],
  actorPersonId: string,
  query: DeanDashboardQuery,
  snapshotAt: Date,
): DeanProjectDashboardResult {
  const allItems = rows
    .filter((row) => Boolean(row.projectCode) && visibleStatuses.includes(row.status as (typeof visibleStatuses)[number]))
    .map((row) => mapProject(row, actorPersonId, snapshotAt));
  const counts = {
    allProjects: allItems.length,
    decisionProjects: allItems.filter((item) => hasCategory(item, "DEAN_DECISION")).length,
    implementationProjects: allItems.filter((item) => hasCategory(item, "PMO_IMPLEMENTATION")).length,
    confirmationProjects: allItems.filter((item) => hasCategory(item, "DEAN_IMPLEMENTATION_CONFIRMATION")).length,
    reporterFeedbackProjects: allItems.filter((item) => hasCategory(item, "REPORTER_FEEDBACK")).length,
  };
  const search = normalizeSearch(query.q);
  const filtered = allItems.filter((item) => {
    if (!matchesFocus(item, query.focus)) return false;
    if (query.hideFinished && (item.projectStatus === "COMPLETED" || item.projectStatus === "ARCHIVED")) return false;
    return !search || normalizeSearch([item.projectCode, item.applicationCode, item.projectName, item.primaryKeySubIDisplayName ?? "", ...item.otherKeySubIDisplayNames].join(" ")).includes(search);
  });
  filtered.sort(comparator(query));
  const totalPages = Math.max(1, Math.ceil(filtered.length / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const start = (page - 1) * query.pageSize;
  return { snapshotAt: snapshotAt.toISOString(), counts, filteredTotal: filtered.length, page, pageSize: 50, items: filtered.slice(start, start + query.pageSize) };
}

function mapProject(row: DashboardProjectRow, actorPersonId: string, now: Date): DeanDashboardProjectItem {
  const activeVersion = row.projectPlan?.versions[0];
  const workflowsByStage = new Map<string, NonNullable<typeof activeVersion>["workflowStageVersions"]>();
  for (const workflow of activeVersion?.workflowStageVersions ?? []) {
    const stageId = workflow.projectWorkflowStage.projectStageId;
    const current = workflowsByStage.get(stageId) ?? [];
    current.push(workflow);
    workflowsByStage.set(stageId, current);
  }
  const applicableStages = (activeVersion?.stageVersions ?? []).flatMap((stage) => {
    if (stage.applicability === "NOT_APPLICABLE") return [];
    const workflows = (workflowsByStage.get(stage.projectStageId) ?? []).filter(({ applicability }) => applicability !== "NOT_APPLICABLE");
    return workflows.length ? [{ ...stage, workflows }] : [];
  });
  const completedStageCount = applicableStages.filter(({ workflows }) => workflows.every(({ projectWorkflowStage }) => projectWorkflowStage.executionStatus === "COMPLETED")).length;
  const currentStage = applicableStages.find(({ workflows }) => workflows.some(({ projectWorkflowStage }) => projectWorkflowStage.executionStatus !== "COMPLETED"));
  let highestIssueRisk: "NONE" | "RISK" | "BLOCKED" = "NONE";
  for (const issue of row.issues) {
    if (issue.currentRiskLevel === "BLOCKED") highestIssueRisk = "BLOCKED";
    else if (issue.currentRiskLevel === "RISK" && highestIssueRisk === "NONE") highestIssueRisk = "RISK";
  }
  const actions = new Map<DeanDashboardActionSummary["category"], MutableAction>();
  for (const issue of row.issues) {
    const state = issue.handlingStates[0];
    const round = issue.decisionRounds[0];
    if (!state || !round) continue;
    const target = { kind: "ISSUE" as const, workflowStageId: issue.projectWorkflowStageId, issueId: issue.id };
    if (state.stateCode === "DEAN_DECISION" && round.status === "PENDING_DEAN_DECISION") {
      addAction(actions, "DEAN_DECISION", issue.id, target, state.enteredAt, state.dueAt, now, true);
    }
    if (state.stateCode === "PMO_IMPLEMENTATION" && round.status === "PENDING_PMO_IMPLEMENTATION" && round.deanDecision) {
      addAction(actions, "PMO_IMPLEMENTATION", issue.id, target, state.enteredAt, state.dueAt, now, false);
    }
    if (state.stateCode === "DEAN_IMPLEMENTATION_CONFIRMATION" && round.status === "PENDING_DEAN_REVIEW" && round.deanDecision?.implementationReviewRequired) {
      const responsibleDeanId = round.reviewTransfers[0]?.acceptedByDeanPersonId ?? round.deanDecision.decidedByPersonId;
      if (responsibleDeanId === actorPersonId) addAction(actions, "DEAN_IMPLEMENTATION_CONFIRMATION", issue.id, target, state.enteredAt, state.dueAt, now, true);
    }
    if (state.stateCode === "REPORTER_RESOLUTION_CONFIRMATION" && round.status === "PENDING_REPORTER_CONFIRMATION" && round.deanDecision) {
      addAction(actions, "REPORTER_FEEDBACK", issue.id, target, state.enteredAt, state.dueAt, now, false);
    }
  }
  const closure = row.completionRequests[0];
  const primary = row.roleAssignments.find(({ isPrimary }) => isPrimary)?.person.displayName ?? null;
  return {
    projectId: row.id,
    projectCode: row.projectCode!,
    applicationCode: row.applicationCode,
    projectName: row.projectName,
    projectStatus: row.status as DeanDashboardProjectItem["projectStatus"],
    leadOrganizationName: row.leadOrganizationName,
    primaryKeySubIDisplayName: primary,
    otherKeySubIDisplayNames: row.roleAssignments.filter(({ isPrimary }) => !isPrimary).map(({ person }) => person.displayName),
    stageSummary: projectStageSummary(row, currentStage, applicableStages.length, completedStageCount),
    exceptionSummary: {
      openIssueCount: row.issues.length,
      highestIssueRisk,
      closureBlocked: closure?.status === "CLOSURE_BLOCKED",
      closureGateReasonCount: closure?.status === "CLOSURE_BLOCKED" ? closure.blocks.length : 0,
    },
    actionSummaries: [...actions.values()].map(toActionSummary).sort((a, b) => actionRank(a.category) - actionRank(b.category)),
  };
}

type MutableAction = DeanDashboardActionSummary & { keys: Set<string> };

function toActionSummary(action: MutableAction): DeanDashboardActionSummary {
  return {
    category: action.category,
    taskCount: action.taskCount,
    oldestStartedAt: action.oldestStartedAt,
    overdue: action.overdue,
    actionableByCurrentDean: action.actionableByCurrentDean,
    target: action.target,
  };
}

function addAction(actions: Map<DeanDashboardActionSummary["category"], MutableAction>, category: DeanDashboardActionSummary["category"], key: string, target: DeanDashboardActionSummary["target"], startedAt: Date | null, dueAt: Date | null, now: Date, actionable: boolean) {
  const existing = actions.get(category);
  if (existing?.keys.has(key)) return;
  const started = startedAt?.toISOString() ?? null;
  const overdue = Boolean(dueAt && dueAt < now);
  if (!existing) {
    actions.set(category, { category, taskCount: 1, oldestStartedAt: started, overdue, actionableByCurrentDean: actionable, target, keys: new Set([key]) });
    return;
  }
  existing.keys.add(key);
  existing.taskCount += 1;
  existing.overdue ||= overdue;
  if (isEarlier(started, existing.oldestStartedAt)) {
    existing.oldestStartedAt = started;
    existing.target = target;
  }
}

function projectStageSummary(row: DashboardProjectRow, currentStage: { projectStageId: string; stageName: string; sortOrder: number } | undefined, applicableStageCount: number, completedStageCount: number): DeanDashboardProjectItem["stageSummary"] {
  const fixed = row.status === "CLOSING" ? "结题处理中" : row.status === "COMPLETED" ? "已完成" : row.status === "ARCHIVED" ? "已归档" : null;
  return { currentStageId: fixed ? null : currentStage?.projectStageId ?? null, currentStageName: fixed ?? currentStage?.stageName ?? (applicableStageCount ? "执行节点已完成" : "暂无适用执行节点"), currentStageSortOrder: fixed ? null : currentStage?.sortOrder ?? null, completedStageCount, applicableStageCount };
}

function matchesFocus(item: DeanDashboardProjectItem, focus: DeanDashboardQuery["focus"]): boolean {
  if (focus === "all") return true;
  if (focus === "decision") return hasCategory(item, "DEAN_DECISION");
  if (focus === "implementation") return hasCategory(item, "PMO_IMPLEMENTATION");
  if (focus === "confirmation") return hasCategory(item, "DEAN_IMPLEMENTATION_CONFIRMATION");
  return hasCategory(item, "REPORTER_FEEDBACK");
}

function comparator(query: DeanDashboardQuery) {
  const direction = query.order === "asc" ? 1 : -1;
  return (a: DeanDashboardProjectItem, b: DeanDashboardProjectItem) => {
    let compared = 0;
    if (query.sort === "project") compared = compareText(a.projectName, b.projectName) * direction;
    if (query.sort === "owner") compared = compareNullableText(a.primaryKeySubIDisplayName, b.primaryKeySubIDisplayName, direction);
    if (query.sort === "stage") compared = compareNullableNumber(a.stageSummary.currentStageSortOrder, b.stageSummary.currentStageSortOrder, direction);
    if (query.sort === "exception") compared = (exceptionScore(a) - exceptionScore(b)) * direction;
    if (query.sort === "action") compared = (actionScore(a) - actionScore(b)) * direction || compareNullableDate(oldestActionAt(b), oldestActionAt(a)) * direction;
    return compared || compareText(a.projectCode, b.projectCode) || compareText(a.projectId, b.projectId);
  };
}

function actionScore(item: DeanDashboardProjectItem): number {
  if (hasCategory(item, "DEAN_DECISION")) return 5;
  if (hasCategory(item, "DEAN_IMPLEMENTATION_CONFIRMATION")) return 4;
  if (hasCategory(item, "PMO_IMPLEMENTATION")) return 3;
  if (hasCategory(item, "REPORTER_FEEDBACK")) return 2;
  return 1;
}
function exceptionScore(item: DeanDashboardProjectItem) { return item.exceptionSummary.closureBlocked ? 3 : item.exceptionSummary.highestIssueRisk === "BLOCKED" ? 2 : item.exceptionSummary.highestIssueRisk === "RISK" ? 1 : 0; }
function oldestActionAt(item: DeanDashboardProjectItem) { return item.actionSummaries.reduce<string | null>((oldest, action) => isEarlier(action.oldestStartedAt, oldest) ? action.oldestStartedAt : oldest, null); }
function hasCategory(item: DeanDashboardProjectItem, category: DeanDashboardActionSummary["category"]) { return item.actionSummaries.some((action) => action.category === category); }
function actionRank(category: DeanDashboardActionSummary["category"]) { return ({ DEAN_DECISION: 0, DEAN_IMPLEMENTATION_CONFIRMATION: 1, PMO_IMPLEMENTATION: 2, REPORTER_FEEDBACK: 3 })[category]; }
function normalizeSearch(value: string) { return value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN"); }
function isEarlier(candidate: string | null, current: string | null) { return Boolean(candidate && (!current || candidate < current)); }
function compareText(a: string, b: string) { return a.localeCompare(b, "zh-CN"); }
function compareNullableText(a: string | null, b: string | null, direction: number) { return a === null ? b === null ? 0 : 1 : b === null ? -1 : compareText(a, b) * direction; }
function compareNullableNumber(a: number | null, b: number | null, direction: number) { return a === null ? b === null ? 0 : 1 : b === null ? -1 : (a - b) * direction; }
function compareNullableDate(a: string | null, b: string | null) { return a === null ? b === null ? 0 : 1 : b === null ? -1 : a.localeCompare(b); }

async function requireActiveDean(client: Prisma.TransactionClient, actor: CollaborationActor) {
  if (actor.roleCode !== "DEAN") throw new CollaborationError("COLLABORATION_FORBIDDEN");
  const session = await client.session.findFirst({ where: { id: actor.sessionId, personId: actor.personId, activeRoleCode: "DEAN", revokedAt: null, expiresAt: { gt: new Date() }, person: { accountStatus: "ACTIVE" } }, select: { id: true } });
  const assignment = await client.roleAssignment.findFirst({ where: { personId: actor.personId, roleCode: "DEAN", projectId: null, assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } }, select: { id: true } });
  if (!session || !assignment) throw new CollaborationError("COLLABORATION_FORBIDDEN");
}
