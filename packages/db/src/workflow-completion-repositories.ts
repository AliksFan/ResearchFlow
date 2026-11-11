import { randomUUID } from "node:crypto";

import {
  CollaborationError,
  canApproveWorkflowCompletion,
  deriveInitialCompletionStatus,
  validateWorkflowDependencyGraph,
  type CollaborationActor,
  type SubmitWorkflowCompletionInput,
  type ResubmitWorkflowCompletionInput,
  type WorkflowCompletionMutationInput,
  type WorkflowCompletionRecord,
  type WorkflowCompletionRepository,
} from "@researchflow/collaboration";

import type { Prisma } from "../generated/client.js";
import type { ApplicationPrismaClient } from "./client.js";

type Transaction = Prisma.TransactionClient;
type DatabaseClient = ApplicationPrismaClient | Transaction;
const PROCESSING_STATUSES = [
  "WAITING_FOR_PREDECESSOR",
  "PENDING_PMO_REVIEW",
  "ISSUE_RESOLUTION_REQUIRED",
  "PREDECESSOR_RETURNED_CONFIRMATION",
  "RETURNED_FOR_RESUBMISSION",
] as const;

export class PrismaWorkflowCompletionRepository implements WorkflowCompletionRepository {
  constructor(private readonly client: ApplicationPrismaClient) {}

  async list(actor: CollaborationActor, projectId: string): Promise<WorkflowCompletionRecord[]> {
    return this.client.$transaction(async (transaction) => {
      await requireReadableProject(transaction, actor, projectId);
      const requests = await transaction.workflowCompletionRequest.findMany({
        where: { projectId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: completionInclude,
      });
      return requests.map(mapCompletion);
    }, { isolationLevel: "Serializable" });
  }

  async submit(input: SubmitWorkflowCompletionInput & { actor: CollaborationActor }): Promise<WorkflowCompletionRecord> {
    return this.runMutation(async (transaction) => {
      await requireWritableKeySubI(transaction, input.actor, input.projectId);
      const node = await transaction.projectWorkflowStage.findFirst({
        where: {
          id: input.projectWorkflowStageId,
          projectId: input.projectId,
          rowVersion: input.expectedNodeRowVersion,
          executionStatus: { in: ["NOT_STARTED", "ACTIVE"] },
          project: { status: "ACTIVE" },
        },
        include: {
          versions: {
            where: { projectPlanVersion: { status: "ACTIVE" } },
            take: 1,
            include: { projectPlanVersion: { select: { id: true } } },
          },
          successorDependencies: {
            where: { projectPlanVersion: { status: "ACTIVE" } },
            include: { predecessor: { select: { executionStatus: true } } },
          },
        },
      });
      const version = node?.versions[0];
      if (!node || !version || version.applicability === "NOT_APPLICABLE") {
        throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
      }
      const draftAssets = await completionDraftAssets(transaction, input, version.attachmentRequirement);
      const hasOpenIssue = await openIssueExists(transaction, input.projectId, node.id);
      const status = deriveInitialCompletionStatus(
        node.successorDependencies.map(({ predecessor }) => predecessor.executionStatus),
        hasOpenIssue,
      );
      const submittedAt = new Date();
      const request = await transaction.workflowCompletionRequest.create({
        data: {
          projectId: input.projectId,
          projectWorkflowStageId: node.id,
          submittedPlanVersionId: version.projectPlanVersion.id,
          status,
          attachmentRequirementSnapshot: version.attachmentRequirement,
        },
      });
      const submission = await transaction.workflowCompletionSubmission.create({
        data: {
          projectId: input.projectId,
          completionRequestId: request.id,
          submissionNo: 1,
          submittedByPersonId: input.actor.personId,
          submittedRoleCode: "KEY_SUB_I",
          progressSummarySnapshot: input.progressSummary,
          basisSnapshot: input.basis,
          expectedCompletionDateSnapshot: input.expectedCompletionDate
            ? new Date(`${input.expectedCompletionDate}T00:00:00.000Z`)
            : null,
          submittedAt,
        },
      });
      await transaction.workflowCompletionRequest.update({
        where: { id: request.id },
        data: { currentSubmissionId: submission.id },
      });
      await bindDraftAssets(transaction, draftAssets, input.actor, submission.id, submittedAt);
      if (status === "PENDING_PMO_REVIEW") {
        await createReviewRound(transaction, input.projectId, node.id, request.id, 1, submittedAt, input.actor);
      }
      await transaction.projectWorkflowStage.update({
        where: { id: node.id },
        data: {
          executionStatus: "PENDING_COMPLETION_CONFIRMATION",
          actualStartAt: node.actualStartAt ?? submittedAt,
          nextUpdateDueDate: null,
          rowVersion: { increment: 1 },
        },
      });
      await addActivity(transaction, input.actor, input.projectId, request.id, "SUBMITTED", input.progressSummary);
      await addAudit(transaction, input.actor, input.projectId, request.id, "WORKFLOW_COMPLETION_SUBMITTED", ["status", "current_submission_id"]);
      return mapCompletion(await transaction.workflowCompletionRequest.findUniqueOrThrow({
        where: { id: request.id },
        include: completionInclude,
      }));
    });
  }

  async supplement(input: WorkflowCompletionMutationInput & {
    actor: CollaborationActor;
    content: string;
    attachmentDraftIds: string[];
  }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requireWritableKeySubI(transaction, input.actor, input.projectId);
      const request = await requireRequest(transaction, input, [
        "WAITING_FOR_PREDECESSOR", "PENDING_PMO_REVIEW", "ISSUE_RESOLUTION_REQUIRED",
      ]);
      if (!request.currentSubmissionId) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
      const draftAssets = await completionSupplementDraftAssets(transaction, input, request.projectWorkflowStageId);
      const addedAt = new Date();
      const supplement = await transaction.workflowCompletionSupplement.create({ data: {
        projectId: input.projectId,
        completionRequestId: request.id,
        submissionId: request.currentSubmissionId,
        addedByPersonId: input.actor.personId,
        addedRoleCode: "KEY_SUB_I",
        content: input.content,
        addedAt,
      } });
      await bindSupplementAssets(transaction, draftAssets, input.actor, supplement.id, addedAt);
      await bumpRequest(transaction, request.id, input.expectedRowVersion);
      await addActivity(transaction, input.actor, input.projectId, request.id, "SUPPLEMENTED", input.content);
      await addAudit(transaction, input.actor, input.projectId, request.id, "WORKFLOW_COMPLETION_SUPPLEMENTED", ["supplement"]);
    });
  }

  async withdraw(input: WorkflowCompletionMutationInput & { actor: CollaborationActor; reason: string }): Promise<void> {
    await this.runMutation(async (transaction) => {
      const assignment = await requireWritableKeySubI(transaction, input.actor, input.projectId);
      const request = await requireRequest(transaction, input, [
        "WAITING_FOR_PREDECESSOR", "PENDING_PMO_REVIEW", "ISSUE_RESOLUTION_REQUIRED",
      ]);
      const submission = request.currentSubmission;
      if (!submission || (submission.submittedByPersonId !== input.actor.personId && !assignment.isPrimary)) {
        throw new CollaborationError("COLLABORATION_FORBIDDEN");
      }
      await closeRequest(transaction, request, "WITHDRAWN", input.expectedRowVersion, input.actor, input.reason);
      await cascadePredecessorLoss(transaction, input.projectId, request.projectWorkflowStageId, input.actor);
      await addAudit(transaction, input.actor, input.projectId, request.id, "WORKFLOW_COMPLETION_WITHDRAWN", ["status"]);
    });
  }

  async reconfirm(input: WorkflowCompletionMutationInput & { actor: CollaborationActor; confirmation: string }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requireWritableKeySubI(transaction, input.actor, input.projectId);
      const request = await requireRequest(transaction, input, ["PREDECESSOR_RETURNED_CONFIRMATION"]);
      const currentPredecessorStatuses = await predecessorStatuses(transaction, request);
      const hasOpenIssue = await openIssueExists(transaction, input.projectId, request.projectWorkflowStageId);
      if (currentPredecessorStatuses.some((status) => status !== "COMPLETED")) {
        throw new CollaborationError("WORKFLOW_COMPLETION_PREDECESSOR_BLOCKED");
      }
      const current = request.currentSubmission;
      if (!current) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
      const submittedAt = new Date();
      const submissionNo = request.submissions.length + 1;
      const submission = await transaction.workflowCompletionSubmission.create({ data: {
        projectId: input.projectId,
        completionRequestId: request.id,
        submissionNo,
        submittedByPersonId: input.actor.personId,
        submittedRoleCode: "KEY_SUB_I",
        progressSummarySnapshot: current.progressSummarySnapshot,
        basisSnapshot: current.basisSnapshot,
        expectedCompletionDateSnapshot: current.expectedCompletionDateSnapshot,
        submittedAt,
      } });
      const status = deriveInitialCompletionStatus(currentPredecessorStatuses, hasOpenIssue);
      const updated = await transaction.workflowCompletionRequest.updateMany({
        where: { id: request.id, rowVersion: input.expectedRowVersion, status: "PREDECESSOR_RETURNED_CONFIRMATION" },
        data: { currentSubmissionId: submission.id, status, rowVersion: { increment: 1 } },
      });
      if (updated.count !== 1) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
      const node = await transaction.projectWorkflowStage.updateMany({
        where: {
          id: request.projectWorkflowStageId,
          projectId: input.projectId,
          executionStatus: "NOT_STARTED",
        },
        data: {
          executionStatus: "PENDING_COMPLETION_CONFIRMATION",
          rowVersion: { increment: 1 },
        },
      });
      if (node.count !== 1) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
      if (status === "PENDING_PMO_REVIEW") {
        await createReviewRound(transaction, input.projectId, request.projectWorkflowStageId, request.id, request.reviewRounds.length + 1, submittedAt, input.actor);
      }
      await addActivity(transaction, input.actor, input.projectId, request.id, "RECONFIRMED", input.confirmation);
      await addAudit(transaction, input.actor, input.projectId, request.id, "WORKFLOW_COMPLETION_RECONFIRMED", ["status", "current_submission_id"]);
    });
  }

  async resubmit(input: ResubmitWorkflowCompletionInput & { actor: CollaborationActor }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requireWritableKeySubI(transaction, input.actor, input.projectId);
      const request = await requireRequest(transaction, input, ["RETURNED_FOR_RESUBMISSION"]);
      if (request.attachmentRequirementSnapshot === "NONE" && input.attachmentDraftIds.length) {
        throw new CollaborationError("WORKFLOW_COMPLETION_INVALID_INPUT");
      }
      const draftAssets = await loadDraftAssets(
        transaction,
        input,
        "WORKFLOW_COMPLETION_SUBMISSION",
        request.projectWorkflowStageId,
      );
      const statuses = await predecessorStatuses(transaction, request);
      const hasOpenIssue = await openIssueExists(transaction, input.projectId, request.projectWorkflowStageId);
      const status = deriveInitialCompletionStatus(statuses, hasOpenIssue);
      const submittedAt = new Date();
      const submission = await transaction.workflowCompletionSubmission.create({ data: {
        projectId: input.projectId,
        completionRequestId: request.id,
        submissionNo: request.submissions.length + 1,
        submittedByPersonId: input.actor.personId,
        submittedRoleCode: "KEY_SUB_I",
        progressSummarySnapshot: input.progressSummary,
        basisSnapshot: input.basis,
        expectedCompletionDateSnapshot: input.expectedCompletionDate ? new Date(`${input.expectedCompletionDate}T00:00:00.000Z`) : null,
        submittedAt,
      } });
      const updated = await transaction.workflowCompletionRequest.updateMany({
        where: { id: request.id, rowVersion: input.expectedRowVersion, status: "RETURNED_FOR_RESUBMISSION" },
        data: { currentSubmissionId: submission.id, status, rowVersion: { increment: 1 } },
      });
      if (updated.count !== 1) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
      await bindDraftAssets(transaction, draftAssets, input.actor, submission.id, submittedAt);
      if (status === "PENDING_PMO_REVIEW") await createReviewRound(transaction, input.projectId, request.projectWorkflowStageId, request.id, request.reviewRounds.length + 1, submittedAt, input.actor);
      await transaction.projectWorkflowStage.update({ where: { id: request.projectWorkflowStageId }, data: { executionStatus: "PENDING_COMPLETION_CONFIRMATION", rowVersion: { increment: 1 } } });
      await addActivity(transaction, input.actor, input.projectId, request.id, "RESUBMITTED", input.progressSummary);
      await addAudit(transaction, input.actor, input.projectId, request.id, "WORKFLOW_COMPLETION_RESUBMITTED", ["status", "current_submission_id"]);
    });
  }

  async review(input: WorkflowCompletionMutationInput & {
    actor: CollaborationActor;
    decision: "APPROVE" | "RETURN";
    comment: string;
  }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requirePmo(transaction, input.actor);
      const allowed = input.decision === "RETURN"
        ? ["WAITING_FOR_PREDECESSOR", "PENDING_PMO_REVIEW", "ISSUE_RESOLUTION_REQUIRED"] as const
        : ["PENDING_PMO_REVIEW"] as const;
      const request = await requireRequest(transaction, input, allowed);
      if (input.decision === "APPROVE") {
        const statuses = await predecessorStatuses(transaction, request);
        const hasOpenIssue = await openIssueExists(transaction, input.projectId, request.projectWorkflowStageId);
        const availableAttachmentCount = await transaction.businessAttachment.count({ where: {
          fileAsset: { status: "AVAILABLE" },
          OR: [
            { workflowCompletionSubmission: { completionRequestId: request.id } },
            { workflowCompletionSupplement: { completionRequestId: request.id } },
          ],
        } });
        canApproveWorkflowCompletion({
          requestStatus: request.status,
          predecessorExecutionStatuses: statuses,
          hasOpenIssue,
          attachmentRequirement: request.attachmentRequirementSnapshot,
          availableAttachmentCount,
        });
        const now = new Date();
        await updateRequestStatus(transaction, request.id, input.expectedRowVersion, "APPROVED", now);
        await closeReviewRound(transaction, request.id, "APPROVED", input.actor.personId, input.comment, now);
        await completePmoReviewActions(transaction, request.id, input.actor, "节点完成申请已正式批准", now);
        const node = await transaction.projectWorkflowStage.updateMany({
          where: { id: request.projectWorkflowStageId, projectId: input.projectId, executionStatus: "PENDING_COMPLETION_CONFIRMATION" },
          data: { executionStatus: "COMPLETED", actualEndAt: now, rowVersion: { increment: 1 } },
        });
        if (node.count !== 1) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
        await addActivity(transaction, input.actor, input.projectId, request.id, "APPROVED", input.comment);
        await activateEligibleWaitingRequests(transaction, input.projectId, request.projectWorkflowStageId, now);
      } else {
        await closeRequest(transaction, request, "RETURNED_FOR_RESUBMISSION", input.expectedRowVersion, input.actor, input.comment);
        await completePmoReviewActions(transaction, request.id, input.actor, "节点完成申请已退回", new Date());
        await cascadePredecessorLoss(transaction, input.projectId, request.projectWorkflowStageId, input.actor);
      }
      await addAudit(
        transaction,
        input.actor,
        input.projectId,
        request.id,
        input.decision === "APPROVE" ? "WORKFLOW_COMPLETION_APPROVED" : "WORKFLOW_COMPLETION_RETURNED",
        ["status"],
      );
    });
  }

  async synchronizeIssueGate(input: WorkflowCompletionMutationInput & { actor: CollaborationActor }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requirePmo(transaction, input.actor);
      const request = await requireRequest(transaction, input, ["PENDING_PMO_REVIEW", "ISSUE_RESOLUTION_REQUIRED"]);
      await synchronizeRequestIssueGate(transaction, request, input.actor);
    });
  }

  async revokeFormalCompletion(input: WorkflowCompletionMutationInput & { actor: CollaborationActor; reason: string }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requirePmo(transaction, input.actor);
      const request = await requireRequest(transaction, input, ["APPROVED"]);
      const revokedAt = new Date();
      const changed = await transaction.workflowCompletionRequest.updateMany({
        where: { id: request.id, projectId: input.projectId, rowVersion: input.expectedRowVersion, status: "APPROVED" },
        data: { status: "RETURNED_FOR_RESUBMISSION", rowVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
      await transaction.projectWorkflowStage.update({
        where: { id: request.projectWorkflowStageId },
        data: { executionStatus: "ACTIVE", actualEndAt: null, rowVersion: { increment: 1 } },
      });
      await addActivity(transaction, input.actor, input.projectId, request.id, "RETURNED", `PMO撤销正式绿色：${input.reason}`);
      await createKeySubIRequestActions(transaction, input.actor, input.projectId, request.projectWorkflowStageId, request.id, "WORKFLOW_COMPLETION_REVOKED_RESUBMISSION", "正式绿色已撤销，请重新提交完成申请", `revoke:${request.rowVersion + 1}`);
      await cascadeFormalRevocation(transaction, input.projectId, request.projectWorkflowStageId, input.actor, revokedAt);
      await addAudit(transaction, input.actor, input.projectId, request.id, "WORKFLOW_FORMAL_COMPLETION_REVOKED", ["status", "downstream_status", "main_stage" ]);
    });
  }

  async activatePlanChange(input: { actor: CollaborationActor; projectId: string; planChangeRequestId: string }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requirePmo(transaction, input.actor);
      const change = await transaction.projectPlanChangeRequest.findFirst({
        where: { id: input.planChangeRequestId, projectId: input.projectId, status: "PENDING_PMO_ACTIVATION", project: { status: "ACTIVE" } },
        include: {
          candidatePlanVersion: {
            include: {
              workflowStageVersions: true,
              workflowStageDependencies: true,
            },
          },
        },
      });
      if (!change) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
      validateWorkflowDependencyGraph(
        change.candidatePlanVersion.workflowStageVersions.map((node) => ({ id: node.projectWorkflowStageId, applicability: node.applicability })),
        change.candidatePlanVersion.workflowStageDependencies.map((edge) => [edge.predecessorProjectWorkflowStageId, edge.successorProjectWorkflowStageId] as const),
      );
      const activatedAt = new Date();
      const activated = await transaction.projectPlanChangeRequest.updateMany({
        where: { id: change.id, status: "PENDING_PMO_ACTIVATION" },
        data: { status: "ACTIVATED", activatedAt, closedAt: activatedAt },
      });
      if (activated.count !== 1) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
      await transaction.projectPlanVersion.updateMany({
        where: { projectPlanId: change.projectPlanId, status: "ACTIVE" },
        data: { status: "SUPERSEDED" },
      });
      await transaction.projectPlanVersion.update({
        where: { id: change.candidatePlanVersionId },
        data: { status: "ACTIVE", activatedAt },
      });
      const notApplicableNodeIds = change.candidatePlanVersion.workflowStageVersions
        .filter(({ applicability }) => applicability === "NOT_APPLICABLE")
        .map(({ projectWorkflowStageId }) => projectWorkflowStageId);
      const requests = notApplicableNodeIds.length ? await transaction.workflowCompletionRequest.findMany({
        where: { projectId: input.projectId, projectWorkflowStageId: { in: notApplicableNodeIds }, status: { in: [...PROCESSING_STATUSES] } },
        include: completionInclude,
      }) : [];
      for (const request of requests) {
        const changed = await transaction.workflowCompletionRequest.updateMany({
          where: { id: request.id, rowVersion: request.rowVersion, status: { in: [...PROCESSING_STATUSES] } },
          data: { status: "TERMINATED_BY_PLAN_CHANGE", terminatedByPlanChangeRequestId: change.id, closedAt: activatedAt, rowVersion: { increment: 1 } },
        });
        if (changed.count !== 1) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
        await closeReviewRound(transaction, request.id, "TERMINATED", input.actor.personId, "正式计划变更将节点调整为不适用", activatedAt);
        await completePmoReviewActions(transaction, request.id, input.actor, "完成申请已因正式计划变更终止", activatedAt);
        await addActivity(transaction, input.actor, input.projectId, request.id, "TERMINATED_BY_PLAN_CHANGE", change.changeReason);
        await notifyKeySubIs(transaction, request, input.actor, "WORKFLOW_COMPLETION_TERMINATED_BY_PLAN_CHANGE", `节点已因计划变更 ${change.id} 调整为不适用，完成申请终止。`);
      }
      await transaction.projectPlanChangeActivity.create({ data: {
        requestId: change.id,
        activityType: "ACTIVATED",
        actorPersonId: input.actor.personId,
        actorRoleCode: "PMO",
        content: change.changeReason,
      } });
      await addAudit(transaction, input.actor, input.projectId, change.id, "PROJECT_PLAN_CHANGE_ACTIVATED", ["active_plan_version", "terminated_completion_requests"]);
    });
  }

  private async runMutation<T>(operation: (transaction: Transaction) => Promise<T>): Promise<T> {
    try {
      return await this.client.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (isDatabaseConflict(error)) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
      throw error;
    }
  }
}

export async function synchronizeWorkflowCompletionIssueGateForNode(
  transaction: Transaction,
  actor: CollaborationActor,
  projectId: string,
  projectWorkflowStageId: string,
): Promise<void> {
  const request = await transaction.workflowCompletionRequest.findFirst({
    where: {
      projectId,
      projectWorkflowStageId,
      status: { in: ["PENDING_PMO_REVIEW", "ISSUE_RESOLUTION_REQUIRED"] },
    },
    orderBy: { createdAt: "desc" },
    include: completionInclude,
  });
  if (request) await synchronizeRequestIssueGate(transaction, request, actor);
}

async function synchronizeRequestIssueGate(
  transaction: Transaction,
  request: CompletionRow,
  actor: CollaborationActor,
): Promise<void> {
  const hasOpenIssue = await openIssueExists(transaction, request.projectId, request.projectWorkflowStageId);
  if (hasOpenIssue && request.status === "PENDING_PMO_REVIEW") {
    const round = request.reviewRounds.find(({ status }) => status === "ACTIVE");
    if (!round) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
    const startedAt = new Date();
    const pauseNo = round.pauses.length + 1;
    await transaction.workflowCompletionReviewPause.create({ data: {
      projectId: request.projectId,
      reviewRoundId: round.id,
      pauseNo,
      pauseReason: "ISSUE_BLOCK",
      startedAt,
    } });
    await transaction.workflowCompletionReviewRound.update({ where: { id: round.id }, data: { status: "PAUSED" } });
    await updateRequestStatus(transaction, request.id, request.rowVersion, "ISSUE_RESOLUTION_REQUIRED", null);
    await completePmoReviewActions(transaction, request.id, actor, "节点存在未关闭问题，审核已暂停", startedAt);
    await addActivity(transaction, actor, request.projectId, request.id, "PAUSED", "存在未关闭问题");
    await notifyKeySubIs(transaction, request, actor, "WORKFLOW_COMPLETION_ISSUE_PAUSED", "完成申请已暂停等待问题解决");
  } else if (!hasOpenIssue && request.status === "ISSUE_RESOLUTION_REQUIRED") {
    const round = request.reviewRounds.find(({ status }) => status === "PAUSED");
    const pause = round?.pauses.find(({ endedAt }) => endedAt === null);
    if (!round || !pause) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
    const endedAt = new Date();
    const pauseMilliseconds = Math.max(0, endedAt.getTime() - pause.startedAt.getTime());
    await transaction.workflowCompletionReviewPause.update({ where: { id: pause.id }, data: { endedAt } });
    await transaction.workflowCompletionReviewRound.update({
      where: { id: round.id },
      data: { status: "ACTIVE", dueAt: new Date(round.dueAt.getTime() + pauseMilliseconds) },
    });
    await updateRequestStatus(transaction, request.id, request.rowVersion, "PENDING_PMO_REVIEW", null);
    await createPmoReviewActions(transaction, request.projectId, request.projectWorkflowStageId, request.id, round.id, actor, `resume-${pause.pauseNo}`);
    await addActivity(transaction, actor, request.projectId, request.id, "RESUMED", "开放问题已全部关闭");
    await notifyKeySubIs(transaction, request, actor, "WORKFLOW_COMPLETION_ISSUE_RESUMED", "完成申请已恢复 PMO审核");
  }
  await addAudit(transaction, actor, request.projectId, request.id, "WORKFLOW_COMPLETION_ISSUE_GATE_SYNCHRONIZED", ["status", "review_pause"]);
}

const completionInclude = {
  currentSubmission: { include: { businessAttachments: { include: { fileAsset: true } } } },
  submissions: { orderBy: { submissionNo: "asc" as const }, include: { businessAttachments: { include: { fileAsset: true } } } },
  supplements: { orderBy: { addedAt: "asc" as const }, include: { businessAttachments: { include: { fileAsset: true } } } },
  reviewRounds: {
    orderBy: { roundNo: "desc" as const },
    include: { pauses: { orderBy: { pauseNo: "asc" as const } } },
  },
  activities: { orderBy: [{ createdAt: "desc" as const }, { sequenceNo: "desc" as const }], take: 1 },
} satisfies Prisma.WorkflowCompletionRequestInclude;

type CompletionRow = Prisma.WorkflowCompletionRequestGetPayload<{ include: typeof completionInclude }>;

function mapCompletion(request: CompletionRow): WorkflowCompletionRecord {
  const current = request.currentSubmission;
  if (!current) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
  const round = request.reviewRounds[0] ?? null;
  const now = Date.now();
  const openPause = round?.pauses.slice().reverse().find(({ endedAt }) => endedAt === null);
  const remainingAt = round?.status === "PAUSED" && openPause
    ? openPause.startedAt.getTime()
    : now;
  return {
    id: request.id,
    projectId: request.projectId,
    projectWorkflowStageId: request.projectWorkflowStageId,
    status: request.status,
    rowVersion: request.rowVersion,
    attachmentRequirement: request.attachmentRequirementSnapshot,
    submissionNo: current.submissionNo,
    progressSummary: current.progressSummarySnapshot,
    basis: current.basisSnapshot,
    expectedCompletionDate: current.expectedCompletionDateSnapshot?.toISOString().slice(0, 10) ?? null,
    submittedByPersonId: current.submittedByPersonId,
    submittedAt: current.submittedAt.toISOString(),
    lastActivityAt: request.activities[0]?.createdAt.toISOString() ?? current.submittedAt.toISOString(),
    supplements: request.supplements.map((item) => ({
      id: item.id,
      content: item.content,
      addedByPersonId: item.addedByPersonId,
      addedAt: item.addedAt.toISOString(),
    })),
    attachments: [
      ...request.submissions.flatMap((submission) => submission.businessAttachments
        .filter(({ fileAsset }) => fileAsset.status === "AVAILABLE")
        .map(({ fileAsset }) => ({ assetId: fileAsset.id, fileName: fileAsset.originalFileName, sizeBytes: Number(fileAsset.sizeBytes), source: "SUBMISSION" as const }))),
      ...request.supplements.flatMap((supplement) => supplement.businessAttachments
        .filter(({ fileAsset }) => fileAsset.status === "AVAILABLE")
        .map(({ fileAsset }) => ({ assetId: fileAsset.id, fileName: fileAsset.originalFileName, sizeBytes: Number(fileAsset.sizeBytes), source: "SUPPLEMENT" as const }))),
    ],
    reviewRound: round ? {
      id: round.id,
      roundNo: round.roundNo,
      status: round.status,
      startedAt: round.startedAt.toISOString(),
      dueAt: round.dueAt.toISOString(),
      remainingMilliseconds: Math.max(0, round.dueAt.getTime() - remainingAt),
    } : null,
  };
}

async function requireRequest(
  transaction: Transaction,
  input: WorkflowCompletionMutationInput,
  statuses: readonly CompletionRow["status"][],
): Promise<CompletionRow> {
  const request = await transaction.workflowCompletionRequest.findFirst({
    where: { id: input.completionRequestId, projectId: input.projectId, rowVersion: input.expectedRowVersion, status: { in: [...statuses] } },
    include: completionInclude,
  });
  if (!request) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
  return request;
}

async function createReviewRound(transaction: Transaction, projectId: string, nodeId: string, requestId: string, roundNo: number, startedAt: Date, actor: CollaborationActor): Promise<void> {
  const project = await transaction.collaborationTimeLimitSetting.findUnique({
    where: { projectId_responsibilityType: { projectId, responsibilityType: "WORKFLOW_COMPLETION_PMO_REVIEW" } },
  });
  const setting = project ?? await transaction.collaborationTimeLimitSetting.findFirst({
    where: { projectId: null, responsibilityType: "WORKFLOW_COMPLETION_PMO_REVIEW" },
  });
  if (!setting) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
  const round = await transaction.workflowCompletionReviewRound.create({ data: {
    projectId,
    completionRequestId: requestId,
    roundNo,
    status: "ACTIVE",
    timeLimitDaysSnapshot: setting.timeLimitDays,
    reminderIntervalDaysSnapshot: setting.reminderIntervalDays,
    startedAt,
    dueAt: addUtcDays(startedAt, setting.timeLimitDays),
  } });
  await createPmoReviewActions(transaction, projectId, nodeId, requestId, round.id, actor);
}

async function predecessorStatuses(transaction: Transaction, request: CompletionRow) {
  const dependencies = await transaction.projectWorkflowStageDependencyVersion.findMany({
    where: {
      projectId: request.projectId,
      projectPlanVersionId: request.submittedPlanVersionId,
      successorProjectWorkflowStageId: request.projectWorkflowStageId,
    },
    include: { predecessor: { select: { executionStatus: true } } },
  });
  return dependencies.map(({ predecessor }) => predecessor.executionStatus);
}

async function openIssueExists(transaction: Transaction, projectId: string, nodeId: string): Promise<boolean> {
  return (await transaction.issue.count({ where: {
    projectId,
    projectWorkflowStageId: nodeId,
    resolvedAt: null,
    closedAt: null,
  } })) > 0;
}

async function updateRequestStatus(transaction: Transaction, id: string, rowVersion: number, status: CompletionRow["status"], closedAt: Date | null): Promise<void> {
  const result = await transaction.workflowCompletionRequest.updateMany({
    where: { id, rowVersion },
    data: { status, closedAt, rowVersion: { increment: 1 } },
  });
  if (result.count !== 1) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
}

async function bumpRequest(transaction: Transaction, id: string, rowVersion: number): Promise<void> {
  const result = await transaction.workflowCompletionRequest.updateMany({ where: { id, rowVersion }, data: { rowVersion: { increment: 1 } } });
  if (result.count !== 1) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
}

async function closeReviewRound(transaction: Transaction, requestId: string, status: "APPROVED" | "RETURNED" | "TERMINATED", personId: string, comment: string, now: Date): Promise<void> {
  await transaction.workflowCompletionReviewRound.updateMany({
    where: { completionRequestId: requestId, status: { in: ["ACTIVE", "PAUSED"] } },
    data: { status, completedAt: now, completedByPersonId: personId, decisionComment: comment },
  });
}

async function closeRequest(transaction: Transaction, request: CompletionRow, status: "WITHDRAWN" | "RETURNED_FOR_RESUBMISSION", rowVersion: number, actor: CollaborationActor, reason: string): Promise<void> {
  const now = new Date();
  await updateRequestStatus(transaction, request.id, rowVersion, status, status === "WITHDRAWN" ? now : null);
  await closeReviewRound(transaction, request.id, status === "WITHDRAWN" ? "TERMINATED" : "RETURNED", actor.personId, reason, now);
  await transaction.projectWorkflowStage.update({
    where: { id: request.projectWorkflowStageId },
    data: { executionStatus: "ACTIVE", actualEndAt: null, rowVersion: { increment: 1 } },
  });
  await addActivity(transaction, actor, request.projectId, request.id, status === "WITHDRAWN" ? "WITHDRAWN" : "RETURNED", reason);
}

async function cascadePredecessorLoss(transaction: Transaction, projectId: string, predecessorId: string, actor: CollaborationActor): Promise<void> {
  const queue = [predecessorId];
  const visited = new Set(queue);
  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    const edges = await transaction.projectWorkflowStageDependencyVersion.findMany({
      where: { projectId, predecessorProjectWorkflowStageId: current, projectPlanVersion: { status: "ACTIVE" } },
      select: { successorProjectWorkflowStageId: true },
    });
    for (const { successorProjectWorkflowStageId } of edges) {
      if (!visited.has(successorProjectWorkflowStageId)) {
        visited.add(successorProjectWorkflowStageId);
        queue.push(successorProjectWorkflowStageId);
      }
      await transaction.projectWorkflowStage.updateMany({
        where: { id: successorProjectWorkflowStageId, executionStatus: { not: "COMPLETED" } },
        data: { executionStatus: "NOT_STARTED", nextUpdateDueDate: null, rowVersion: { increment: 1 } },
      });
      const affected = await transaction.workflowCompletionRequest.findMany({
        where: { projectWorkflowStageId: successorProjectWorkflowStageId, status: { in: [...PROCESSING_STATUSES] } },
        select: { id: true },
      });
      for (const request of affected) {
        await transaction.workflowCompletionRequest.update({ where: { id: request.id }, data: { status: "PREDECESSOR_RETURNED_CONFIRMATION", rowVersion: { increment: 1 } } });
        await transaction.workflowCompletionReviewRound.updateMany({ where: { completionRequestId: request.id, status: "ACTIVE" }, data: { status: "PAUSED" } });
        await addActivity(transaction, actor, projectId, request.id, "PAUSED", "直接或间接前置节点失效");
      }
    }
  }
}

async function cascadeFormalRevocation(transaction: Transaction, projectId: string, predecessorId: string, actor: CollaborationActor, revokedAt: Date): Promise<void> {
  const queue = [predecessorId];
  const visited = new Set(queue);
  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    const edges = await transaction.projectWorkflowStageDependencyVersion.findMany({
      where: { projectId, predecessorProjectWorkflowStageId: current, projectPlanVersion: { status: "ACTIVE" } },
      select: { successorProjectWorkflowStageId: true },
    });
    for (const { successorProjectWorkflowStageId } of edges) {
      if (!visited.has(successorProjectWorkflowStageId)) {
        visited.add(successorProjectWorkflowStageId);
        queue.push(successorProjectWorkflowStageId);
      }
      await transaction.projectWorkflowStage.update({
        where: { id: successorProjectWorkflowStageId },
        data: { executionStatus: "NOT_STARTED", actualEndAt: null, nextUpdateDueDate: null, rowVersion: { increment: 1 } },
      });
      const affected = await transaction.workflowCompletionRequest.findFirst({
        where: {
          projectId,
          projectWorkflowStageId: successorProjectWorkflowStageId,
          status: { in: [...PROCESSING_STATUSES, "APPROVED"] },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!affected) continue;
      await transaction.workflowCompletionRequest.update({
        where: { id: affected.id },
        data: { status: "PREDECESSOR_RETURNED_CONFIRMATION", rowVersion: { increment: 1 } },
      });
      await transaction.workflowCompletionReviewRound.updateMany({
        where: { completionRequestId: affected.id, status: "ACTIVE" },
        data: { status: "PAUSED" },
      });
      await completePmoReviewActions(transaction, affected.id, actor, "上游正式绿色已撤销，等待 Key Sub-I重新确认", revokedAt);
      await addActivity(transaction, actor, projectId, affected.id, "PAUSED", "上游正式绿色撤销导致直接或间接前置失效");
      await createKeySubIRequestActions(transaction, actor, projectId, successorProjectWorkflowStageId, affected.id, "WORKFLOW_COMPLETION_PREDECESSOR_RECONFIRMATION_REQUIRED", "前置正式状态失效，请重新确认完成申请", `revoke:${affected.rowVersion + 1}`);
    }
  }
}

async function activateEligibleWaitingRequests(transaction: Transaction, projectId: string, predecessorId: string, now: Date): Promise<void> {
  const edges = await transaction.projectWorkflowStageDependencyVersion.findMany({
    where: { projectId, predecessorProjectWorkflowStageId: predecessorId, projectPlanVersion: { status: "ACTIVE" } },
    select: { successorProjectWorkflowStageId: true },
  });
  for (const edge of edges) {
    const waiting = await transaction.workflowCompletionRequest.findFirst({
      where: { projectId, projectWorkflowStageId: edge.successorProjectWorkflowStageId, status: "WAITING_FOR_PREDECESSOR" },
      include: completionInclude,
    });
    if (!waiting) continue;
    const statuses = await predecessorStatuses(transaction, waiting);
    if (statuses.some((status) => status !== "COMPLETED")) continue;
    const hasOpenIssue = await openIssueExists(transaction, projectId, waiting.projectWorkflowStageId);
    const status = hasOpenIssue ? "ISSUE_RESOLUTION_REQUIRED" : "PENDING_PMO_REVIEW";
    await transaction.workflowCompletionRequest.update({ where: { id: waiting.id }, data: { status, rowVersion: { increment: 1 } } });
    if (status === "PENDING_PMO_REVIEW") await createReviewRound(transaction, projectId, waiting.projectWorkflowStageId, waiting.id, waiting.reviewRounds.length + 1, now, {
      personId: waiting.currentSubmission?.submittedByPersonId ?? waiting.submissions[0]?.submittedByPersonId ?? "",
      roleCode: "KEY_SUB_I",
      sessionId: "SYSTEM_DEPENDENCY_ADVANCE",
    });
  }
}

async function createPmoReviewActions(
  transaction: Transaction,
  projectId: string,
  nodeId: string,
  requestId: string,
  roundId: string,
  actor: CollaborationActor,
  occurrence = "initial",
): Promise<void> {
  const recipients = await transaction.roleAssignment.findMany({
    where: { roleCode: "PMO", projectId: null, assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } },
    distinct: ["personId"],
    select: { personId: true },
  });
  const actionGroupKey = `workflow-completion-review:${roundId}:${occurrence}`;
  if (recipients.length) await transaction.notification.createMany({ data: recipients.map(({ personId }) => ({
    recipientPersonId: personId,
    recipientRoleCode: "PMO" as const,
    notificationType: "WORKFLOW_REVIEW_NOTICE" as const,
    eventCode: "WORKFLOW_COMPLETION_REVIEW_REQUIRED",
    triggeredByPersonId: actor.personId || null,
    triggeredByRoleCode: actor.roleCode,
    projectId,
    projectWorkflowStageId: nodeId,
    workflowCompletionRequestId: requestId,
    workflowCompletionReviewRoundId: roundId,
    title: "节点完成申请待审核",
    content: "一个节点完成申请已进入 PMO共享审核队列。",
    eventKey: `${actionGroupKey}:${personId}`,
    messageKind: "ACTION" as const,
    actionStatus: "PENDING" as const,
    actionGroupKey,
  })), skipDuplicates: true });
}

async function createKeySubIRequestActions(
  transaction: Transaction,
  actor: CollaborationActor,
  projectId: string,
  nodeId: string,
  requestId: string,
  eventCode: string,
  content: string,
  occurrence: string,
): Promise<void> {
  const recipients = await transaction.roleAssignment.findMany({
    where: { projectId, roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } },
    distinct: ["personId"],
    select: { personId: true },
  });
  const actionGroupKey = `workflow-completion-key-action:${requestId}:${occurrence}`;
  if (recipients.length) await transaction.notification.createMany({ data: recipients.map(({ personId }) => ({
    recipientPersonId: personId,
    recipientRoleCode: "KEY_SUB_I" as const,
    notificationType: "WORKFLOW_REVIEW_NOTICE" as const,
    eventCode,
    triggeredByPersonId: actor.personId,
    triggeredByRoleCode: actor.roleCode,
    projectId,
    projectWorkflowStageId: nodeId,
    workflowCompletionRequestId: requestId,
    title: "节点完成申请需要处理",
    content,
    eventKey: `${actionGroupKey}:${personId}`,
    messageKind: "ACTION" as const,
    actionStatus: "PENDING" as const,
    actionGroupKey,
  })), skipDuplicates: true });
}

async function notifyKeySubIs(
  transaction: Transaction,
  request: CompletionRow,
  actor: CollaborationActor,
  eventCode: string,
  content: string,
): Promise<void> {
  const recipients = await transaction.roleAssignment.findMany({
    where: { projectId: request.projectId, roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } },
    distinct: ["personId"],
    select: { personId: true },
  });
  if (recipients.length) await transaction.notification.createMany({ data: recipients.map(({ personId }) => ({
    recipientPersonId: personId,
    recipientRoleCode: "KEY_SUB_I" as const,
    notificationType: "WORKFLOW_REVIEW_NOTICE" as const,
    eventCode,
    triggeredByPersonId: actor.personId,
    triggeredByRoleCode: actor.roleCode,
    projectId: request.projectId,
    projectWorkflowStageId: request.projectWorkflowStageId,
    workflowCompletionRequestId: request.id,
    title: "节点完成申请状态更新",
    content,
    eventKey: `${eventCode}:${request.id}:${request.rowVersion + 1}:${personId}`,
    messageKind: "INFORMATIONAL" as const,
    actionStatus: "NOT_APPLICABLE" as const,
  })), skipDuplicates: true });
}

async function completePmoReviewActions(
  transaction: Transaction,
  requestId: string,
  actor: CollaborationActor,
  result: string,
  completedAt: Date,
): Promise<void> {
  const actions = await transaction.notification.findMany({
    where: { workflowCompletionRequestId: requestId, messageKind: "ACTION", actionStatus: "PENDING", actionGroupKey: { not: null } },
    select: { recipientPersonId: true, projectId: true, projectWorkflowStageId: true, workflowCompletionReviewRoundId: true, actionGroupKey: true },
  });
  const groupKey = actions[0]?.actionGroupKey;
  if (!groupKey) return;
  await transaction.notification.updateMany({
    where: { actionGroupKey: groupKey, actionStatus: "PENDING" },
    data: { actionStatus: "COMPLETED", actionCompletedAt: completedAt, actionCompletionReason: result },
  });
  const others = actions.filter(({ recipientPersonId }) => recipientPersonId !== actor.personId);
  if (others.length) await transaction.notification.createMany({ data: others.map((action) => ({
    recipientPersonId: action.recipientPersonId,
    recipientRoleCode: "PMO" as const,
    notificationType: "WORKFLOW_REVIEW_NOTICE" as const,
    eventCode: "WORKFLOW_COMPLETION_REVIEW_RESULT",
    triggeredByPersonId: actor.personId,
    triggeredByRoleCode: actor.roleCode,
    projectId: action.projectId,
    projectWorkflowStageId: action.projectWorkflowStageId,
    workflowCompletionRequestId: requestId,
    workflowCompletionReviewRoundId: action.workflowCompletionReviewRoundId,
    title: "节点完成审核已由其他 PMO处理",
    content: result,
    eventKey: `${groupKey}:result:${action.recipientPersonId}`,
    messageKind: "INFORMATIONAL" as const,
    actionStatus: "NOT_APPLICABLE" as const,
  })), skipDuplicates: true });
}

type DraftAsset = { projectId: string; projectWorkflowStageId: string | null; draftId: string; rowVersion: number; visibilityScope: "PROJECT_SHARED" | "PMO_ONLY" | "PMO_AND_DEAN" | "ISSUE_PARTICIPANTS"; purposeCode: string; assetId: string };

async function completionDraftAssets(transaction: Transaction, input: SubmitWorkflowCompletionInput & { actor: CollaborationActor }, requirement: "NONE" | "OPTIONAL" | "REQUIRED"): Promise<DraftAsset[]> {
  if (requirement === "NONE" && input.attachmentDraftIds.length) throw new CollaborationError("WORKFLOW_COMPLETION_INVALID_INPUT");
  const assets = await loadDraftAssets(
    transaction,
    input,
    "WORKFLOW_COMPLETION_SUBMISSION",
    input.projectWorkflowStageId,
  );
  if (requirement === "REQUIRED" && assets.length < 1) throw new CollaborationError("WORKFLOW_COMPLETION_ATTACHMENT_REQUIRED");
  return assets;
}

async function completionSupplementDraftAssets(transaction: Transaction, input: WorkflowCompletionMutationInput & { actor: CollaborationActor; attachmentDraftIds: string[] }, projectWorkflowStageId: string): Promise<DraftAsset[]> {
  return loadDraftAssets(transaction, input, "WORKFLOW_COMPLETION_SUPPLEMENT", projectWorkflowStageId);
}

async function loadDraftAssets(transaction: Transaction, input: { projectId: string; actor: CollaborationActor; attachmentDraftIds: string[] }, parentType: "WORKFLOW_COMPLETION_SUBMISSION" | "WORKFLOW_COMPLETION_SUPPLEMENT", projectWorkflowStageId: string): Promise<DraftAsset[]> {
  if (!input.attachmentDraftIds.length) return [];
  const drafts = await transaction.attachmentDraft.findMany({
    where: { id: { in: input.attachmentDraftIds }, projectId: input.projectId, parentType, uploaderPersonId: input.actor.personId, uploaderRoleCode: input.actor.roleCode, status: "OPEN", expiresAt: { gt: new Date() } },
    include: { uploadSessions: { include: { fileAssets: { where: { status: "AVAILABLE", businessAttachment: null } } } } },
  });
  if (drafts.length !== input.attachmentDraftIds.length) throw new CollaborationError("WORKFLOW_COMPLETION_INVALID_INPUT");
  if (drafts.some((draft) => draft.projectWorkflowStageId !== projectWorkflowStageId)) {
    throw new CollaborationError("WORKFLOW_COMPLETION_INVALID_INPUT");
  }
  return drafts.flatMap((draft) => draft.uploadSessions.flatMap((session) => session.fileAssets.map((asset) => ({ projectId: draft.projectId, projectWorkflowStageId: draft.projectWorkflowStageId, draftId: draft.id, rowVersion: draft.rowVersion, visibilityScope: draft.visibilityScope, purposeCode: draft.purposeCode, assetId: asset.id }))));
}

async function claimDrafts(transaction: Transaction, assets: DraftAsset[], parentId: string, at: Date): Promise<void> {
  for (const draft of new Map(assets.map((asset) => [asset.draftId, asset])).values()) {
    const claimed = await transaction.attachmentDraft.updateMany({ where: { id: draft.draftId, rowVersion: draft.rowVersion, status: "OPEN" }, data: { status: "SUBMITTED", submittedParentId: parentId, lastActivityAt: at, rowVersion: { increment: 1 } } });
    if (claimed.count !== 1) throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
  }
}

async function bindDraftAssets(transaction: Transaction, assets: DraftAsset[], actor: CollaborationActor, submissionId: string, at: Date): Promise<void> {
  await claimDrafts(transaction, assets, submissionId, at);
  if (assets.length) await transaction.businessAttachment.createMany({ data: assets.map((asset) => ({ projectId: asset.projectId, fileAssetId: asset.assetId, parentType: "WORKFLOW_COMPLETION_SUBMISSION", visibilityScope: asset.visibilityScope, purposeCode: asset.purposeCode, attachedByPersonId: actor.personId, attachedRoleCode: actor.roleCode, attachedAt: at, workflowCompletionSubmissionId: submissionId })) });
}

async function bindSupplementAssets(transaction: Transaction, assets: DraftAsset[], actor: CollaborationActor, supplementId: string, at: Date): Promise<void> {
  await claimDrafts(transaction, assets, supplementId, at);
  if (assets.length) {
    const rows = await transaction.fileAsset.findMany({ where: { id: { in: assets.map((asset) => asset.assetId) } }, select: { id: true, projectId: true } });
    await transaction.businessAttachment.createMany({ data: rows.map((row) => { const asset = assets.find((item) => item.assetId === row.id)!; return { projectId: row.projectId, fileAssetId: row.id, parentType: "WORKFLOW_COMPLETION_SUPPLEMENT" as const, visibilityScope: asset.visibilityScope, purposeCode: asset.purposeCode, attachedByPersonId: actor.personId, attachedRoleCode: actor.roleCode, attachedAt: at, workflowCompletionSupplementId: supplementId }; }) });
  }
}

async function addActivity(transaction: Transaction, actor: CollaborationActor, projectId: string, requestId: string, activityType: Prisma.WorkflowCompletionActivityCreateInput["activityType"], content: string): Promise<void> {
  const latest = await transaction.workflowCompletionActivity.aggregate({ where: { completionRequestId: requestId }, _max: { sequenceNo: true } });
  await transaction.workflowCompletionActivity.create({ data: { projectId, completionRequestId: requestId, sequenceNo: (latest._max.sequenceNo ?? 0) + 1, activityType, actorPersonId: actor.personId, actorRoleCode: actor.roleCode, content } });
}

async function addAudit(transaction: Transaction, actor: CollaborationActor, projectId: string, entityId: string, actionCode: string, changedFields: string[]): Promise<void> {
  await transaction.auditLog.create({ data: { actorPersonId: actor.personId, actorRoleCode: actor.roleCode, sessionId: actor.sessionId, actionCode, result: "SUCCESS", projectId, entityType: "WORKFLOW_COMPLETION_REQUEST", entityId, summary: "处理节点完成申请", changedFields, correlationId: randomUUID() } });
}

async function requireWritableKeySubI(client: DatabaseClient, actor: CollaborationActor, projectId: string) {
  if (actor.roleCode !== "KEY_SUB_I") throw new CollaborationError("COLLABORATION_FORBIDDEN");
  await requireActiveSession(client, actor);
  const assignment = await client.roleAssignment.findFirst({ where: { personId: actor.personId, roleCode: "KEY_SUB_I", projectId, assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" }, project: { status: "ACTIVE" } }, select: { isPrimary: true } });
  if (!assignment) throw new CollaborationError("COLLABORATION_FORBIDDEN");
  return assignment;
}

async function requirePmo(client: DatabaseClient, actor: CollaborationActor): Promise<void> {
  if (actor.roleCode !== "PMO") throw new CollaborationError("COLLABORATION_FORBIDDEN");
  await requireActiveSession(client, actor);
  const assignment = await client.roleAssignment.findFirst({ where: { personId: actor.personId, roleCode: "PMO", projectId: null, assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } }, select: { id: true } });
  if (!assignment) throw new CollaborationError("COLLABORATION_FORBIDDEN");
}

async function requireReadableProject(client: DatabaseClient, actor: CollaborationActor, projectId: string): Promise<void> {
  await requireActiveSession(client, actor);
  if (actor.roleCode === "PMO" || actor.roleCode === "DEAN") {
    const assignment = await client.roleAssignment.findFirst({ where: { personId: actor.personId, roleCode: actor.roleCode, projectId: null, assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } }, select: { id: true } });
    if (!assignment) throw new CollaborationError("COLLABORATION_FORBIDDEN");
  } else if (actor.roleCode === "KEY_SUB_I") {
    const assignment = await client.roleAssignment.findFirst({ where: { personId: actor.personId, roleCode: "KEY_SUB_I", projectId, assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } }, select: { id: true } });
    if (!assignment) throw new CollaborationError("PROJECT_NOT_FOUND");
  }
  const project = await client.project.findFirst({ where: { id: projectId, projectCode: { not: null }, status: { in: ["ACTIVE", "CLOSING", "COMPLETED", "ARCHIVED"] } }, select: { id: true } });
  if (!project) throw new CollaborationError("PROJECT_NOT_FOUND");
}

async function requireActiveSession(client: DatabaseClient, actor: CollaborationActor): Promise<void> {
  const session = await client.session.findFirst({ where: { id: actor.sessionId, personId: actor.personId, activeRoleCode: actor.roleCode, revokedAt: null, expiresAt: { gt: new Date() }, person: { accountStatus: "ACTIVE" } }, select: { id: true } });
  if (!session) throw new CollaborationError("COLLABORATION_FORBIDDEN");
}

function addUtcDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function isDatabaseConflict(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error.code === "P2002" || error.code === "P2034"));
}
