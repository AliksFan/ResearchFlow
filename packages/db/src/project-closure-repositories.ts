import { randomUUID } from "node:crypto";

import { MAX_ATTACHMENT_FILE_COUNT, MAX_ATTACHMENT_TOTAL_BYTES } from "@researchflow/attachments";

import {
  CollaborationError,
  deriveProjectCompletionGateReasons,
  type ArchiveProjectInput,
  type CollaborationActor,
  type CompletionMutationInput,
  type ProjectClosureRepository,
  type ProjectCompletionListItem,
  type ProjectCompletionMaterials,
  type SubmitProjectCompletionInput,
} from "@researchflow/collaboration";

import type { Prisma } from "../generated/client.js";
import type { ApplicationPrismaClient } from "./client.js";

type Transaction = Prisma.TransactionClient;
type DatabaseClient = ApplicationPrismaClient | Transaction;

export class PrismaProjectClosureRepository implements ProjectClosureRepository {
  constructor(private readonly client: ApplicationPrismaClient) {}

  async getState(actor: CollaborationActor, projectId: string) {
    return this.client.$transaction(async (tx) => {
      await requireReadableProject(tx, actor, projectId);
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { status: true, rowVersion: true } });
      const rows = await tx.projectCompletionRequest.findMany({
        where: { projectId }, orderBy: { createdAt: "desc" },
        include: {
          currentSubmissionVersion: true,
          blocks: { where: { clearedAt: null }, orderBy: { openedAt: "asc" } },
          activities: { where: { activityType: "RETURNED" }, orderBy: { createdAt: "desc" }, take: 1, select: { content: true } },
        },
      });
      const requests: ProjectCompletionListItem[] = rows.map((row) => ({
        completionRequestId: row.id, projectId, projectStatus: project.status as ProjectCompletionListItem["projectStatus"],
        status: row.status, rowVersion: row.rowVersion, currentSubmissionVersionNo: row.currentSubmissionVersion?.versionNo ?? 0,
        currentReturnReason: row.status === "CLOSURE_RETURNED_FOR_SUPPLEMENT" ? row.activities[0]?.content ?? null : null,
        gateReasons: row.blocks.map((block) => block.blockType === "GOVERNANCE_MATERIAL_MISSING"
          ? { code: block.blockType, field: (block.checkCode ?? "completionSummary") as keyof ProjectCompletionMaterials }
          : { code: block.blockType, sourceId: block.sourceWorkflowStageId ?? block.sourceIssueId ?? block.id }),
      }));
      const primary = actor.roleCode === "KEY_SUB_I" && await primaryKeySubI(tx, projectId) === actor.personId;
      return { projectId, projectStatus: project.status as "ACTIVE" | "CLOSING" | "COMPLETED" | "ARCHIVED", projectRowVersion: project.rowVersion, isPrimaryKeySubI: primary, requests };
    }, { isolationLevel: "Serializable" });
  }

  async checkInitialReadiness(
    actor: CollaborationActor & { roleCode: "KEY_SUB_I" },
    projectId: string,
  ) {
    return this.client.$transaction(async (tx) => {
      await requirePrimaryKeySubI(tx, actor, projectId);
      const project = await tx.project.findFirst({
        where: { id: projectId, status: "ACTIVE" },
        select: { rowVersion: true },
      });
      if (!project) conflict();
      const nodes = await incompleteRequiredNodes(tx, projectId);
      const issues = await openIssues(tx, projectId);
      return {
        projectId,
        projectRowVersion: project.rowVersion,
        incompleteRequiredWorkflowStageIds: nodes.map(({ id }) => id),
        openIssueIds: issues.map(({ id }) => id),
        readyForMaterials: nodes.length === 0 && issues.length === 0,
      };
    }, { isolationLevel: "Serializable" });
  }

  async submit(input: SubmitProjectCompletionInput & { actor: CollaborationActor & { roleCode: "KEY_SUB_I" } }) {
    return this.run(async (tx) => {
      await requirePrimaryKeySubI(tx, input.actor, input.projectId);
      const project = await tx.project.findFirst({ where: { id: input.projectId, status: "ACTIVE", rowVersion: input.expectedProjectRowVersion }, select: { id: true } });
      if (!project) conflict();
      const reasons = await completionGateReasons(tx, input.projectId, input);
      if (reasons.length) throw new CollaborationError("PROJECT_CLOSURE_BLOCKED");
      const active = await tx.projectCompletionRequest.findFirst({ where: { projectId: input.projectId, status: { in: ["CLOSURE_BLOCKED", "CLOSURE_PENDING_PMO_REVIEW", "CLOSURE_RETURNED_FOR_SUPPLEMENT"] } } });
      if (active) conflict();
      const now = new Date();
      const assets = await loadClosureDraftAssets(tx, input, null);
      const request = await tx.projectCompletionRequest.create({ data: { projectId: input.projectId, status: "CLOSURE_PENDING_PMO_REVIEW" } });
      const submission = await createSubmission(tx, input.actor, request.id, input.projectId, 1, input, now);
      await bindClosureDraftAssets(tx, input.actor, assets, request.id, submission.id, now);
      await tx.projectCompletionRequest.update({ where: { id: request.id }, data: { currentSubmissionVersionId: submission.id } });
      const round = await createReviewRound(tx, input.actor, request.id, input.projectId, 1, now);
      const completionActivity = await createCompletionActivity(tx, input.actor, request.id, input.projectId, "SUBMITTED", "主 Key Sub-I已提交结题申请", now);
      const changed = await tx.project.updateMany({ where: { id: input.projectId, status: "ACTIVE", rowVersion: input.expectedProjectRowVersion }, data: { status: "CLOSING", rowVersion: { increment: 1 } } });
      if (changed.count !== 1) conflict();
      await notifyPmos(tx, input.actor, input.projectId, request.id, completionActivity.id, round.id, "PROJECT_COMPLETION_REVIEW_REQUIRED", "项目结题待复核", "主 Key Sub-I已提交结题申请。", input.commandId, true);
      await audit(tx, input.actor, input.projectId, request.id, "PROJECT_COMPLETION_SUBMITTED", ["status", "current_submission_version_id"]);
      return { completionRequestId: request.id, status: "CLOSURE_PENDING_PMO_REVIEW" as const, rowVersion: 0 };
    });
  }

  async returnForSupplement(input: CompletionMutationInput & { actor: CollaborationActor & { roleCode: "PMO" }; reason: string }) {
    await this.run(async (tx) => {
      await requirePmo(tx, input.actor); const request = await requestForUpdate(tx, input, "CLOSURE_PENDING_PMO_REVIEW"); const now = new Date();
      await endActiveReview(tx, request.id, "RETURNED", input.actor.personId, input.reason, now);
      const primary = await primaryKeySubI(tx, input.projectId);
      const limit = await timeLimit(tx, input.projectId, "PROJECT_COMPLETION_SUPPLEMENT");
      await tx.projectCompletionSupplementRound.create({ data: { projectId: input.projectId, completionRequestId: request.id, roundNo: await nextSupplementNo(tx, request.id), responsiblePersonId: primary, timeLimitDaysSnapshot: limit.timeLimitDays, reminderIntervalDaysSnapshot: limit.reminderIntervalDays, startedAt: now, dueAt: addDays(now, limit.timeLimitDays) } });
      await bumpRequest(tx, request.id, input.expectedRowVersion, { status: "CLOSURE_RETURNED_FOR_SUPPLEMENT" });
      const event = await createCompletionActivity(tx, input.actor, request.id, input.projectId, "RETURNED", input.reason, now);
      await completeCompletionActions(tx, request.id, input.actor, input.reason, now);
      await notifyPeople(tx, input.actor, input.projectId, request.id, event.id, null, [{ personId: primary, roleCode: "KEY_SUB_I" }], "PROJECT_COMPLETION_SUPPLEMENT_REQUIRED", "结题材料需补充", input.reason, input.commandId, true);
      await audit(tx, input.actor, input.projectId, request.id, "PROJECT_COMPLETION_RETURNED", ["status"]);
    });
  }

  async resubmit(input: CompletionMutationInput & ProjectCompletionMaterials & { actor: CollaborationActor & { roleCode: "KEY_SUB_I" }; attachmentDraftIds: string[] }) {
    await this.run(async (tx) => {
      await requirePrimaryKeySubI(tx, input.actor, input.projectId); const request = await requestForUpdate(tx, input, "CLOSURE_RETURNED_FOR_SUPPLEMENT");
      const assets = await loadClosureDraftAssets(tx, input, request.id);
      const reasons = await completionGateReasons(tx, input.projectId, input);
      const now = new Date(); const versionNo = (await tx.projectCompletionSubmissionVersion.count({ where: { completionRequestId: request.id } })) + 1;
      const submission = await createSubmission(tx, input.actor, request.id, input.projectId, versionNo, input, now);
      await bindClosureDraftAssets(tx, input.actor, assets, request.id, submission.id, now);
      await tx.projectCompletionSupplementRound.updateMany({ where: { completionRequestId: request.id, completedAt: null }, data: { completedAt: now, completionReason: "RESUBMITTED" } });
      const nextStatus = reasons.length ? "CLOSURE_BLOCKED" : "CLOSURE_PENDING_PMO_REVIEW";
      await bumpRequest(tx, request.id, input.expectedRowVersion, { status: nextStatus });
      await tx.projectCompletionRequest.update({ where: { id: request.id }, data: { currentSubmissionVersionId: submission.id } });
      await syncBlocks(tx, request.id, input.projectId, reasons, now);
      let roundId: string | null = null;
      if (!reasons.length) roundId = (await createReviewRound(tx, input.actor, request.id, input.projectId, await nextReviewNo(tx, request.id), now)).id;
      const event = await createCompletionActivity(tx, input.actor, request.id, input.projectId, "RESUBMITTED", "主 Key Sub-I已补充并重提结题材料", now);
      if (roundId) await notifyPmos(tx, input.actor, input.projectId, request.id, event.id, roundId, "PROJECT_COMPLETION_REVIEW_REQUIRED", "项目结题待复核", "结题材料已补充并重提。", input.commandId, true);
      await audit(tx, input.actor, input.projectId, request.id, "PROJECT_COMPLETION_RESUBMITTED", ["status", "current_submission_version_id"]);
    });
  }

  async withdraw(input: CompletionMutationInput & { actor: CollaborationActor & { roleCode: "KEY_SUB_I" }; reason: string }) {
    await this.run(async (tx) => {
      await requirePrimaryKeySubI(tx, input.actor, input.projectId); const request = await requestForAnyUpdate(tx, input, ["CLOSURE_BLOCKED", "CLOSURE_PENDING_PMO_REVIEW", "CLOSURE_RETURNED_FOR_SUPPLEMENT"]); const now = new Date();
      await endActiveReview(tx, request.id, "BLOCKED_ENDED", input.actor.personId, input.reason, now);
      await tx.projectCompletionSupplementRound.updateMany({ where: { completionRequestId: request.id, completedAt: null }, data: { completedAt: now, completionReason: "WITHDRAWN" } });
      await bumpRequest(tx, request.id, input.expectedRowVersion, { status: "WITHDRAWN", closedAt: now });
      const project = await tx.project.updateMany({ where: { id: input.projectId, status: "CLOSING" }, data: { status: "ACTIVE", rowVersion: { increment: 1 } } }); if (project.count !== 1) conflict();
      await completeCompletionActions(tx, request.id, input.actor, input.reason, now); await createCompletionActivity(tx, input.actor, request.id, input.projectId, "WITHDRAWN", input.reason, now);
      await audit(tx, input.actor, input.projectId, request.id, "PROJECT_COMPLETION_WITHDRAWN", ["status"]);
    });
  }

  async approve(input: CompletionMutationInput & { actor: CollaborationActor & { roleCode: "PMO" }; comment: string | null }) {
    const result = await this.run(async (tx) => {
      await requirePmo(tx, input.actor); const request = await requestForUpdate(tx, input, "CLOSURE_PENDING_PMO_REVIEW");
      const submission = await tx.projectCompletionSubmissionVersion.findUniqueOrThrow({ where: { id: request.currentSubmissionVersionId! } });
      const reasons = await completionGateReasons(tx, input.projectId, submission); if (reasons.length) { await blockRequest(tx, input.actor, request.id, input.projectId, input.expectedRowVersion, reasons, "PMO批准时门禁重新检查失败"); return "BLOCKED" as const; }
      const now = new Date(); await endActiveReview(tx, request.id, "APPROVED", input.actor.personId, input.comment, now); await bumpRequest(tx, request.id, input.expectedRowVersion, { status: "APPROVED", closedAt: now });
      const changed = await tx.project.updateMany({ where: { id: input.projectId, status: "CLOSING" }, data: { status: "COMPLETED", completedAt: now, rowVersion: { increment: 1 } } }); if (changed.count !== 1) conflict();
      const event = await createCompletionActivity(tx, input.actor, request.id, input.projectId, "APPROVED", input.comment ?? "PMO已批准结题", now); await completeCompletionActions(tx, request.id, input.actor, "结题已批准", now);
      await notifyProjectMembersAndDeans(tx, input.actor, input.projectId, request.id, event.id, null, "PROJECT_COMPLETION_APPROVED", "项目已完成结题", "PMO已批准结题，项目进入只读完成状态。", input.commandId);
      await audit(tx, input.actor, input.projectId, request.id, "PROJECT_COMPLETION_APPROVED", ["status", "completed_at"]);
      return "APPROVED" as const;
    });
    if (result === "BLOCKED") throw new CollaborationError("PROJECT_CLOSURE_BLOCKED");
  }

  async archive(input: ArchiveProjectInput & { actor: CollaborationActor & { roleCode: "PMO" } }) { await this.archiveTransition(input, "COMPLETED", "ARCHIVED", "ARCHIVED"); }
  async restoreArchive(input: ArchiveProjectInput & { actor: CollaborationActor & { roleCode: "PMO" } }) { await this.archiveTransition(input, "ARCHIVED", "COMPLETED", "RESTORED"); }

  private async archiveTransition(input: ArchiveProjectInput & { actor: CollaborationActor & { roleCode: "PMO" } }, from: "COMPLETED" | "ARCHIVED", to: "ARCHIVED" | "COMPLETED", action: "ARCHIVED" | "RESTORED") {
    await this.run(async (tx) => {
      await requirePmo(tx, input.actor); const now = new Date(); const project = await tx.project.findFirst({ where: { id: input.projectId, status: from, rowVersion: input.expectedProjectRowVersion }, select: { id: true } }); if (!project) conflict();
      const changed = await tx.project.updateMany({ where: { id: input.projectId, status: from, rowVersion: input.expectedProjectRowVersion }, data: { status: to, archivedAt: to === "ARCHIVED" ? now : null, rowVersion: { increment: 1 } } }); if (changed.count !== 1) conflict();
      const event = await tx.projectArchiveActivity.create({ data: { projectId: input.projectId, action, reason: input.reason, actorPersonId: input.actor.personId, projectRowVersionBefore: input.expectedProjectRowVersion, occurredAt: now } });
      await notifyProjectMembersAndDeans(tx, input.actor, input.projectId, null, null, event.id, action === "ARCHIVED" ? "PROJECT_ARCHIVED" : "PROJECT_ARCHIVE_RESTORED", action === "ARCHIVED" ? "项目已归档" : "项目已取消归档", input.reason, input.commandId);
      await audit(tx, input.actor, input.projectId, event.id, action === "ARCHIVED" ? "PROJECT_ARCHIVED" : "PROJECT_ARCHIVE_RESTORED", ["status", "archived_at", "reason"], "PROJECT_ARCHIVE_ACTIVITY");
    });
  }

  private async run<T>(operation: (tx: Transaction) => Promise<T>): Promise<T> { try { return await this.client.$transaction(operation, { isolationLevel: "Serializable" }); } catch (error) { if (isConflict(error)) conflict(); throw error; } }
}

async function completionGateReasons(tx: Transaction, projectId: string, materials: ProjectCompletionMaterials) {
  const nodes = await incompleteRequiredNodes(tx, projectId);
  const issues = await openIssues(tx, projectId);
  return deriveProjectCompletionGateReasons({ incompleteRequiredWorkflowStageIds: nodes.map(({ id }) => id), openIssueIds: issues.map(({ id }) => id), materials });
}
function incompleteRequiredNodes(tx: Transaction, projectId: string) { return tx.projectWorkflowStage.findMany({ where: { projectId, executionStatus: { not: "COMPLETED" }, versions: { some: { applicability: "REQUIRED", projectPlanVersion: { status: "ACTIVE" } } } }, select: { id: true }, orderBy: { id: "asc" } }); }
function openIssues(tx: Transaction, projectId: string) { return tx.issue.findMany({ where: { projectId, resolvedAt: null, closedAt: null }, select: { id: true }, orderBy: { id: "asc" } }); }
type ClosureDraftAsset = { draftId: string; draftRowVersion: number; projectId: string; assetId: string; sizeBytes: bigint; visibilityScope: "PROJECT_SHARED"; purposeCode: string };
async function loadClosureDraftAssets(tx: Transaction, input: { projectId: string; actor: CollaborationActor; attachmentDraftIds: string[] }, requestId: string | null): Promise<ClosureDraftAsset[]> {
  const ids = [...new Set(input.attachmentDraftIds)]; if (ids.length !== input.attachmentDraftIds.length || ids.length > 10) invalid(); if (!ids.length) return [];
  const drafts = await tx.attachmentDraft.findMany({ where: { id: { in: ids }, projectId: input.projectId, projectCompletionRequestId: requestId, parentType: "PROJECT_COMPLETION_SUBMISSION_VERSION", uploaderPersonId: input.actor.personId, uploaderRoleCode: input.actor.roleCode, status: "OPEN", expiresAt: { gt: new Date() } }, include: { uploadSessions: { include: { fileAssets: true } } } });
  if (drafts.length !== ids.length) invalid();
  const assets = drafts.flatMap((draft) => draft.uploadSessions.flatMap((session) => session.fileAssets.map((asset) => ({ draftId: draft.id, draftRowVersion: draft.rowVersion, projectId: draft.projectId, assetId: asset.id, sizeBytes: asset.sizeBytes, status: asset.status, visibilityScope: draft.visibilityScope, purposeCode: draft.purposeCode }))));
  if (drafts.some((draft) => !draft.uploadSessions.some((session) => session.fileAssets.length)) || !assets.length || assets.length > MAX_ATTACHMENT_FILE_COUNT || assets.reduce((sum, asset) => sum + Number(asset.sizeBytes), 0) > MAX_ATTACHMENT_TOTAL_BYTES || assets.some((asset) => asset.status !== "AVAILABLE" || asset.visibilityScope !== "PROJECT_SHARED")) invalid();
  return assets.map((asset) => ({
    draftId: asset.draftId,
    draftRowVersion: asset.draftRowVersion,
    projectId: asset.projectId,
    assetId: asset.assetId,
    sizeBytes: asset.sizeBytes,
    visibilityScope: "PROJECT_SHARED",
    purposeCode: asset.purposeCode,
  }));
}
async function bindClosureDraftAssets(tx: Transaction, actor: CollaborationActor, assets: ClosureDraftAsset[], requestId: string, submissionId: string, at: Date) {
  for (const [draftId, rowVersion] of new Map(assets.map((asset) => [asset.draftId, asset.draftRowVersion]))) { const changed = await tx.attachmentDraft.updateMany({ where: { id: draftId, rowVersion, status: "OPEN" }, data: { status: "SUBMITTED", submittedParentId: submissionId, projectCompletionRequestId: requestId, lastActivityAt: at, rowVersion: { increment: 1 } } }); if (changed.count !== 1) conflict(); }
  if (assets.length) await tx.businessAttachment.createMany({ data: assets.map((asset) => ({ projectId: asset.projectId, fileAssetId: asset.assetId, parentType: "PROJECT_COMPLETION_SUBMISSION_VERSION", visibilityScope: "PROJECT_SHARED", purposeCode: asset.purposeCode, attachedByPersonId: actor.personId, attachedRoleCode: actor.roleCode, attachedAt: at, projectCompletionSubmissionVersionId: submissionId })) });
}
async function createSubmission(tx: Transaction, actor: CollaborationActor, requestId: string, projectId: string, versionNo: number, input: ProjectCompletionMaterials, at: Date) { return tx.projectCompletionSubmissionVersion.create({ data: {
  projectId,
  completionRequestId: requestId,
  versionNo,
  completionSummary: input.completionSummary,
  unfinishedOptionalAndLegacyStatement: input.unfinishedOptionalAndLegacyStatement,
  noUnfinishedItemConfirmed: input.noUnfinishedItemConfirmed,
  archiveComplianceSelfCheck: input.archiveComplianceSelfCheck,
  exceptionStatement: input.exceptionStatement,
  truthConfirmed: input.truthConfirmed,
  submittedByPersonId: actor.personId,
  submittedRoleCode: "KEY_SUB_I",
  submittedAt: at,
} }); }
async function createReviewRound(tx: Transaction, actor: CollaborationActor, requestId: string, projectId: string, roundNo: number, at: Date) { const limit = await timeLimit(tx, projectId, "PROJECT_COMPLETION_PMO_REVIEW"); return tx.projectCompletionReviewRound.create({ data: { projectId, completionRequestId: requestId, roundNo, status: "ACTIVE", timeLimitDaysSnapshot: limit.timeLimitDays, reminderIntervalDaysSnapshot: limit.reminderIntervalDays, startedAt: at, dueAt: addDays(at, limit.timeLimitDays) } }); }
async function requestForUpdate(tx: Transaction, input: CompletionMutationInput, status: ProjectCompletionListItem["status"]) { return requestForAnyUpdate(tx, input, [status]); }
async function requestForAnyUpdate(tx: Transaction, input: CompletionMutationInput, statuses: ProjectCompletionListItem["status"][]) { const row = await tx.projectCompletionRequest.findFirst({ where: { id: input.completionRequestId, projectId: input.projectId, rowVersion: input.expectedRowVersion, status: { in: statuses } } }); if (!row) conflict(); return row; }
async function bumpRequest(tx: Transaction, id: string, rowVersion: number, data: Prisma.ProjectCompletionRequestUpdateManyMutationInput) { const changed = await tx.projectCompletionRequest.updateMany({ where: { id, rowVersion }, data: { ...data, rowVersion: { increment: 1 } } }); if (changed.count !== 1) conflict(); }
async function endActiveReview(tx: Transaction, requestId: string, status: "APPROVED" | "RETURNED" | "BLOCKED_ENDED", personId: string, comment: string | null, at: Date) { await tx.projectCompletionReviewRound.updateMany({ where: { completionRequestId: requestId, status: "ACTIVE" }, data: { status, completedAt: at, completedByPersonId: personId, comment } }); }
async function nextReviewNo(tx: Transaction, id: string) { return (await tx.projectCompletionReviewRound.count({ where: { completionRequestId: id } })) + 1; }
async function nextSupplementNo(tx: Transaction, id: string) { return (await tx.projectCompletionSupplementRound.count({ where: { completionRequestId: id } })) + 1; }
async function syncBlocks(tx: Transaction, requestId: string, projectId: string, reasons: Awaited<ReturnType<typeof completionGateReasons>>, at: Date) { await tx.projectCompletionBlock.updateMany({ where: { completionRequestId: requestId, clearedAt: null }, data: { clearedAt: at } }); if (reasons.length) await tx.projectCompletionBlock.createMany({ data: reasons.map((reason) => ({ projectId, completionRequestId: requestId, blockType: reason.code, sourceWorkflowStageId: reason.code === "REQUIRED_NODE_INCOMPLETE" ? reason.sourceId : null, sourceIssueId: reason.code === "OPEN_ISSUE" ? reason.sourceId : null, checkCode: reason.code === "GOVERNANCE_MATERIAL_MISSING" ? reason.field : null, summary: reason.code, openedAt: at })) }); }
async function blockRequest(tx: Transaction, actor: CollaborationActor, requestId: string, projectId: string, rowVersion: number, reasons: Awaited<ReturnType<typeof completionGateReasons>>, summary: string) { const now = new Date(); await endActiveReview(tx, requestId, "BLOCKED_ENDED", actor.personId, summary, now); await bumpRequest(tx, requestId, rowVersion, { status: "CLOSURE_BLOCKED" }); await syncBlocks(tx, requestId, projectId, reasons, now); await completeCompletionActions(tx, requestId, actor, summary, now); }
async function timeLimit(tx: Transaction, projectId: string, responsibilityType: "PROJECT_COMPLETION_PMO_REVIEW" | "PROJECT_COMPLETION_SUPPLEMENT") { const setting = await tx.collaborationTimeLimitSetting.findFirst({ where: { responsibilityType, OR: [{ projectId }, { projectId: null }] }, orderBy: { projectId: "desc" } }); if (!setting) conflict(); return setting; }
async function primaryKeySubI(tx: Transaction, projectId: string) { const row = await tx.roleAssignment.findFirst({ where: { projectId, roleCode: "KEY_SUB_I", isPrimary: true, assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } }, select: { personId: true } }); if (!row) conflict(); return row.personId; }
async function requirePrimaryKeySubI(tx: Transaction, actor: CollaborationActor, projectId: string) { await requireActiveSession(tx, actor); if (actor.roleCode !== "KEY_SUB_I" || await primaryKeySubI(tx, projectId) !== actor.personId) forbidden(); }
async function requirePmo(tx: DatabaseClient, actor: CollaborationActor) { await requireActiveSession(tx, actor); if (actor.roleCode !== "PMO") forbidden(); const role = await tx.roleAssignment.findFirst({ where: { personId: actor.personId, projectId: null, roleCode: "PMO", assignmentStatus: "ACTIVE" } }); if (!role) forbidden(); }
async function requireReadableProject(tx: DatabaseClient, actor: CollaborationActor, projectId: string) {
  await requireActiveSession(tx, actor);
  const assignment = await tx.roleAssignment.findFirst({
    where: actor.roleCode === "KEY_SUB_I"
      ? { personId: actor.personId, projectId, roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } }
      : { personId: actor.personId, projectId: null, roleCode: actor.roleCode, assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } },
    select: { id: true },
  });
  if (!assignment) forbidden();
  const project = await tx.project.findFirst({ where: { id: projectId, projectCode: { not: null }, status: { in: ["ACTIVE", "CLOSING", "COMPLETED", "ARCHIVED"] } }, select: { id: true } });
  if (!project) forbidden();
}
async function requireActiveSession(tx: DatabaseClient, actor: CollaborationActor) { const row = await tx.session.findFirst({ where: { id: actor.sessionId, personId: actor.personId, activeRoleCode: actor.roleCode, revokedAt: null, expiresAt: { gt: new Date() }, person: { accountStatus: "ACTIVE" } } }); if (!row) forbidden(); }
async function createCompletionActivity(tx: Transaction, actor: CollaborationActor, requestId: string, projectId: string, activityType: "SUBMITTED" | "RETURNED" | "RESUBMITTED" | "WITHDRAWN" | "APPROVED", content: string, createdAt: Date) { return tx.projectCompletionActivity.create({ data: { projectId, completionRequestId: requestId, activityType, actorPersonId: actor.personId, actorRoleCode: actor.roleCode, content, createdAt } }); }
async function notifyPmos(tx: Transaction, actor: CollaborationActor, projectId: string, requestId: string, activityId: string, roundId: string, eventCode: string, title: string, content: string, occurrence: string, action: boolean) { const rows = await tx.roleAssignment.findMany({ where: { projectId: null, roleCode: "PMO", assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } }, distinct: ["personId"], select: { personId: true } }); await notifyPeople(tx, actor, projectId, requestId, activityId, roundId, rows.map(({ personId }) => ({ personId, roleCode: "PMO" as const })), eventCode, title, content, occurrence, action); }
async function notifyProjectMembersAndDeans(tx: Transaction, actor: CollaborationActor, projectId: string, requestId: string | null, activityId: string | null, archiveId: string | null, eventCode: string, title: string, content: string, occurrence: string) { const rows = await tx.roleAssignment.findMany({ where: { assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" }, OR: [{ projectId, roleCode: "KEY_SUB_I" }, { projectId: null, roleCode: "DEAN" }] }, distinct: ["personId", "roleCode"], select: { personId: true, roleCode: true } }); const data: Prisma.NotificationCreateManyInput[] = rows.map((row) => ({ recipientPersonId: row.personId, recipientRoleCode: row.roleCode, notificationType: "PROJECT_REVIEW_NOTICE", eventCode, triggeredByPersonId: actor.personId, triggeredByRoleCode: actor.roleCode, projectId, projectCompletionRequestId: requestId, projectCompletionActivityId: activityId, projectArchiveActivityId: archiveId, title, content, eventKey: `${eventCode}:${projectId}:${occurrence}:${row.personId}`, messageKind: "INFORMATIONAL", actionStatus: "NOT_APPLICABLE" })); await tx.notification.createMany({ data, skipDuplicates: true }); }
async function notifyPeople(tx: Transaction, actor: CollaborationActor, projectId: string, requestId: string, activityId: string, roundId: string | null, recipients: Array<{ personId: string; roleCode: "PMO" | "KEY_SUB_I" }>, eventCode: string, title: string, content: string, occurrence: string, action: boolean) { if (!recipients.length) conflict(); const data: Prisma.NotificationCreateManyInput[] = recipients.map((row) => ({ recipientPersonId: row.personId, recipientRoleCode: row.roleCode, notificationType: "PROJECT_REVIEW_NOTICE", eventCode, triggeredByPersonId: actor.personId, triggeredByRoleCode: actor.roleCode, projectId, projectCompletionRequestId: requestId, projectCompletionActivityId: activityId, projectCompletionReviewRoundId: roundId, title, content, eventKey: `${eventCode}:${requestId}:${occurrence}:${row.personId}`, messageKind: action ? "ACTION" : "INFORMATIONAL", actionStatus: action ? "PENDING" : "NOT_APPLICABLE", actionGroupKey: action ? `completion:${roundId ?? requestId}` : null })); await tx.notification.createMany({ data, skipDuplicates: true }); }
async function completeCompletionActions(tx: Transaction, requestId: string, actor: CollaborationActor, reason: string, at: Date) {
  const actions = await tx.notification.findMany({ where: { projectCompletionRequestId: requestId, messageKind: "ACTION", actionStatus: "PENDING" }, select: { recipientPersonId: true, recipientRoleCode: true, projectId: true, projectCompletionReviewRoundId: true, actionGroupKey: true } });
  await tx.notification.updateMany({ where: { projectCompletionRequestId: requestId, messageKind: "ACTION", actionStatus: "PENDING" }, data: { actionStatus: "COMPLETED", actionCompletedAt: at, actionCompletionReason: reason } });
  const others = actions.filter((action) => action.actionGroupKey && action.recipientPersonId !== actor.personId);
  if (others.length) await tx.notification.createMany({ data: others.map((action) => ({ recipientPersonId: action.recipientPersonId, recipientRoleCode: action.recipientRoleCode, notificationType: "PROJECT_REVIEW_NOTICE" as const, eventCode: "PROJECT_COMPLETION_SHARED_ACTION_RESULT", triggeredByPersonId: actor.personId, triggeredByRoleCode: actor.roleCode, projectId: action.projectId, projectCompletionRequestId: requestId, projectCompletionReviewRoundId: action.projectCompletionReviewRoundId, title: "结题待办已由其他 PMO处理", content: `${actor.roleCode}已处理：${reason}`, eventKey: `${action.actionGroupKey}:result:${action.recipientPersonId}`, messageKind: "INFORMATIONAL" as const, actionStatus: "NOT_APPLICABLE" as const })), skipDuplicates: true });
}
async function audit(tx: Transaction, actor: CollaborationActor, projectId: string, entityId: string, actionCode: string, changedFields: string[], entityType = "PROJECT_COMPLETION_REQUEST") { await tx.auditLog.create({ data: { actorPersonId: actor.personId, actorRoleCode: actor.roleCode, sessionId: actor.sessionId, actionCode, result: "SUCCESS", projectId, entityType, entityId, summary: "处理项目结题或归档", changedFields, correlationId: randomUUID() } }); }
function addDays(at: Date, days: number) { return new Date(at.getTime() + days * 86_400_000); }
function isConflict(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && ["P2002", "P2034"].includes(String(error.code))); }
function invalid(): never { throw new CollaborationError("PROJECT_CLOSURE_INVALID_INPUT"); }
function conflict(): never { throw new CollaborationError("PROJECT_CLOSURE_CONFLICT"); }
function forbidden(): never { throw new CollaborationError("COLLABORATION_FORBIDDEN"); }
