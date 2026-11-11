import {
  CollaborationError,
  type CollaborationActor,
  type PmoDashboardActionSummary,
  type PmoDashboardApplicationItem,
  type PmoDashboardItem,
  type PmoDashboardProjectItem,
  type PmoDashboardQuery,
  type PmoDashboardRepository,
  type PmoProjectDashboardResult,
} from "@researchflow/collaboration";

import type { Prisma } from "../generated/client.js";
import type { ApplicationPrismaClient } from "./client.js";

const visibleStatuses = ["ACTIVE", "CLOSING", "COMPLETED", "ARCHIVED"] as const;
const applicationStatuses = ["DRAFT", "PENDING_ESTABLISHMENT_REVIEW", "RETURNED_FOR_REVISION", "ON_HOLD", "REJECTED", "CANCELLED"] as const;
const dashboardStatuses = [...visibleStatuses, ...applicationStatuses] as const;
const activeClosureStatuses = ["CLOSURE_BLOCKED", "CLOSURE_PENDING_PMO_REVIEW", "CLOSURE_RETURNED_FOR_SUPPLEMENT"] as const;
const activeDecisionStatuses = ["PENDING_DEAN_DECISION", "PENDING_PMO_IMPLEMENTATION", "PENDING_DEAN_REVIEW", "PENDING_REPORTER_CONFIRMATION"] as const;

export const dashboardProjectSelect = {
  id: true,
  projectCode: true,
  applicationCode: true,
  projectName: true,
  status: true,
  leadOrganizationName: true,
  updatedAt: true,
  applicant: { select: { displayName: true } },
  currentApplicationVersion: {
    select: {
      projectName: true,
      owners: {
        where: { isPrimary: true },
        take: 1,
        select: { person: { select: { displayName: true } } },
      },
    },
  },
  establishmentReviews: {
    orderBy: { submissionNo: "desc" },
    take: 1,
    select: { submittedAt: true },
  },
  roleAssignments: {
    where: { roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } },
    orderBy: [{ isPrimary: "desc" }, { activatedAt: "asc" }],
    select: { isPrimary: true, person: { select: { displayName: true } } },
  },
  projectPlan: {
    select: {
      versions: {
        where: { status: "ACTIVE" },
        orderBy: { versionNo: "desc" },
        take: 1,
        select: {
          stageVersions: {
            orderBy: { sortOrder: "asc" },
            select: { projectStageId: true, stageName: true, sortOrder: true, applicability: true },
          },
          workflowStageVersions: {
            orderBy: { sortOrder: "asc" },
            select: {
              applicability: true,
              projectWorkflowStage: { select: { id: true, projectStageId: true, executionStatus: true } },
            },
          },
        },
      },
    },
  },
  workflowCompletionRequests: {
    where: { status: "PENDING_PMO_REVIEW", closedAt: null },
    select: {
      projectWorkflowStageId: true,
      reviewRounds: {
        where: { status: "ACTIVE", completedAt: null },
        orderBy: { roundNo: "desc" },
        take: 1,
        select: { startedAt: true, dueAt: true },
      },
    },
  },
  issues: {
    where: { resolvedAt: null, closedAt: null },
    select: {
      id: true,
      projectWorkflowStageId: true,
      currentRiskLevel: true,
      handlingStates: {
        where: { exitedAt: null },
        orderBy: { enteredAt: "desc" },
        take: 1,
        select: { stateCode: true, enteredAt: true, dueAt: true },
      },
      decisionRounds: {
        where: { status: { in: [...activeDecisionStatuses] }, completedAt: null },
        orderBy: { roundNo: "desc" },
        take: 1,
        select: {
          status: true,
          deanDecision: { select: { decidedByPersonId: true, implementationReviewRequired: true } },
          reviewTransfers: {
            where: { acceptedAt: { not: null } },
            orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { acceptedByDeanPersonId: true, acceptedAt: true },
          },
        },
      },
    },
  },
  completionRequests: {
    where: { status: { in: [...activeClosureStatuses] }, closedAt: null },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      status: true,
      blocks: { where: { clearedAt: null }, select: { id: true } },
      reviewRounds: {
        where: { completedAt: null },
        orderBy: { roundNo: "desc" },
        take: 1,
        select: { startedAt: true, dueAt: true },
      },
      supplementRounds: {
        where: { completedAt: null },
        orderBy: { roundNo: "desc" },
        take: 1,
        select: { startedAt: true, dueAt: true },
      },
    },
  },
} satisfies Prisma.ProjectSelect;

export type DashboardProjectRow = Prisma.ProjectGetPayload<{ select: typeof dashboardProjectSelect }>;

export class PrismaPmoDashboardRepository implements PmoDashboardRepository {
  constructor(private readonly client: ApplicationPrismaClient) {}

  queryProjects(actor: CollaborationActor, query: PmoDashboardQuery): Promise<PmoProjectDashboardResult> {
    return this.client.$transaction(async (transaction) => {
      await requireActivePmo(transaction, actor);
      const rows = await transaction.project.findMany({
        where: { status: { in: [...dashboardStatuses] } },
        select: dashboardProjectSelect,
      });
      return buildDashboardResult(rows, query, new Date());
    }, { isolationLevel: "RepeatableRead" });
  }
}

export function buildDashboardResult(
  rows: readonly DashboardProjectRow[],
  query: PmoDashboardQuery,
  snapshotAt: Date,
): PmoProjectDashboardResult {
  const allItems: PmoDashboardItem[] = [];
  for (const row of rows) {
    if (row.projectCode && visibleStatuses.includes(row.status as (typeof visibleStatuses)[number])) allItems.push(mapProject(row, snapshotAt));
    else if (applicationStatuses.includes(row.status as (typeof applicationStatuses)[number])) allItems.push(mapApplication(row));
  }
  const defaultItems = allItems.filter((item) => item.itemType === "FORMAL_PROJECT" || !isFinishedApplication(item));
  const formalItems = allItems.filter((item): item is PmoDashboardProjectItem => item.itemType === "FORMAL_PROJECT");
  const counts = {
    allItems: defaultItems.length,
    applicationItems: allItems.filter((item) => item.itemType === "PROJECT_APPLICATION" && isInReviewApplication(item)).length,
    pendingPmoProjects: formalItems.filter((item) => hasCategory(item, "PMO")).length,
    pendingDeanProjects: formalItems.filter((item) => hasCategory(item, "DEAN_DECISION")).length,
    implementationProjects: formalItems.filter((item) => hasCategory(item, "PMO_IMPLEMENTATION")).length,
    confirmationClosureProjects: formalItems.filter((item) => hasCategory(item, "CONFIRMATION") || hasCategory(item, "CLOSURE")).length,
  };
  const normalizedSearch = normalizeSearch(query.q);
  const filtered = allItems.filter((item) => {
    if (!matchesFocus(item, query)) return false;
    if (query.hideFinished && isFinishedItem(item)) return false;
    if (!normalizedSearch) return true;
    return normalizeSearch(searchableText(item)).includes(normalizedSearch);
  });
  filtered.sort(dashboardComparator(query));
  const totalPages = Math.max(1, Math.ceil(filtered.length / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const start = (page - 1) * query.pageSize;
  return {
    snapshotAt: snapshotAt.toISOString(),
    counts,
    filteredTotal: filtered.length,
    page,
    pageSize: 50,
    items: filtered.slice(start, start + query.pageSize),
  };
}

function mapProject(row: DashboardProjectRow, now: Date): PmoDashboardProjectItem {
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
  const stageSummary = projectStageSummary(row, currentStage, applicableStages.length, completedStageCount);

  let highestIssueRisk: "NONE" | "RISK" | "BLOCKED" = "NONE";
  for (const issue of row.issues) {
    if (issue.currentRiskLevel === "BLOCKED") highestIssueRisk = "BLOCKED";
    else if (issue.currentRiskLevel === "RISK" && highestIssueRisk === "NONE") highestIssueRisk = "RISK";
  }
  const closure = row.completionRequests[0];
  const actions = new Map<PmoDashboardActionSummary["category"], MutableAction>();
  for (const request of row.workflowCompletionRequests) {
    const round = request.reviewRounds[0];
    addAction(actions, "PMO", request.projectWorkflowStageId, { kind: "WORKFLOW_COMPLETION", workflowStageId: request.projectWorkflowStageId }, round?.startedAt ?? null, round?.dueAt ?? null, now);
  }
  for (const issue of row.issues) {
    const state = issue.handlingStates[0];
    if (!state) {
      console.warn("PMO_DASHBOARD_ISSUE_STATE_MISSING", { projectId: row.id, issueId: issue.id });
      continue;
    }
    const target = { kind: "ISSUE" as const, workflowStageId: issue.projectWorkflowStageId, issueId: issue.id };
    const decisionStatus = issue.decisionRounds[0]?.status;
    if (["PMO_INITIAL_REVIEW", "PMO_COORDINATION", "PMO_DECISION_SUPPLEMENT", "PMO_IMPLEMENTATION"].includes(state.stateCode)) {
      addAction(actions, "PMO", issue.id, target, state.enteredAt, state.dueAt, now);
    }
    if (state.stateCode === "DEAN_DECISION" && decisionStatus === "PENDING_DEAN_DECISION") {
      addAction(actions, "DEAN_DECISION", issue.id, target, state.enteredAt, state.dueAt, now);
    }
    if (state.stateCode === "PMO_IMPLEMENTATION" && decisionStatus === "PENDING_PMO_IMPLEMENTATION") {
      addAction(actions, "PMO_IMPLEMENTATION", issue.id, target, state.enteredAt, state.dueAt, now);
    }
    if (state.stateCode === "DEAN_IMPLEMENTATION_CONFIRMATION" || state.stateCode === "REPORTER_RESOLUTION_CONFIRMATION") {
      addAction(actions, "CONFIRMATION", issue.id, target, state.enteredAt, state.dueAt, now);
    }
  }
  if (closure) {
    const responsibility = closure.status === "CLOSURE_RETURNED_FOR_SUPPLEMENT" ? closure.supplementRounds[0] : closure.reviewRounds[0];
    if (closure.status === "CLOSURE_PENDING_PMO_REVIEW") {
      addAction(actions, "PMO", `closure:${row.id}`, { kind: "CLOSURE" }, responsibility?.startedAt ?? null, responsibility?.dueAt ?? null, now);
    }
    addAction(actions, "CLOSURE", `closure:${row.id}`, { kind: "CLOSURE" }, responsibility?.startedAt ?? null, responsibility?.dueAt ?? null, now, closure.status as PmoDashboardActionSummary["closureStatus"]);
  } else if (row.status === "CLOSING") {
    console.warn("PMO_DASHBOARD_CLOSING_REQUEST_MISSING", { projectId: row.id });
    addAction(actions, "CLOSURE", `closure:${row.id}`, { kind: "CLOSURE" }, null, null, now);
  }
  if (!activeVersion || applicableStages.length === 0) console.warn("PMO_DASHBOARD_NO_APPLICABLE_STAGE", { projectId: row.id });
  const primary = row.roleAssignments.find(({ isPrimary }) => isPrimary)?.person.displayName ?? null;
  if (!primary) console.warn("PMO_DASHBOARD_PRIMARY_OWNER_MISSING", { projectId: row.id });
  return {
    itemType: "FORMAL_PROJECT",
    projectId: row.id,
    projectCode: row.projectCode!,
    applicationCode: row.applicationCode,
    projectName: row.projectName,
    projectStatus: row.status as PmoDashboardProjectItem["projectStatus"],
    leadOrganizationName: row.leadOrganizationName,
    primaryKeySubIDisplayName: primary,
    otherKeySubIDisplayNames: row.roleAssignments.filter(({ isPrimary }) => !isPrimary).map(({ person }) => person.displayName),
    stageSummary,
    exceptionSummary: {
      openIssueCount: row.issues.length,
      highestIssueRisk,
      closureBlocked: closure?.status === "CLOSURE_BLOCKED",
      closureGateReasonCount: closure?.status === "CLOSURE_BLOCKED" ? closure.blocks.length : 0,
    },
    actionSummaries: [...actions.values()].map(toActionSummary).sort((a, b) => actionCategoryRank(a.category) - actionCategoryRank(b.category)),
  };
}

function mapApplication(row: DashboardProjectRow): PmoDashboardApplicationItem {
  return {
    itemType: "PROJECT_APPLICATION",
    projectId: row.id,
    applicationCode: row.applicationCode,
    projectName: row.currentApplicationVersion?.projectName ?? row.projectName,
    applicationStatus: row.status as PmoDashboardApplicationItem["applicationStatus"],
    applicantDisplayName: row.applicant.displayName,
    primaryOwnerDisplayName: row.currentApplicationVersion?.owners[0]?.person.displayName ?? null,
    submittedAt: row.establishmentReviews[0]?.submittedAt.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

type MutableAction = PmoDashboardActionSummary & { keys: Set<string> };

function toActionSummary(action: MutableAction): PmoDashboardActionSummary {
  return {
    category: action.category,
    taskCount: action.taskCount,
    oldestStartedAt: action.oldestStartedAt,
    overdue: action.overdue,
    target: action.target,
    ...(action.closureStatus ? { closureStatus: action.closureStatus } : {}),
  };
}

function addAction(
  actions: Map<PmoDashboardActionSummary["category"], MutableAction>,
  category: PmoDashboardActionSummary["category"],
  key: string,
  target: PmoDashboardActionSummary["target"],
  startedAt: Date | null,
  dueAt: Date | null,
  now: Date,
  closureStatus?: PmoDashboardActionSummary["closureStatus"],
): void {
  const existing = actions.get(category);
  if (existing?.keys.has(key)) return;
  const started = startedAt?.toISOString() ?? null;
  const overdue = Boolean(dueAt && dueAt.getTime() < now.getTime());
  if (!existing) {
    actions.set(category, { category, taskCount: 1, oldestStartedAt: started, overdue, target, closureStatus, keys: new Set([key]) });
    return;
  }
  existing.keys.add(key);
  existing.taskCount += 1;
  existing.overdue ||= overdue;
  if (isEarlier(started, existing.oldestStartedAt)) {
    existing.oldestStartedAt = started;
    existing.target = target;
    existing.closureStatus = closureStatus;
  }
}

function projectStageSummary(
  row: DashboardProjectRow,
  currentStage: { projectStageId: string; stageName: string; sortOrder: number } | undefined,
  applicableStageCount: number,
  completedStageCount: number,
): PmoDashboardProjectItem["stageSummary"] {
  const fixed = row.status === "CLOSING" ? "结题处理中" : row.status === "COMPLETED" ? "已完成" : row.status === "ARCHIVED" ? "已归档" : null;
  return {
    currentStageId: fixed ? null : currentStage?.projectStageId ?? null,
    currentStageName: fixed ?? currentStage?.stageName ?? (applicableStageCount ? "执行节点已完成" : "暂无适用执行节点"),
    currentStageSortOrder: fixed ? null : currentStage?.sortOrder ?? null,
    completedStageCount,
    applicableStageCount,
  };
}

function matchesFocus(item: PmoDashboardItem, query: PmoDashboardQuery): boolean {
  if (query.focus === "all") return item.itemType === "FORMAL_PROJECT" || !isFinishedApplication(item);
  if (query.focus === "applications") return item.itemType === "PROJECT_APPLICATION" && matchesApplicationView(item, query.applicationView);
  if (item.itemType !== "FORMAL_PROJECT") return false;
  if (query.focus === "pmo") return hasCategory(item, "PMO");
  if (query.focus === "dean") return hasCategory(item, "DEAN_DECISION");
  if (query.focus === "implementation") return hasCategory(item, "PMO_IMPLEMENTATION");
  return hasCategory(item, "CONFIRMATION") || hasCategory(item, "CLOSURE");
}

function matchesApplicationView(item: PmoDashboardApplicationItem, view: PmoDashboardQuery["applicationView"]): boolean {
  if (view === "active") return !isFinishedApplication(item);
  if (view === "editing") return item.applicationStatus === "DRAFT" || item.applicationStatus === "RETURNED_FOR_REVISION";
  if (view === "in_review") return isInReviewApplication(item);
  return isFinishedApplication(item);
}

function isInReviewApplication(item: PmoDashboardApplicationItem): boolean {
  return item.applicationStatus === "PENDING_ESTABLISHMENT_REVIEW" || item.applicationStatus === "ON_HOLD";
}

function isFinishedApplication(item: PmoDashboardApplicationItem): boolean {
  return item.applicationStatus === "REJECTED" || item.applicationStatus === "CANCELLED";
}

function isFinishedItem(item: PmoDashboardItem): boolean {
  return item.itemType === "FORMAL_PROJECT"
    ? item.projectStatus === "COMPLETED" || item.projectStatus === "ARCHIVED"
    : isFinishedApplication(item);
}

function searchableText(item: PmoDashboardItem): string {
  return item.itemType === "FORMAL_PROJECT"
    ? [item.projectCode, item.applicationCode, item.projectName, item.primaryKeySubIDisplayName ?? "", ...item.otherKeySubIDisplayNames].join(" ")
    : [item.applicationCode, item.projectName, item.applicantDisplayName, item.primaryOwnerDisplayName ?? ""].join(" ");
}

function hasCategory(item: PmoDashboardProjectItem, category: PmoDashboardActionSummary["category"]): boolean {
  return item.actionSummaries.some((action) => action.category === category);
}

function dashboardComparator(query: PmoDashboardQuery): (a: PmoDashboardItem, b: PmoDashboardItem) => number {
  const direction = query.order === "asc" ? 1 : -1;
  return (a, b) => {
    let compared = 0;
    if (query.sort === "project") compared = compareText(a.projectName, b.projectName) * direction;
    if (query.sort === "owner") compared = compareNullableTextFixedLast(ownerName(a), ownerName(b), direction);
    if (query.sort === "stage") compared = compareNullableNumberFixedLast(stageRank(a), stageRank(b), direction);
    if (query.sort === "exception") compared = (compareNumber(exceptionScore(a), exceptionScore(b)) || compareNumber(openIssueCount(a), openIssueCount(b))) * direction;
    if (query.sort === "action") compared = (compareNumber(actionScore(a), actionScore(b)) || compareNullableDate(oldestActionAt(b), oldestActionAt(a))) * direction;
    return compared || compareText(itemCode(a), itemCode(b)) || compareText(a.projectId, b.projectId);
  };
}

function ownerName(item: PmoDashboardItem): string | null {
  return item.itemType === "FORMAL_PROJECT" ? item.primaryKeySubIDisplayName : item.primaryOwnerDisplayName ?? item.applicantDisplayName;
}

function stageRank(item: PmoDashboardItem): number | null {
  if (item.itemType === "FORMAL_PROJECT") return item.stageSummary.currentStageSortOrder;
  return ({ DRAFT: 10, RETURNED_FOR_REVISION: 20, PENDING_ESTABLISHMENT_REVIEW: 30, ON_HOLD: 40, REJECTED: 50, CANCELLED: 60 })[item.applicationStatus];
}

function exceptionScore(item: PmoDashboardItem): number {
  if (item.itemType === "PROJECT_APPLICATION") return 0;
  if (item.exceptionSummary.closureBlocked) return 3;
  if (item.exceptionSummary.highestIssueRisk === "BLOCKED") return 2;
  return item.exceptionSummary.highestIssueRisk === "RISK" ? 1 : 0;
}

function openIssueCount(item: PmoDashboardItem): number {
  return item.itemType === "FORMAL_PROJECT" ? item.exceptionSummary.openIssueCount : 0;
}

function actionScore(item: PmoDashboardItem): number {
  if (item.itemType === "PROJECT_APPLICATION") {
    if (item.applicationStatus === "PENDING_ESTABLISHMENT_REVIEW") return 8;
    if (item.applicationStatus === "ON_HOLD") return 7;
    if (item.applicationStatus === "RETURNED_FOR_REVISION") return 2;
    if (item.applicationStatus === "DRAFT") return 1;
    return 0;
  }
  const pmo = item.actionSummaries.find(({ category }) => category === "PMO");
  if (pmo?.overdue) return 6;
  if (pmo) return 5;
  if (hasCategory(item, "PMO_IMPLEMENTATION")) return 4;
  if (hasCategory(item, "DEAN_DECISION")) return 3;
  if (hasCategory(item, "CONFIRMATION") || hasCategory(item, "CLOSURE")) return 2;
  return 1;
}

function oldestActionAt(item: PmoDashboardItem): string | null {
  return item.itemType === "PROJECT_APPLICATION"
    ? item.submittedAt ?? item.updatedAt
    : item.actionSummaries.reduce<string | null>((oldest, action) => isEarlier(action.oldestStartedAt, oldest) ? action.oldestStartedAt : oldest, null);
}

function itemCode(item: PmoDashboardItem): string {
  return item.itemType === "FORMAL_PROJECT" ? item.projectCode : item.applicationCode;
}

function actionCategoryRank(category: PmoDashboardActionSummary["category"]): number {
  return ({ PMO: 0, DEAN_DECISION: 1, PMO_IMPLEMENTATION: 2, CONFIRMATION: 3, CLOSURE: 4 })[category];
}

function normalizeSearch(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
}

function isEarlier(candidate: string | null, current: string | null): boolean {
  if (!candidate) return false;
  return !current || candidate < current;
}

function compareText(a: string, b: string): number { return a.localeCompare(b, "zh-CN"); }
function compareNumber(a: number, b: number): number { return a - b; }
function compareNullableNumberFixedLast(a: number | null, b: number | null, direction: number): number { return a === null ? b === null ? 0 : 1 : b === null ? -1 : (a - b) * direction; }
function compareNullableTextFixedLast(a: string | null, b: string | null, direction: number): number { return a === null ? b === null ? 0 : 1 : b === null ? -1 : compareText(a, b) * direction; }
function compareNullableDate(a: string | null, b: string | null): number { return a === null ? b === null ? 0 : 1 : b === null ? -1 : a.localeCompare(b); }

async function requireActivePmo(client: Prisma.TransactionClient, actor: CollaborationActor): Promise<void> {
  if (actor.roleCode !== "PMO") throw new CollaborationError("COLLABORATION_FORBIDDEN");
  const session = await client.session.findFirst({
      where: { id: actor.sessionId, personId: actor.personId, activeRoleCode: "PMO", revokedAt: null, expiresAt: { gt: new Date() }, person: { accountStatus: "ACTIVE" } },
      select: { id: true },
    });
  const assignment = await client.roleAssignment.findFirst({
      where: { personId: actor.personId, roleCode: "PMO", projectId: null, assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } },
      select: { id: true },
    });
  if (!session || !assignment) throw new CollaborationError("COLLABORATION_FORBIDDEN");
}
