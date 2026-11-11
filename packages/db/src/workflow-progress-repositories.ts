import { randomUUID } from "node:crypto";

import {
  CollaborationError,
  type CollaborationActor,
  type CorrectWorkflowProgressInput,
  type SubmitWorkflowProgressInput,
  type WorkflowProgressCorrectionResult,
  type WorkflowProgressRecord,
  type WorkflowProgressRepository,
} from "@researchflow/collaboration";

import type { Prisma } from "../generated/client.js";
import type { ApplicationPrismaClient } from "./client.js";

type Transaction = Prisma.TransactionClient;
type DatabaseClient = ApplicationPrismaClient | Transaction;
type DecimalValue = { toFixed(digits: number): string };

export class PrismaWorkflowProgressRepository implements WorkflowProgressRepository {
  constructor(private readonly client: ApplicationPrismaClient) {}

  async submitProgress(
    input: SubmitWorkflowProgressInput & { actor: CollaborationActor },
  ): Promise<WorkflowProgressRecord> {
    return this.client.$transaction(async (transaction) => {
      const assignment = await requireWritableKeySubI(transaction, input.actor, input.projectId);
      if (assignment.project.status !== "ACTIVE") {
        throw new CollaborationError("PROJECT_NOT_ACTIVE");
      }
      const draftIds = [...new Set(input.attachmentDraftIds)];
      if (draftIds.length !== input.attachmentDraftIds.length || draftIds.length > 10) {
        throw new CollaborationError("INVALID_PROGRESS_INPUT");
      }
      const node = await transaction.projectWorkflowStage.findFirst({
        where: {
          id: input.projectWorkflowStageId,
          projectId: input.projectId,
          executionStatus: { in: ["NOT_STARTED", "ACTIVE"] },
          versions: {
            some: {
              applicability: { not: "NOT_APPLICABLE" },
              projectPlanVersion: { status: "ACTIVE" },
              roleVersions: { some: { roleCode: "KEY_SUB_I" } },
            },
          },
        },
        select: {
          id: true,
          executionStatus: true,
          actualStartAt: true,
          versions: {
            where: { projectPlanVersion: { status: "ACTIVE" } },
            take: 1,
            select: { updateIntervalDays: true, attachmentRequirement: true },
          },
        },
      });
      if (!node) throw new CollaborationError("WORKFLOW_NOT_REPORTABLE");
      if (draftIds.length && node.versions[0]?.attachmentRequirement === "NONE") {
        throw new CollaborationError("INVALID_PROGRESS_INPUT");
      }
      const drafts = draftIds.length ? await transaction.attachmentDraft.findMany({
        where: {
          id: { in: draftIds },
          projectId: input.projectId,
          projectWorkflowStageId: input.projectWorkflowStageId,
          parentType: "WORKFLOW_UPDATE",
          uploaderPersonId: input.actor.personId,
          uploaderRoleCode: input.actor.roleCode,
          status: "OPEN",
          expiresAt: { gt: new Date() },
        },
        include: {
          uploadSessions: {
            include: { fileAssets: { where: { status: "AVAILABLE", businessAttachment: null } } },
          },
        },
      }) : [];
      const attachmentAssets = drafts.flatMap((draft) =>
        draft.uploadSessions.flatMap((session) => session.fileAssets.map((asset) => ({ draft, asset }))),
      );
      if (drafts.length !== draftIds.length || attachmentAssets.length === 0 || attachmentAssets.length > 10) {
        if (draftIds.length) throw new CollaborationError("INVALID_PROGRESS_INPUT");
      }

      const submittedAt = new Date();
      const update = await transaction.workflowUpdate.create({
        data: {
          projectId: input.projectId,
          projectWorkflowStageId: input.projectWorkflowStageId,
          submittedByPersonId: input.actor.personId,
          submittedRoleCode: "KEY_SUB_I",
          progressSummary: input.progressSummary,
          basis: input.basis,
          expectedCompletionDate: input.expectedCompletionDate
            ? new Date(`${input.expectedCompletionDate}T00:00:00.000Z`)
            : null,
          budgetAmountCny: input.budgetAmountCny,
          submittedAt,
        },
      });
      if (draftIds.length) {
        const claimed = await transaction.attachmentDraft.updateMany({
          where: { id: { in: draftIds }, status: "OPEN", rowVersion: { in: drafts.map(({ rowVersion }) => rowVersion) } },
          data: { status: "SUBMITTED", submittedParentId: update.id, rowVersion: { increment: 1 }, lastActivityAt: submittedAt },
        });
        if (claimed.count !== draftIds.length) throw new CollaborationError("INVALID_PROGRESS_INPUT");
        await transaction.businessAttachment.createMany({ data: attachmentAssets.map(({ draft, asset }) => ({
          projectId: input.projectId,
          fileAssetId: asset.id,
          parentType: "WORKFLOW_UPDATE",
          visibilityScope: draft.visibilityScope,
          purposeCode: draft.purposeCode,
          attachedByPersonId: input.actor.personId,
          attachedRoleCode: input.actor.roleCode,
          attachedAt: submittedAt,
          workflowUpdateId: update.id,
        })) });
      }
      const updateIntervalDays = node.versions[0]?.updateIntervalDays ?? null;
      await transaction.projectWorkflowStage.update({
        where: { id: node.id },
        data: {
          executionStatus: node.executionStatus === "NOT_STARTED" ? "ACTIVE" : node.executionStatus,
          actualStartAt: node.actualStartAt ?? submittedAt,
          nextUpdateDueDate: updateIntervalDays
            ? addUtcDays(submittedAt, updateIntervalDays)
            : null,
          rowVersion: { increment: 1 },
        },
      });
      await transaction.auditLog.create({
        data: {
          actorPersonId: input.actor.personId,
          actorRoleCode: input.actor.roleCode,
          sessionId: input.actor.sessionId,
          actionCode: "WORKFLOW_PROGRESS_SUBMITTED",
          result: "SUCCESS",
          projectId: input.projectId,
          entityType: "WORKFLOW_UPDATE",
          entityId: update.id,
          summary: "提交普通进展",
          changedFields: [
            "progress_summary",
            "basis",
            "expected_completion_date",
            "budget_amount_cny",
            ...(draftIds.length ? ["business_attachments"] : []),
          ],
          correlationId: randomUUID(),
        },
      });
      return mapProgress({ ...update, corrections: [], businessAttachments: [] });
    }, { isolationLevel: "Serializable" });
  }

  async correctProgress(
    input: CorrectWorkflowProgressInput & { actor: CollaborationActor },
  ): Promise<WorkflowProgressCorrectionResult> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const assignment = await requireWritableKeySubI(transaction, input.actor, input.projectId);
        if (assignment.project.status !== "ACTIVE") {
          throw new CollaborationError("PROJECT_NOT_ACTIVE");
        }
        const update = await transaction.workflowUpdate.findFirst({
          where: { id: input.workflowUpdateId, projectId: input.projectId },
          include: { corrections: { orderBy: { sequenceNo: "asc" } } },
        });
        if (!update) throw new CollaborationError("PROGRESS_NOT_FOUND");
        if (update.submittedByPersonId !== input.actor.personId && !assignment.isPrimary) {
          throw new CollaborationError("PROGRESS_CORRECTION_FORBIDDEN");
        }
        const effective = mapProgress(update);
        if (effective.latestCorrectionSequenceNo !== input.expectedLatestSequenceNo) {
          throw new CollaborationError("PROGRESS_CORRECTION_CONFLICT");
        }

        const correctedAt = new Date();
        const correction = await transaction.workflowUpdateCorrection.create({
          data: {
            projectId: input.projectId,
            workflowUpdateId: input.workflowUpdateId,
            sequenceNo: input.expectedLatestSequenceNo + 1,
            correctedByPersonId: input.actor.personId,
            correctedRoleCode: "KEY_SUB_I",
            correctionReason: input.correctionReason,
            revisedProgressSummary: input.revisedProgressSummary,
            revisedBasis: input.revisedBasis,
            revisedExpectedDateMode: input.revisedExpectedDateMode,
            revisedExpectedDate: input.revisedExpectedDate
              ? new Date(`${input.revisedExpectedDate}T00:00:00.000Z`)
              : null,
            budgetAmountMode: input.budgetAmountMode,
            revisedBudgetAmountCny: input.revisedBudgetAmountCny,
            createdAt: correctedAt,
          },
        });
        await transaction.auditLog.create({
          data: {
            actorPersonId: input.actor.personId,
            actorRoleCode: input.actor.roleCode,
            sessionId: input.actor.sessionId,
            actionCode: "WORKFLOW_PROGRESS_CORRECTED",
            result: "SUCCESS",
            projectId: input.projectId,
            entityType: "WORKFLOW_UPDATE_CORRECTION",
            entityId: correction.id,
            summary: "追加普通进展纠错",
            changedFields: changedCorrectionFields(input),
            correlationId: randomUUID(),
          },
        });

        return applyCorrection(effective, input, correction.sequenceNo, correctedAt);
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (isDatabaseConflict(error)) {
        throw new CollaborationError("PROGRESS_CORRECTION_CONFLICT");
      }
      throw error;
    }
  }

  async listProgress(
    actor: CollaborationActor,
    projectId: string,
  ): Promise<WorkflowProgressRecord[]> {
    return this.client.$transaction(async (transaction) => {
      await requireReadableProject(transaction, actor, projectId);
      const updates = await transaction.workflowUpdate.findMany({
        where: { projectId },
        orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
        include: {
          corrections: { orderBy: { sequenceNo: "asc" } },
          businessAttachments: {
            where: { fileAsset: { status: "AVAILABLE" } },
            include: { fileAsset: true },
          },
        },
      });
      return updates.map(mapProgress);
    }, { isolationLevel: "Serializable" });
  }

  async getRecordedBudgetTotal(actor: CollaborationActor, projectId: string): Promise<string> {
    const progress = await this.listProgress(actor, projectId);
    const cents = progress.reduce(
      (total, item) => total + amountToCents(item.effectiveBudgetAmountCny),
      BigInt(0),
    );
    return centsToAmount(cents);
  }
}

async function requireWritableKeySubI(
  client: DatabaseClient,
  actor: CollaborationActor,
  projectId: string,
) {
  if (actor.roleCode !== "KEY_SUB_I") {
    throw new CollaborationError("COLLABORATION_FORBIDDEN");
  }
  await requireActiveSession(client, actor);
  const assignment = await client.roleAssignment.findFirst({
    where: {
      personId: actor.personId,
      roleCode: "KEY_SUB_I",
      projectId,
      assignmentStatus: "ACTIVE",
      person: { accountStatus: "ACTIVE" },
    },
    select: { isPrimary: true, project: { select: { status: true } } },
  });
  if (!assignment?.project) throw new CollaborationError("COLLABORATION_FORBIDDEN");
  return { ...assignment, project: assignment.project };
}

async function requireReadableProject(
  client: DatabaseClient,
  actor: CollaborationActor,
  projectId: string,
): Promise<void> {
  await requireActiveSession(client, actor);
  const visibleStatuses = ["ACTIVE", "CLOSING", "COMPLETED", "ARCHIVED"] as const;
  if (actor.roleCode === "PMO" || actor.roleCode === "DEAN") {
    const assignment = await client.roleAssignment.findFirst({
      where: {
        personId: actor.personId,
        roleCode: actor.roleCode,
        projectId: null,
        assignmentStatus: "ACTIVE",
        person: { accountStatus: "ACTIVE" },
      },
      select: { id: true },
    });
    if (!assignment) throw new CollaborationError("COLLABORATION_FORBIDDEN");
  } else if (actor.roleCode === "KEY_SUB_I") {
    const assignment = await client.roleAssignment.findFirst({
      where: {
        personId: actor.personId,
        roleCode: "KEY_SUB_I",
        projectId,
        assignmentStatus: "ACTIVE",
        person: { accountStatus: "ACTIVE" },
      },
      select: { id: true },
    });
    if (!assignment) throw new CollaborationError("PROJECT_NOT_FOUND");
  }
  const project = await client.project.findFirst({
    where: { id: projectId, status: { in: [...visibleStatuses] }, projectCode: { not: null } },
    select: { id: true },
  });
  if (!project) throw new CollaborationError("PROJECT_NOT_FOUND");
}

async function requireActiveSession(client: DatabaseClient, actor: CollaborationActor): Promise<void> {
  const session = await client.session.findFirst({
    where: {
      id: actor.sessionId,
      personId: actor.personId,
      activeRoleCode: actor.roleCode,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      person: { accountStatus: "ACTIVE" },
    },
    select: { id: true },
  });
  if (!session) throw new CollaborationError("COLLABORATION_FORBIDDEN");
}

function mapProgress(update: {
  id: string;
  projectId: string;
  projectWorkflowStageId: string;
  submittedByPersonId: string;
  progressSummary: string;
  basis: string;
  expectedCompletionDate: Date | null;
  budgetAmountCny: DecimalValue | null;
  submittedAt: Date;
  corrections: Array<{
    sequenceNo: number;
    revisedProgressSummary: string | null;
    revisedBasis: string | null;
    revisedExpectedDateMode: "KEEP" | "SET" | "CLEAR";
    revisedExpectedDate: Date | null;
    budgetAmountMode: "KEEP" | "SET" | "CLEAR";
    revisedBudgetAmountCny: DecimalValue | null;
  }>;
  businessAttachments?: Array<{
    fileAsset: {
      id: string;
      originalFileName: string;
      mediaType: string;
      sizeBytes: bigint;
    };
  }>;
}): WorkflowProgressRecord {
  let progressSummary = update.progressSummary;
  let basis = update.basis;
  let expectedCompletionDate = dateOnly(update.expectedCompletionDate);
  let effectiveBudgetAmountCny = decimalAmount(update.budgetAmountCny);
  let latestCorrectionSequenceNo = 0;
  for (const correction of update.corrections) {
    progressSummary = correction.revisedProgressSummary ?? progressSummary;
    basis = correction.revisedBasis ?? basis;
    if (correction.revisedExpectedDateMode === "SET") {
      expectedCompletionDate = dateOnly(correction.revisedExpectedDate);
    } else if (correction.revisedExpectedDateMode === "CLEAR") {
      expectedCompletionDate = null;
    }
    if (correction.budgetAmountMode === "SET") {
      effectiveBudgetAmountCny = decimalAmount(correction.revisedBudgetAmountCny);
    } else if (correction.budgetAmountMode === "CLEAR") {
      effectiveBudgetAmountCny = null;
    }
    latestCorrectionSequenceNo = correction.sequenceNo;
  }
  return {
    id: update.id,
    projectId: update.projectId,
    projectWorkflowStageId: update.projectWorkflowStageId,
    submittedByPersonId: update.submittedByPersonId,
    progressSummary,
    basis,
    expectedCompletionDate,
    effectiveBudgetAmountCny,
    latestCorrectionSequenceNo,
    submittedAt: update.submittedAt.toISOString(),
    attachments: (update.businessAttachments ?? []).map(({ fileAsset }) => ({
      assetId: fileAsset.id,
      fileName: fileAsset.originalFileName,
      mediaType: fileAsset.mediaType,
      sizeBytes: Number(fileAsset.sizeBytes),
    })),
  };
}

function applyCorrection(
  current: WorkflowProgressRecord,
  input: CorrectWorkflowProgressInput,
  sequenceNo: number,
  correctedAt: Date,
): WorkflowProgressCorrectionResult {
  return {
    workflowUpdateId: current.id,
    sequenceNo,
    effectiveProgressSummary: input.revisedProgressSummary ?? current.progressSummary,
    effectiveBasis: input.revisedBasis ?? current.basis,
    effectiveExpectedCompletionDate: input.revisedExpectedDateMode === "SET"
      ? input.revisedExpectedDate
      : input.revisedExpectedDateMode === "CLEAR"
        ? null
        : current.expectedCompletionDate,
    effectiveBudgetAmountCny: input.budgetAmountMode === "SET"
      ? input.revisedBudgetAmountCny
      : input.budgetAmountMode === "CLEAR"
        ? null
        : current.effectiveBudgetAmountCny,
    correctedAt: correctedAt.toISOString(),
  };
}

function changedCorrectionFields(input: CorrectWorkflowProgressInput): string[] {
  return [
    ...(input.revisedProgressSummary === null ? [] : ["progress_summary"]),
    ...(input.revisedBasis === null ? [] : ["basis"]),
    ...(input.revisedExpectedDateMode === "KEEP" ? [] : ["expected_completion_date"]),
    ...(input.budgetAmountMode === "KEEP" ? [] : ["budget_amount_cny"]),
  ];
}

function decimalAmount(value: DecimalValue | null): string | null {
  return value?.toFixed(2) ?? null;
}

function dateOnly(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function addUtcDays(value: Date, days: number): Date {
  const result = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function amountToCents(value: string | null): bigint {
  if (!value) return BigInt(0);
  const [integer, fraction = "00"] = value.split(".");
  return BigInt(integer ?? "0") * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}

function centsToAmount(cents: bigint): string {
  const hundred = BigInt(100);
  return `${cents / hundred}.${(cents % hundred).toString().padStart(2, "0")}`;
}

function isDatabaseConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code;
  return code === "P2002" || code === "P2034";
}
