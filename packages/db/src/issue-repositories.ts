import { randomUUID } from "node:crypto";

import { MAX_ATTACHMENT_FILE_COUNT, MAX_ATTACHMENT_TOTAL_BYTES } from "@researchflow/attachments";

import {
  CollaborationError,
  assertIssueTransition,
  issueActivityVisibilityScopes,
  type CollaborationActor,
  type CreateIssueInput,
  type IssueHandlingState,
  type IssueContact,
  type IssueEmailRecordResult,
  type IssueInvalidCloseReason,
  type IssueListItem,
  type IssueMutationInput,
  type IssueRepository,
  type IssueVisibilityScope,
  type IssueTypeOption,
  type RecordDeanDecisionInput,
} from "@researchflow/collaboration";

import type { Prisma } from "../generated/client.js";
import type { ApplicationPrismaClient } from "./client.js";
import { synchronizeWorkflowCompletionIssueGateForNode } from "./workflow-completion-repositories.js";

type Transaction = Prisma.TransactionClient;
type DatabaseClient = ApplicationPrismaClient | Transaction;

const issueInclude = {
  handlingStates: {
    where: { exitedAt: null },
    orderBy: { responsibilityRoundNo: "desc" as const },
    take: 1,
  },
} satisfies Prisma.IssueInclude;
type IssueRow = Prisma.IssueGetPayload<{ include: typeof issueInclude }>;

const issueProjectionInclude = {
  ...issueInclude,
  businessAttachments: {
    where: { parentType: "ISSUE" as const, fileAsset: { status: "AVAILABLE" as const } },
    include: { fileAsset: true },
  },
  activities: {
    where: { visibilityScope: { in: ["ISSUE_PARTICIPANTS"] as IssueVisibilityScope[] } },
    orderBy: { sequenceNo: "asc" as const },
    include: {
      businessAttachments: {
        where: { fileAsset: { status: "AVAILABLE" as const } },
        include: { fileAsset: true },
      },
    },
  },
  sharedSummaries: { orderBy: { publishedAt: "asc" as const } },
  decisionRounds: {
    orderBy: { roundNo: "desc" as const },
    include: {
      reviewTransfers: {
        where: { acceptedAt: null },
        orderBy: { requestedAt: "desc" as const },
        take: 1,
      },
      deanDecision: {
        include: {
          businessAttachments: {
            where: { fileAsset: { status: "AVAILABLE" as const } },
            include: { fileAsset: true },
          },
        },
      },
      implementationSubmissions: {
        orderBy: { submissionNo: "asc" as const },
        include: {
          businessAttachments: {
            where: { fileAsset: { status: "AVAILABLE" as const } },
            include: { fileAsset: true },
          },
        },
      },
    },
  },
} satisfies Prisma.IssueInclude;
type IssueProjectionRow = Prisma.IssueGetPayload<{ include: typeof issueProjectionInclude }>;

export class PrismaIssueRepository implements IssueRepository {
  constructor(private readonly client: ApplicationPrismaClient) {}

  async list(actor: CollaborationActor, projectId: string): Promise<IssueListItem[]> {
    return this.client.$transaction(async (transaction) => {
      await requireReadableProject(transaction, actor, projectId);
      const issues = await transaction.issue.findMany({
        where: { projectId },
        orderBy: [{ openedAt: "desc" }, { issueNo: "asc" }],
        include: {
          ...issueProjectionInclude,
          businessAttachments: {
            ...issueProjectionInclude.businessAttachments,
            where: { parentType: "ISSUE", visibilityScope: { in: issueActivityVisibilityScopes(actor.roleCode) }, fileAsset: { status: "AVAILABLE" } },
          },
          activities: {
            ...issueProjectionInclude.activities,
            where: { visibilityScope: { in: issueActivityVisibilityScopes(actor.roleCode) } },
            include: {
              businessAttachments: {
                ...issueProjectionInclude.activities.include.businessAttachments,
                where: { visibilityScope: { in: issueActivityVisibilityScopes(actor.roleCode) }, fileAsset: { status: "AVAILABLE" } },
              },
            },
          },
          decisionRounds: {
            ...issueProjectionInclude.decisionRounds,
            include: {
              ...issueProjectionInclude.decisionRounds.include,
              deanDecision: {
                include: {
                  businessAttachments: {
                    ...issueProjectionInclude.decisionRounds.include.deanDecision.include.businessAttachments,
                    where: { visibilityScope: { in: issueActivityVisibilityScopes(actor.roleCode) }, fileAsset: { status: "AVAILABLE" } },
                  },
                },
              },
              implementationSubmissions: {
                ...issueProjectionInclude.decisionRounds.include.implementationSubmissions,
                include: {
                  businessAttachments: {
                    ...issueProjectionInclude.decisionRounds.include.implementationSubmissions.include.businessAttachments,
                    where: { visibilityScope: { in: issueActivityVisibilityScopes(actor.roleCode) }, fileAsset: { status: "AVAILABLE" } },
                  },
                },
              },
            },
          },
        },
      });
      return issues.map((issue) => mapIssueProjection(issue, actor));
    }, { isolationLevel: "Serializable" });
  }

  async listIssueTypes(actor: CollaborationActor, projectId: string): Promise<IssueTypeOption[]> {
    return this.client.$transaction(async (transaction) => {
      await requireReadableProject(transaction, actor, projectId);
      const options = await transaction.dictionaryOption.findMany({
        where: { dictionaryCode: "ISSUE_TYPE", enabled: true },
        orderBy: [{ sortOrder: "asc" }, { optionCode: "asc" }],
        select: { id: true, optionCode: true, displayName: true },
      });
      return options.map(({ id, optionCode, displayName }) => ({ id, code: optionCode, name: displayName }));
    }, { isolationLevel: "Serializable" });
  }

  async listContacts(actor: CollaborationActor, projectId: string): Promise<IssueContact[]> {
    return this.client.$transaction(async (transaction) => {
      await requirePmo(transaction, actor);
      await requireReadableProject(transaction, actor, projectId);
      const people = await transaction.person.findMany({
          where: {
            accountStatus: "ACTIVE",
            workEmail: { not: null },
            roleAssignments: { some: { assignmentStatus: "ACTIVE", OR: [
              { projectId: null, roleCode: { in: ["PMO", "DEAN"] } },
              { projectId, roleCode: "KEY_SUB_I" },
            ] } },
          },
          select: { id: true, displayName: true, workEmail: true, roleAssignments: { where: { assignmentStatus: "ACTIVE", OR: [{ projectId: null, roleCode: { in: ["PMO", "DEAN"] } }, { projectId, roleCode: "KEY_SUB_I" }] }, select: { roleCode: true }, take: 1 } },
          orderBy: { displayName: "asc" },
        });
      const external = await transaction.externalContact.findMany({ where: { status: "ACTIVE" }, orderBy: [{ categoryCode: "asc" }, { contactName: "asc" }] });
      return [
        ...people.filter((person): person is typeof person & { workEmail: string } => Boolean(person.workEmail)).map((person) => ({ ref: `person:${person.id}`, name: person.displayName, email: person.workEmail, source: "SYSTEM_PERSON" as const, category: person.roleAssignments[0]?.roleCode ?? "SYSTEM" })),
        ...external.map((contact) => ({ ref: `external:${contact.id}`, name: contact.contactName, email: contact.email, source: "EXTERNAL_CONTACT" as const, category: contact.categoryCode })),
      ];
    }, { isolationLevel: "Serializable" });
  }

  async createExternalContact(input: { actor: CollaborationActor; projectId: string; name: string; email: string; category: string }): Promise<IssueContact> {
    return this.runMutation(async (transaction) => {
      await requirePmo(transaction, input.actor);
      await requireReadableProject(transaction, input.actor, input.projectId);
      const contact = await transaction.externalContact.create({ data: { contactName: input.name, email: input.email, categoryCode: input.category, status: "ACTIVE" } });
      await transaction.auditLog.create({ data: { actorPersonId: input.actor.personId, actorRoleCode: input.actor.roleCode, sessionId: input.actor.sessionId, actionCode: "ISSUE_EXTERNAL_CONTACT_CREATED", result: "SUCCESS", projectId: input.projectId, entityType: "EXTERNAL_CONTACT", entityId: contact.id, summary: "创建问题外部联系人", changedFields: ["contact_name", "email", "category_code"], correlationId: randomUUID() } });
      return { ref: `external:${contact.id}`, name: contact.contactName, email: contact.email, source: "EXTERNAL_CONTACT", category: contact.categoryCode };
    });
  }

  async recordManualEmail(input: { actor: CollaborationActor; projectId: string; issueId: string; subject: string; body: string; recipientRefs: string[]; idempotencyKey: string }): Promise<IssueEmailRecordResult> {
    return this.runMutation(async (transaction) => {
      await requirePmo(transaction, input.actor);
      await requireReadableProject(transaction, input.actor, input.projectId);
      await lockIssue(transaction, input.issueId);
      const issue = await transaction.issue.findFirst({ where: { id: input.issueId, projectId: input.projectId }, include: issueInclude });
      if (!issue) throw new CollaborationError("ISSUE_NOT_FOUND");
      const existing = await transaction.issueEmail.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) {
        if (existing.projectId !== input.projectId || existing.issueId !== input.issueId || existing.sentByPersonId !== input.actor.personId) throw new CollaborationError("ISSUE_CONFLICT");
        return { id: existing.id, status: "FAILED", failureCode: "SMTP_NOT_CONFIGURED" };
      }
      const personIds = input.recipientRefs.filter((ref) => ref.startsWith("person:")).map((ref) => ref.slice(7));
      const externalIds = input.recipientRefs.filter((ref) => ref.startsWith("external:")).map((ref) => ref.slice(9));
      if (personIds.length + externalIds.length !== input.recipientRefs.length) invalidInput();
      const people = await transaction.person.findMany({ where: { id: { in: personIds }, accountStatus: "ACTIVE", workEmail: { not: null }, roleAssignments: { some: { assignmentStatus: "ACTIVE", OR: [{ projectId: null, roleCode: { in: ["PMO", "DEAN"] } }, { projectId: input.projectId, roleCode: "KEY_SUB_I" }] } } }, select: { id: true, displayName: true, workEmail: true } });
      const external = await transaction.externalContact.findMany({ where: { id: { in: externalIds }, status: "ACTIVE" } });
      if (people.length + external.length !== input.recipientRefs.length) invalidInput();
      const email = await transaction.issueEmail.create({ data: { projectId: input.projectId, issueId: issue.id, sentByPersonId: input.actor.personId, sentByRoleCode: "PMO", subject: input.subject, body: input.body, status: "FAILED", visibilityScope: "PMO_ONLY", idempotencyKey: input.idempotencyKey } });
      const recipientRows = [
        ...people.map((person) => ({ personId: person.id, externalContactId: null, name: person.displayName, email: person.workEmail! })),
        ...external.map((contact) => ({ personId: null, externalContactId: contact.id, name: contact.contactName, email: contact.email })),
      ];
      for (const recipient of recipientRows) {
        const row = await transaction.issueEmailRecipient.create({ data: { projectId: input.projectId, issueEmailId: email.id, personId: recipient.personId, externalContactId: recipient.externalContactId, recipientType: "TO", recipientNameSnapshot: recipient.name, recipientEmailSnapshot: recipient.email, deliveryStatus: "FAILED" } });
        await transaction.emailDeliveryAttempt.create({ data: { projectId: input.projectId, issueEmailRecipientId: row.id, attemptNo: 1, status: "FAILED", errorCode: "SMTP_NOT_CONFIGURED", errorMessage: "未配置问题邮件投递器，已保留失败尝试记录。", attemptedAt: new Date() } });
      }
      await addActivity(transaction, input.actor, issue, issue.handlingStates[0]?.id ?? null, "PMO_INTERNAL_NOTE", `人工邮件投递失败：${input.subject}`, "PMO_ONLY");
      await transaction.auditLog.create({ data: { actorPersonId: input.actor.personId, actorRoleCode: input.actor.roleCode, sessionId: input.actor.sessionId, actionCode: "ISSUE_EMAIL_DELIVERY_ATTEMPTED", result: "FAILURE", projectId: input.projectId, entityType: "ISSUE_EMAIL", entityId: email.id, entityBusinessCode: issue.issueNo, summary: "问题人工邮件投递失败，记录已保留", changedFields: ["status"], failureCode: "SMTP_NOT_CONFIGURED", correlationId: randomUUID() } });
      return { id: email.id, status: "FAILED", failureCode: "SMTP_NOT_CONFIGURED" };
    });
  }

  async create(input: CreateIssueInput & {
    actor: CollaborationActor & { roleCode: "PMO" | "KEY_SUB_I" };
  }): Promise<IssueListItem> {
    return this.runMutation(async (transaction) => {
      await requireWritableProject(transaction, input.actor, input.projectId);
      const closingRequest = await transaction.projectCompletionRequest.findFirst({
        where: { projectId: input.projectId, project: { status: "CLOSING" }, status: { in: ["CLOSURE_BLOCKED", "CLOSURE_PENDING_PMO_REVIEW", "CLOSURE_RETURNED_FOR_SUPPLEMENT"] } },
        orderBy: { createdAt: "desc" }, select: { id: true, rowVersion: true },
      });
      const node = await transaction.projectWorkflowStage.findFirst({
        where: { id: input.projectWorkflowStageId, projectId: input.projectId },
        select: { id: true },
      });
      const issueType = await transaction.dictionaryOption.findFirst({
        where: { id: input.issueTypeOptionId, dictionaryCode: "ISSUE_TYPE", enabled: true },
        select: { id: true, optionCode: true },
      });
      if (!node || !issueType) invalidInput();
      if ((issueType.optionCode === "OTHER") !== (input.issueTypeOtherText !== null)) invalidInput();

      const now = new Date();
      const issue = await transaction.issue.create({ data: {
        issueNo: `ISS-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
        projectId: input.projectId,
        projectWorkflowStageId: input.projectWorkflowStageId,
        projectCompletionRequestId: closingRequest?.id ?? null,
        reportedByPersonId: input.actor.personId,
        reportedRoleCode: input.actor.roleCode,
        issueTypeOptionId: input.issueTypeOptionId,
        issueTypeOtherText: input.issueTypeOtherText,
        title: input.title,
        description: input.description,
        currentRiskLevel: closingRequest ? "BLOCKED" : input.currentRiskLevel,
        expectedSupport: input.expectedSupport,
        openedAt: now,
      } });
      if (input.actor.roleCode !== "PMO" && issueType.optionCode === "OTHER" && input.issueTypeOtherText) {
        await registerIssueTypeSuggestion(
          transaction,
          issue.id,
          input.actor.personId,
          input.issueTypeOtherText,
        );
      }
      if (closingRequest) await blockProjectCompletionForIssue(transaction, input.actor, closingRequest, issue.id, input.commandId, now);
      const state = await createHandlingState(transaction, issue, input.actor, "PMO_INITIAL_REVIEW", 1, now);
      const initialAssets = await loadIssueDraftAssets(transaction, input, "ISSUE", null);
      await bindIssueDraftAssets(transaction, input.actor, initialAssets, "ISSUE", { issueId: issue.id }, issue.id, now);
      if (input.actor.roleCode === "PMO") {
        if (!input.sharedSummary) invalidInput();
        const summary = await createSharedSummary(transaction, input.actor, issue, "INITIAL", input.sharedSummary, now);
        await notifyKeySubIs(transaction, input.actor, issue, {
          eventCode: "ISSUE_CREATED_BY_PMO",
          title: "PMO创建了项目问题",
          content: input.sharedSummary,
          issueSharedSummaryId: summary.id,
          occurrence: input.commandId,
        }, true);
      }
      await createStateActions(transaction, input.actor, issue, state);
      await addAudit(transaction, input.actor, issue, "ISSUE_CREATED", ["current_state", "current_risk_level"]);
      await synchronizeWorkflowCompletionIssueGateForNode(transaction, input.actor, issue.projectId, issue.projectWorkflowStageId);
      return mapIssue(await transaction.issue.findUniqueOrThrow({ where: { id: issue.id }, include: issueInclude }));
    });
  }

  async returnForSupplement(input: IssueMutationInput & { actor: CollaborationActor; reason: string }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requirePmo(transaction, input.actor);
      const issue = await requireIssue(transaction, input, ["PMO_INITIAL_REVIEW", "PMO_COORDINATION"]);
      const state = await transitionIssue(transaction, issue, input, "REPORTER_SUPPLEMENT", input.reason);
      await addActivity(transaction, input.actor, issue, state.id, "PMO_INTERNAL_NOTE", input.reason, "PMO_ONLY");
      await createStateActions(transaction, input.actor, issue, state);
      await addAudit(transaction, input.actor, issue, "ISSUE_RETURNED_FOR_SUPPLEMENT", ["current_state"]);
    });
  }

  async supplement(input: IssueMutationInput & {
    actor: CollaborationActor;
    latestProgress: string | null;
    supplementalDetail: string;
    expectedSupport: string | null;
    attachmentDraftIds: string[];
  }): Promise<void> {
    await this.runMutation(async (transaction) => {
      const issue = await requireIssue(transaction, input, ["REPORTER_SUPPLEMENT"]);
      await requireReporter(transaction, input.actor, issue);
      const detail = [input.latestProgress, input.supplementalDetail, input.expectedSupport].filter((value): value is string => Boolean(value)).join("\n");
      const state = await transitionIssue(transaction, issue, input, "PMO_INITIAL_REVIEW", "原提报人已补充并重提");
      const activity = await addActivity(transaction, input.actor, issue, state.id, "REPORTER_SUPPLEMENT", detail, "ISSUE_PARTICIPANTS");
      const assets = await loadIssueDraftAssets(transaction, input, "ISSUE_ACTIVITY", issue.id);
      await bindIssueDraftAssets(transaction, input.actor, assets, "ISSUE_ACTIVITY", { issueId: issue.id, issueActivityId: activity.id }, activity.id, new Date());
      await createStateActions(transaction, input.actor, issue, state);
      await addAudit(transaction, input.actor, issue, "ISSUE_SUPPLEMENTED", ["current_state"]);
    });
  }

  async appendCoordination(input: {
    actor: CollaborationActor;
    projectId: string;
    issueId: string;
    detail: string;
    visibilityScope: IssueVisibilityScope;
    expectedRowVersion?: number;
    attachmentDraftIds: string[];
    commandId: string;
  }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requirePmo(transaction, input.actor);
      await lockIssue(transaction, input.issueId);
      const issue = await requireIssueWithoutVersion(transaction, input.projectId, input.issueId, ["PMO_INITIAL_REVIEW", "PMO_COORDINATION"]);
      let stateId = issue.handlingStates[0]?.id ?? null;
      if (issue.handlingStates[0]?.stateCode === "PMO_INITIAL_REVIEW") {
        if (input.expectedRowVersion === undefined) invalidInput();
        const state = await transitionIssue(transaction, issue, { ...input, expectedRowVersion: input.expectedRowVersion }, "PMO_COORDINATION", "PMO已记录首条协调内容");
        stateId = state.id;
        await createStateActions(transaction, input.actor, issue, state);
      }
      const activity = await addActivity(transaction, input.actor, issue, stateId, "PMO_COORDINATION_UPDATE", input.detail, input.visibilityScope);
      const assets = await loadIssueDraftAssets(transaction, input, "ISSUE_ACTIVITY", issue.id);
      await bindIssueDraftAssets(transaction, input.actor, assets, "ISSUE_ACTIVITY", { issueId: issue.id, issueActivityId: activity.id }, activity.id, new Date());
      await addAudit(transaction, input.actor, issue, "ISSUE_COORDINATION_APPENDED", []);
    }, "ReadCommitted");
  }

  async submitResolution(input: IssueMutationInput & { actor: CollaborationActor; result: string; attachmentDraftIds: string[] }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requirePmo(transaction, input.actor);
      const issue = await requireIssue(transaction, input, ["PMO_COORDINATION"]);
      const state = await transitionIssue(transaction, issue, input, "REPORTER_RESOLUTION_CONFIRMATION", "PMO已提交处理结果");
      await transaction.issue.update({ where: { id: issue.id }, data: {
        confirmationRequestedAt: state.enteredAt,
        confirmationDueAt: state.dueAt,
        confirmationRoundNo: { increment: 1 },
        confirmationWaitDaysSnapshot: state.timeLimitDaysSnapshot,
        confirmationReminderIntervalDaysSnapshot: state.reminderIntervalDaysSnapshot,
      } });
      const activity = await addActivity(transaction, input.actor, issue, state.id, "PMO_COORDINATION_UPDATE", input.result, "ISSUE_PARTICIPANTS");
      const assets = await loadIssueDraftAssets(transaction, input, "ISSUE_ACTIVITY", issue.id);
      await bindIssueDraftAssets(transaction, input.actor, assets, "ISSUE_ACTIVITY", { issueId: issue.id, issueActivityId: activity.id }, activity.id, state.enteredAt);
      await createStateActions(transaction, input.actor, issue, state);
      await addAudit(transaction, input.actor, issue, "ISSUE_RESOLUTION_CONFIRMATION_REQUESTED", ["current_state", "confirmation_due_at"]);
    });
  }

  async closeInvalid(input: IssueMutationInput & {
    actor: CollaborationActor;
    reasonCode: IssueInvalidCloseReason;
    conclusionSummary: string;
    duplicateIssueId: string | null;
  }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requirePmo(transaction, input.actor);
      const issue = await requireIssue(transaction, input, ["PMO_INITIAL_REVIEW", "PMO_COORDINATION"]);
      if (input.duplicateIssueId) {
        const duplicate = await transaction.issue.findFirst({
          where: { id: input.duplicateIssueId, projectId: input.projectId },
          select: { id: true },
        });
        if (!duplicate || duplicate.id === issue.id) invalidInput();
      }
      const now = new Date();
      const state = await transitionIssue(transaction, issue, input, "CLOSED_INVALID", input.conclusionSummary, {
        closedAt: now,
        invalidCloseReasonCode: input.reasonCode,
        duplicateIssueId: input.duplicateIssueId,
      });
      await addActivity(transaction, input.actor, issue, state.id, "INVALID_CLOSURE_RECORDED", input.conclusionSummary, "ISSUE_PARTICIPANTS");
      const summary = await createSharedSummary(transaction, input.actor, issue, "INVALID_CLOSURE", input.conclusionSummary, now);
      await completeIssueActions(transaction, issue.id, input.actor, "问题已无效关闭", now);
      await notifyKeySubIs(transaction, input.actor, issue, {
        eventCode: "ISSUE_CLOSED_INVALID",
        title: "项目问题已无效关闭",
        content: input.conclusionSummary,
        issueSharedSummaryId: summary.id,
        occurrence: input.commandId,
      });
      await addAudit(transaction, input.actor, issue, "ISSUE_CLOSED_INVALID", ["current_state", "closed_at", "invalid_close_reason_code"]);
      await synchronizeWorkflowCompletionIssueGateForNode(transaction, input.actor, issue.projectId, issue.projectWorkflowStageId);
      await resumeProjectCompletionAfterIssueClear(transaction, input.actor, issue.projectCompletionRequestId, input.commandId, now);
    });
  }

  async escalateToDean(input: IssueMutationInput & {
    actor: CollaborationActor;
    pmoAssessment: string | null;
    recommendation: string | null;
    decisionQuestion: string;
    suggestedDeadline: string | null;
    attachmentDraftIds: string[];
  }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requirePmo(transaction, input.actor);
      const issue = await requireIssue(transaction, input, ["PMO_INITIAL_REVIEW", "PMO_COORDINATION"]);
      const state = await transitionIssue(transaction, issue, input, "DEAN_DECISION", "PMO升级院长决定");
      const roundNo = (await transaction.issueDecisionRound.count({ where: { issueId: issue.id } })) + 1;
      const round = await transaction.issueDecisionRound.create({ data: {
        projectId: issue.projectId,
        issueId: issue.id,
        roundNo,
        status: "PENDING_DEAN_DECISION",
        currentHandlingStateId: state.id,
      } });
      const activity = await addActivity(transaction, input.actor, issue, state.id, "PMO_COORDINATION_UPDATE", JSON.stringify({
        pmoAssessment: input.pmoAssessment,
        recommendation: input.recommendation,
        decisionQuestion: input.decisionQuestion,
        suggestedDeadline: input.suggestedDeadline,
      }), "PMO_AND_DEAN", round.id);
      const assets = await loadIssueDraftAssets(transaction, input, "ISSUE_ACTIVITY", issue.id);
      await bindIssueDraftAssets(transaction, input.actor, assets, "ISSUE_ACTIVITY", { issueId: issue.id, issueActivityId: activity.id }, activity.id, new Date());
      await createStateActions(transaction, input.actor, issue, state, round.id);
      await addAudit(transaction, input.actor, issue, "ISSUE_ESCALATED_TO_DEAN", ["current_state", "decision_round"]);
    });
  }

  async recordDeanDecision(input: Omit<RecordDeanDecisionInput, "implementationReviewRequired"> & {
    actor: CollaborationActor;
    implementationReviewRequired: boolean;
  }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requireDean(transaction, input.actor);
      const issue = await requireIssue(transaction, input, ["DEAN_DECISION"]);
      const round = await requireCurrentDecisionRound(transaction, issue.id, "PENDING_DEAN_DECISION");
      const now = new Date();
      const decision = await transaction.issueDeanDecision.create({ data: {
        projectId: issue.projectId,
        decisionRoundId: round.id,
        decisionCode: input.decisionCode,
        decisionContent: input.decisionContent,
        pmoImplementationInstruction: input.pmoImplementationInstruction,
        implementationReviewRequired: input.implementationReviewRequired,
        decidedByPersonId: input.actor.personId,
        decidedAt: now,
      } });
      const decisionAssets = await loadIssueDraftAssets(transaction, input, "ISSUE_DEAN_DECISION", issue.id);
      await bindIssueDraftAssets(transaction, input.actor, decisionAssets, "ISSUE_DEAN_DECISION", { issueId: issue.id, issueDeanDecisionId: decision.id }, decision.id, now);
      const state = await transitionIssue(transaction, issue, input, "PMO_IMPLEMENTATION", "院长已决定，待 PMO落实");
      await transaction.issueDecisionRound.update({
        where: { id: round.id },
        data: { status: "PENDING_PMO_IMPLEMENTATION", currentHandlingStateId: state.id, rowVersion: { increment: 1 } },
      });
      await addActivity(transaction, input.actor, issue, state.id, "DEAN_DECISION_RECORDED", input.decisionContent ?? input.decisionCode, "PMO_AND_DEAN", round.id);
      await createStateActions(transaction, input.actor, issue, state, round.id);
      await notifyKeySubIs(transaction, input.actor, issue, {
        eventCode: "ISSUE_DEAN_DECIDED",
        title: "院长已作出决定",
        content: "院长已决定，待 PMO落实。",
        issueDecisionRoundId: round.id,
        occurrence: input.commandId,
      });
      await addAudit(transaction, input.actor, issue, "ISSUE_DEAN_DECISION_RECORDED", ["current_state", "decision_code", "implementation_review_required"], decision.id);
    });
  }

  async requestDecisionSupplement(input: IssueMutationInput & { actor: CollaborationActor; reason: string }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requireDean(transaction, input.actor);
      const issue = await requireIssue(transaction, input, ["DEAN_DECISION"]);
      const round = await requireCurrentDecisionRound(transaction, issue.id, "PENDING_DEAN_DECISION");
      const state = await transitionIssue(transaction, issue, input, "PMO_DECISION_SUPPLEMENT", input.reason);
      await transaction.issueDecisionRound.update({ where: { id: round.id }, data: {
        status: "PENDING_PMO_SUPPLEMENT",
        currentHandlingStateId: state.id,
        rowVersion: { increment: 1 },
      } });
      await addActivity(transaction, input.actor, issue, state.id, "DEAN_DECISION_RECORDED", input.reason, "PMO_AND_DEAN", round.id);
      await createStateActions(transaction, input.actor, issue, state, round.id);
      await addAudit(transaction, input.actor, issue, "ISSUE_DECISION_SUPPLEMENT_REQUESTED", ["current_state", "decision_round"]);
    });
  }

  async resubmitDecisionMaterials(input: IssueMutationInput & { actor: CollaborationActor; content: string }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requirePmo(transaction, input.actor);
      const issue = await requireIssue(transaction, input, ["PMO_DECISION_SUPPLEMENT"]);
      const round = await requireCurrentDecisionRound(transaction, issue.id, "PENDING_PMO_SUPPLEMENT");
      const state = await transitionIssue(transaction, issue, input, "DEAN_DECISION", "PMO已补充决策材料");
      await transaction.issueDecisionRound.update({ where: { id: round.id }, data: {
        status: "PENDING_DEAN_DECISION",
        currentHandlingStateId: state.id,
        rowVersion: { increment: 1 },
      } });
      await addActivity(transaction, input.actor, issue, state.id, "PMO_COORDINATION_UPDATE", input.content, "PMO_AND_DEAN", round.id);
      await createStateActions(transaction, input.actor, issue, state, round.id);
      await addAudit(transaction, input.actor, issue, "ISSUE_DECISION_MATERIALS_RESUBMITTED", ["current_state", "decision_round"]);
    });
  }

  async submitImplementation(input: IssueMutationInput & {
    actor: CollaborationActor;
    decisionRoundId: string;
    resultSummary: string;
    attachmentDraftIds: string[];
  }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requirePmo(transaction, input.actor);
      const issue = await requireIssue(transaction, input, ["PMO_IMPLEMENTATION"]);
      const round = await requireDecisionRound(transaction, issue.id, input.decisionRoundId, "PENDING_PMO_IMPLEMENTATION");
      const decision = await transaction.issueDeanDecision.findUniqueOrThrow({ where: { decisionRoundId: round.id } });
      const now = new Date();
      const summary = await createSharedSummary(transaction, input.actor, issue, "IMPLEMENTATION", input.resultSummary, now, round.id);
      const submissionNo = (await transaction.issueImplementationSubmission.count({ where: { decisionRoundId: round.id } })) + 1;
      const submission = await transaction.issueImplementationSubmission.create({ data: {
        projectId: issue.projectId,
        decisionRoundId: round.id,
        submissionNo,
        submittedByPersonId: input.actor.personId,
        resultSummary: input.resultSummary,
        submittedAt: now,
      } });
      const submissionAssets = await loadIssueDraftAssets(transaction, input, "ISSUE_IMPLEMENTATION_SUBMISSION", issue.id);
      await bindIssueDraftAssets(transaction, input.actor, submissionAssets, "ISSUE_IMPLEMENTATION_SUBMISSION", { issueId: issue.id, issueImplementationSubmissionId: submission.id }, submission.id, now);
      await notifyKeySubIs(transaction, input.actor, issue, {
        eventCode: "ISSUE_IMPLEMENTATION_SUMMARY_PUBLISHED",
        title: "PMO提交了项目成员可见落实结果",
        content: input.resultSummary,
        issueDecisionRoundId: round.id,
        issueSharedSummaryId: summary.id,
        occurrence: input.commandId,
      });
      const next = decision.implementationReviewRequired
        ? "DEAN_IMPLEMENTATION_CONFIRMATION"
        : "REPORTER_RESOLUTION_CONFIRMATION";
      const state = await transitionIssue(transaction, issue, input, next, "PMO已提交落实结果");
      await transaction.issueDecisionRound.update({ where: { id: round.id }, data: {
        status: decision.implementationReviewRequired ? "PENDING_DEAN_REVIEW" : "PENDING_REPORTER_CONFIRMATION",
        currentHandlingStateId: state.id,
        rowVersion: { increment: 1 },
      } });
      await addActivity(transaction, input.actor, issue, state.id, "PMO_IMPLEMENTATION_UPDATE", input.resultSummary, "ISSUE_PARTICIPANTS", round.id);
      await createStateActions(transaction, input.actor, issue, state, round.id, submission.id);
      await addAudit(transaction, input.actor, issue, "ISSUE_IMPLEMENTATION_SUBMITTED", ["current_state", "implementation_submission"], submission.id);
    });
  }

  async reviewImplementation(input: IssueMutationInput & {
    actor: CollaborationActor;
    decision: "ACCEPTED" | "RETURNED";
    comment: string | null;
  }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requireDean(transaction, input.actor);
      const issue = await requireIssue(transaction, input, ["DEAN_IMPLEMENTATION_CONFIRMATION"]);
      const round = await requireCurrentDecisionRound(transaction, issue.id, "PENDING_DEAN_REVIEW");
      const decision = await transaction.issueDeanDecision.findUniqueOrThrow({ where: { decisionRoundId: round.id } });
      const transfer = await transaction.issueDeanReviewTransfer.findFirst({
        where: { decisionRoundId: round.id, acceptedAt: { not: null } },
        orderBy: { acceptedAt: "desc" },
      });
      const responsibleDeanId = transfer?.acceptedByDeanPersonId ?? decision.decidedByPersonId;
      if (responsibleDeanId !== input.actor.personId) throw new CollaborationError("COLLABORATION_FORBIDDEN");
      const submission = await transaction.issueImplementationSubmission.findFirstOrThrow({
        where: { decisionRoundId: round.id },
        orderBy: { submissionNo: "desc" },
      });
      await transaction.issueImplementationReview.create({ data: {
        projectId: issue.projectId,
        implementationSubmissionId: submission.id,
        reviewedByPersonId: input.actor.personId,
        decision: input.decision,
        comment: input.comment,
        reviewedAt: new Date(),
      } });
      const next = input.decision === "ACCEPTED" ? "REPORTER_RESOLUTION_CONFIRMATION" : "PMO_IMPLEMENTATION";
      const reviewDetail = input.comment ?? "院长已复核通过";
      const state = await transitionIssue(transaction, issue, input, next, reviewDetail);
      await transaction.issueDecisionRound.update({ where: { id: round.id }, data: {
        status: input.decision === "ACCEPTED" ? "PENDING_REPORTER_CONFIRMATION" : "PENDING_PMO_IMPLEMENTATION",
        currentHandlingStateId: state.id,
        rowVersion: { increment: 1 },
      } });
      await addActivity(transaction, input.actor, issue, state.id, "DEAN_IMPLEMENTATION_REVIEWED", reviewDetail, "PMO_AND_DEAN", round.id);
      await createStateActions(transaction, input.actor, issue, state, round.id);
      await addAudit(transaction, input.actor, issue, "ISSUE_IMPLEMENTATION_REVIEWED", ["current_state", "implementation_review"]);
    });
  }

  async requestDeanReviewTransfer(input: IssueMutationInput & {
    actor: CollaborationActor;
    decisionRoundId: string;
    reason: string;
  }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requirePmo(transaction, input.actor);
      const issue = await requireIssue(transaction, input, ["DEAN_IMPLEMENTATION_CONFIRMATION"]);
      const round = await requireDecisionRound(transaction, issue.id, input.decisionRoundId, "PENDING_DEAN_REVIEW");
      const decision = await transaction.issueDeanDecision.findUniqueOrThrow({ where: { decisionRoundId: round.id } });
      const originalDean = await transaction.person.findUnique({ where: { id: decision.decidedByPersonId }, select: { accountStatus: true } });
      const activeRole = await transaction.roleAssignment.findFirst({
        where: { personId: decision.decidedByPersonId, roleCode: "DEAN", projectId: null, assignmentStatus: "ACTIVE" },
        select: { id: true },
      });
      const currentState = issue.handlingStates[0];
      const overdue = Boolean(currentState?.dueAt && currentState.dueAt.getTime() < Date.now());
      if (originalDean?.accountStatus === "ACTIVE" && activeRole && !overdue) {
        throw new CollaborationError("ISSUE_INVALID_TRANSITION");
      }
      const existing = await transaction.issueDeanReviewTransfer.findFirst({
        where: { decisionRoundId: round.id, acceptedAt: null },
        select: { id: true },
      });
      if (existing) throw new CollaborationError("ISSUE_CONFLICT");
      const transfer = await transaction.issueDeanReviewTransfer.create({ data: {
        projectId: issue.projectId,
        decisionRoundId: round.id,
        fromDeanPersonId: decision.decidedByPersonId,
        requestedByPmoPersonId: input.actor.personId,
        requestReason: input.reason,
        requestedAt: new Date(),
      } });
      await bumpIssue(transaction, issue.id, input.expectedRowVersion);
      await addAudit(transaction, input.actor, issue, "ISSUE_DEAN_REVIEW_TRANSFER_REQUESTED", ["review_transfer"], transfer.id);
    });
  }

  async acceptDeanReviewTransfer(input: IssueMutationInput & { actor: CollaborationActor; transferId: string }): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requireDean(transaction, input.actor);
      const issue = await requireIssue(transaction, input, ["DEAN_IMPLEMENTATION_CONFIRMATION"]);
      const transfer = await transaction.issueDeanReviewTransfer.findFirst({
        where: { id: input.transferId, projectId: issue.projectId, decisionRound: { issueId: issue.id }, acceptedAt: null },
      });
      if (!transfer || transfer.fromDeanPersonId === input.actor.personId) {
        throw new CollaborationError("ISSUE_INVALID_TRANSITION");
      }
      const accepted = await transaction.issueDeanReviewTransfer.updateMany({
        where: { id: transfer.id, acceptedAt: null },
        data: { acceptedByDeanPersonId: input.actor.personId, acceptedAt: new Date() },
      });
      if (accepted.count !== 1) throw new CollaborationError("ISSUE_CONFLICT");
      await bumpIssue(transaction, issue.id, input.expectedRowVersion);
      await addAudit(transaction, input.actor, issue, "ISSUE_DEAN_REVIEW_TRANSFER_ACCEPTED", ["review_transfer"], transfer.id);
    });
  }

  async confirmResolution(input: IssueMutationInput & {
    actor: CollaborationActor;
    resolved: boolean;
    confirmation: string | null;
  }): Promise<void> {
    await this.runMutation(async (transaction) => {
      const issue = await requireIssue(transaction, input, ["REPORTER_RESOLUTION_CONFIRMATION"]);
      await requireReporter(transaction, input.actor, issue);
      const round = await transaction.issueDecisionRound.findFirst({
        where: { issueId: issue.id, status: "PENDING_REPORTER_CONFIRMATION" },
        orderBy: { roundNo: "desc" },
      });
      const now = new Date();
      const next = input.resolved ? "RESOLVED" : "PMO_COORDINATION";
      const confirmationDetail = input.confirmation ?? "原提报人已确认解决";
      const state = await transitionIssue(transaction, issue, input, next, confirmationDetail, input.resolved ? {
        resolvedAt: now,
        resolutionMethod: "REPORTER_CONFIRMED",
        resolvedByPersonId: input.actor.personId,
      } : undefined);
      if (round) {
        await transaction.issueDecisionRound.update({ where: { id: round.id }, data: {
          status: "COMPLETED",
          currentHandlingStateId: state.id,
          completedAt: now,
          rowVersion: { increment: 1 },
        } });
      }
      await addActivity(transaction, input.actor, issue, state.id, "REPORTER_RESOLUTION_RESPONSE", confirmationDetail, "ISSUE_PARTICIPANTS", round?.id);
      if (input.resolved) {
        const latestPublic = await transaction.issueSharedSummary.findFirst({
          where: { issueId: issue.id, summaryType: { in: ["IMPLEMENTATION", "COORDINATION"] } },
          orderBy: { publishedAt: "desc" },
          select: { content: true },
        });
        const publicResult = input.confirmation ?? latestPublic?.content ?? confirmationDetail;
        const summary = await createSharedSummary(transaction, input.actor, issue, "RESOLUTION", publicResult, now, round?.id);
        await completeIssueActions(transaction, issue.id, input.actor, "问题已确认解决", now);
        await notifyKeySubIs(transaction, input.actor, issue, {
          eventCode: "ISSUE_RESOLVED",
          title: "项目问题已解决",
          content: publicResult,
          issueDecisionRoundId: round?.id,
          issueSharedSummaryId: summary.id,
          occurrence: input.commandId,
        });
        await synchronizeWorkflowCompletionIssueGateForNode(transaction, input.actor, issue.projectId, issue.projectWorkflowStageId);
        await resumeProjectCompletionAfterIssueClear(transaction, input.actor, issue.projectCompletionRequestId, input.commandId, now);
      } else {
        await createStateActions(transaction, input.actor, issue, state);
      }
      await addAudit(transaction, input.actor, issue, input.resolved ? "ISSUE_RESOLVED" : "ISSUE_REOPENED_COORDINATION", ["current_state", "resolved_at"]);
    });
  }

  private async runMutation<T>(
    operation: (transaction: Transaction) => Promise<T>,
    isolationLevel: Prisma.TransactionIsolationLevel = "Serializable",
  ): Promise<T> {
    try {
      return await this.client.$transaction(operation, { isolationLevel });
    } catch (error) {
      if (isDatabaseConflict(error)) throw new CollaborationError("ISSUE_CONFLICT");
      throw error;
    }
  }
}

async function requireReadableProject(client: DatabaseClient, actor: CollaborationActor, projectId: string): Promise<void> {
  await requireActiveSession(client, actor);
  if (actor.roleCode === "PMO" || actor.roleCode === "DEAN") {
    await requireGlobalRole(client, actor, actor.roleCode);
  } else {
    const assignment = await client.roleAssignment.findFirst({
      where: { projectId, personId: actor.personId, roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } },
      select: { id: true },
    });
    if (!assignment) forbidden();
  }
  const project = await client.project.findFirst({
    where: { id: projectId, projectCode: { not: null }, status: { in: ["ACTIVE", "CLOSING", "COMPLETED", "ARCHIVED"] } },
    select: { id: true },
  });
  if (!project) throw new CollaborationError("PROJECT_NOT_FOUND");
}

async function blockProjectCompletionForIssue(
  transaction: Transaction,
  actor: CollaborationActor,
  request: { id: string; rowVersion: number },
  issueId: string,
  occurrence: string,
  now: Date,
): Promise<void> {
  await transaction.projectCompletionReviewRound.updateMany({
    where: { completionRequestId: request.id, status: "ACTIVE" },
    data: { status: "BLOCKED_ENDED", completedAt: now, completedByPersonId: actor.personId, comment: "结题期间出现新的未关闭问题" },
  });
  const changed = await transaction.projectCompletionRequest.updateMany({
    where: { id: request.id, rowVersion: request.rowVersion, status: { in: ["CLOSURE_PENDING_PMO_REVIEW", "CLOSURE_RETURNED_FOR_SUPPLEMENT", "CLOSURE_BLOCKED"] } },
    data: { status: "CLOSURE_BLOCKED", rowVersion: { increment: 1 } },
  });
  if (changed.count !== 1) throw new CollaborationError("ISSUE_CONFLICT");
  await transaction.projectCompletionBlock.create({ data: { projectId: (await transaction.projectCompletionRequest.findUniqueOrThrow({ where: { id: request.id } })).projectId, completionRequestId: request.id, blockType: "OPEN_ISSUE", sourceIssueId: issueId, summary: "结题期间出现未关闭问题", openedAt: now } });
  await transaction.projectCompletionActivity.create({ data: { projectId: (await transaction.projectCompletionRequest.findUniqueOrThrow({ where: { id: request.id } })).projectId, completionRequestId: request.id, activityType: "PAUSED", actorPersonId: actor.personId, actorRoleCode: actor.roleCode, content: "结题因新问题受阻", createdAt: now } });
  await transaction.notification.updateMany({ where: { projectCompletionRequestId: request.id, messageKind: "ACTION", actionStatus: "PENDING" }, data: { actionStatus: "COMPLETED", actionCompletedAt: now, actionCompletionReason: "结题因新问题受阻" } });
  await transaction.auditLog.create({ data: { actorPersonId: actor.personId, actorRoleCode: actor.roleCode, sessionId: actor.sessionId, actionCode: "PROJECT_COMPLETION_BLOCKED_BY_ISSUE", result: "SUCCESS", projectId: (await transaction.projectCompletionRequest.findUniqueOrThrow({ where: { id: request.id } })).projectId, entityType: "PROJECT_COMPLETION_REQUEST", entityId: request.id, summary: "结题因新问题受阻", changedFields: ["status", "open_issue"], correlationId: occurrence } });
}

async function resumeProjectCompletionAfterIssueClear(transaction: Transaction, actor: CollaborationActor, requestId: string | null, occurrence: string, now: Date): Promise<void> {
  if (!requestId) return;
  await transaction.projectCompletionBlock.updateMany({ where: { completionRequestId: requestId, sourceIssue: { resolvedAt: { not: null } }, clearedAt: null }, data: { clearedAt: now } });
  await transaction.projectCompletionBlock.updateMany({ where: { completionRequestId: requestId, sourceIssue: { closedAt: { not: null } }, clearedAt: null }, data: { clearedAt: now } });
  const request = await transaction.projectCompletionRequest.findUnique({ where: { id: requestId }, select: { projectId: true, rowVersion: true, status: true } });
  if (!request || request.status !== "CLOSURE_BLOCKED") return;
  if (await transaction.projectCompletionBlock.count({ where: { completionRequestId: requestId, clearedAt: null } })) return;
  const setting = await transaction.collaborationTimeLimitSetting.findFirst({ where: { responsibilityType: "PROJECT_COMPLETION_PMO_REVIEW", OR: [{ projectId: request.projectId }, { projectId: null }] }, orderBy: { projectId: "desc" } });
  if (!setting) throw new CollaborationError("ISSUE_CONFLICT");
  const roundNo = (await transaction.projectCompletionReviewRound.count({ where: { completionRequestId: requestId } })) + 1;
  const round = await transaction.projectCompletionReviewRound.create({ data: { projectId: request.projectId, completionRequestId: requestId, roundNo, status: "ACTIVE", timeLimitDaysSnapshot: setting.timeLimitDays, reminderIntervalDaysSnapshot: setting.reminderIntervalDays, startedAt: now, dueAt: addDays(now, setting.timeLimitDays) } });
  const changed = await transaction.projectCompletionRequest.updateMany({ where: { id: requestId, rowVersion: request.rowVersion, status: "CLOSURE_BLOCKED" }, data: { status: "CLOSURE_PENDING_PMO_REVIEW", rowVersion: { increment: 1 } } });
  if (changed.count !== 1) throw new CollaborationError("ISSUE_CONFLICT");
  const event = await transaction.projectCompletionActivity.create({ data: { projectId: request.projectId, completionRequestId: requestId, activityType: "REVIEW_RESUMED", actorPersonId: actor.personId, actorRoleCode: actor.roleCode, content: "全部结题阻塞原因已清除，创建新的 PMO复核轮次", createdAt: now } });
  const pmos = await transaction.roleAssignment.findMany({ where: { projectId: null, roleCode: "PMO", assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } }, distinct: ["personId"], select: { personId: true } });
  const data: Prisma.NotificationCreateManyInput[] = pmos.map(({ personId }) => ({ recipientPersonId: personId, recipientRoleCode: "PMO", notificationType: "PROJECT_REVIEW_NOTICE", eventCode: "PROJECT_COMPLETION_REVIEW_RESUMED", triggeredByPersonId: actor.personId, triggeredByRoleCode: actor.roleCode, projectId: request.projectId, projectCompletionRequestId: requestId, projectCompletionActivityId: event.id, projectCompletionReviewRoundId: round.id, title: "项目结题恢复复核", content: "全部阻塞原因已清除，请重新复核。", eventKey: `PROJECT_COMPLETION_REVIEW_RESUMED:${requestId}:${occurrence}:${personId}`, messageKind: "ACTION", actionStatus: "PENDING", actionGroupKey: `completion:${round.id}` }));
  await transaction.notification.createMany({ data, skipDuplicates: true });
  await transaction.auditLog.create({ data: { actorPersonId: actor.personId, actorRoleCode: actor.roleCode, sessionId: actor.sessionId, actionCode: "PROJECT_COMPLETION_REVIEW_RESUMED", result: "SUCCESS", projectId: request.projectId, entityType: "PROJECT_COMPLETION_REQUEST", entityId: requestId, summary: "结题阻塞清除后恢复复核", changedFields: ["status", "review_round"], correlationId: occurrence } });
}

async function requireWritableProject(client: DatabaseClient, actor: CollaborationActor, projectId: string): Promise<void> {
  await requireReadableProject(client, actor, projectId);
  const project = await client.project.findFirst({ where: { id: projectId, status: { in: ["ACTIVE", "CLOSING"] } }, select: { id: true } });
  if (!project) throw new CollaborationError("PROJECT_NOT_ACTIVE");
}

async function requirePmo(client: DatabaseClient, actor: CollaborationActor): Promise<void> {
  await requireActiveSession(client, actor);
  if (actor.roleCode !== "PMO") forbidden();
  await requireGlobalRole(client, actor, "PMO");
}

async function requireDean(client: DatabaseClient, actor: CollaborationActor): Promise<void> {
  await requireActiveSession(client, actor);
  if (actor.roleCode !== "DEAN") forbidden();
  await requireGlobalRole(client, actor, "DEAN");
}

async function requireActiveSession(client: DatabaseClient, actor: CollaborationActor): Promise<void> {
  const session = await client.session.findFirst({
    where: { id: actor.sessionId, personId: actor.personId, activeRoleCode: actor.roleCode, revokedAt: null, expiresAt: { gt: new Date() }, person: { accountStatus: "ACTIVE" } },
    select: { id: true },
  });
  if (!session) forbidden();
}

async function requireGlobalRole(client: DatabaseClient, actor: CollaborationActor, roleCode: "PMO" | "DEAN"): Promise<void> {
  const assignment = await client.roleAssignment.findFirst({
    where: { personId: actor.personId, roleCode, projectId: null, assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } },
    select: { id: true },
  });
  if (!assignment) forbidden();
}

async function requireIssue(
  transaction: Transaction,
  input: IssueMutationInput & { actor: CollaborationActor },
  states: readonly IssueHandlingState[],
): Promise<IssueRow> {
  await requireReadableProject(transaction, input.actor as CollaborationActor, input.projectId);
  const writableProject = await transaction.project.findFirst({
    where: { id: input.projectId, status: { in: ["ACTIVE", "CLOSING"] } },
    select: { id: true },
  });
  if (!writableProject) throw new CollaborationError("PROJECT_NOT_ACTIVE");
  const issue = await transaction.issue.findFirst({
    where: { id: input.issueId, projectId: input.projectId, rowVersion: input.expectedRowVersion },
    include: issueInclude,
  });
  if (!issue) throw new CollaborationError("ISSUE_CONFLICT");
  if (!issue.handlingStates[0] || !states.includes(issue.handlingStates[0].stateCode)) {
    throw new CollaborationError("ISSUE_INVALID_TRANSITION");
  }
  return issue;
}

async function requireIssueWithoutVersion(
  transaction: Transaction,
  projectId: string,
  issueId: string,
  states: readonly IssueHandlingState[],
): Promise<IssueRow> {
  const issue = await transaction.issue.findFirst({ where: { id: issueId, projectId }, include: issueInclude });
  if (!issue) throw new CollaborationError("ISSUE_NOT_FOUND");
  if (!issue.handlingStates[0] || !states.includes(issue.handlingStates[0].stateCode)) {
    throw new CollaborationError("ISSUE_INVALID_TRANSITION");
  }
  return issue;
}

async function requireReporter(client: DatabaseClient, actor: CollaborationActor, issue: IssueRow): Promise<void> {
  await requireActiveSession(client, actor);
  if (issue.reportedByPersonId !== actor.personId || issue.reportedRoleCode !== actor.roleCode) {
    throw new CollaborationError("ISSUE_REPORTER_FORBIDDEN");
  }
  if (actor.roleCode === "PMO") await requireGlobalRole(client, actor, "PMO");
  else if (actor.roleCode === "KEY_SUB_I") await requireReadableProject(client, actor, issue.projectId);
  else forbidden();
}

async function createHandlingState(
  transaction: Transaction,
  issue: { id: string; projectId: string; reportedByPersonId: string },
  actor: CollaborationActor,
  stateCode: IssueHandlingState,
  responsibilityRoundNo: number,
  enteredAt: Date,
) {
  const responsibility = stateResponsibility(stateCode, issue.reportedByPersonId);
  const setting = responsibility.settingType
    ? await effectiveTimeLimit(transaction, issue.projectId, responsibility.settingType)
    : null;
  return transaction.issueHandlingState.create({ data: {
    projectId: issue.projectId,
    issueId: issue.id,
    stateCode,
    responsibilityRoundNo,
    requiredRoleCode: responsibility.requiredRoleCode,
    requiredPersonId: responsibility.requiredPersonId,
    enteredByPersonId: actor.personId,
    enteredByRoleCode: actor.roleCode,
    enteredAt,
    timeLimitDaysSnapshot: setting?.timeLimitDays ?? null,
    reminderIntervalDaysSnapshot: setting?.reminderIntervalDays ?? null,
    dueAt: setting ? addDays(enteredAt, setting.timeLimitDays) : null,
  } });
}

async function transitionIssue(
  transaction: Transaction,
  issue: IssueRow,
  input: IssueMutationInput & { actor: CollaborationActor },
  target: IssueHandlingState,
  reason: string,
  issueData?: Prisma.IssueUncheckedUpdateManyInput,
) {
  const current = issue.handlingStates[0];
  if (!current) throw new CollaborationError("ISSUE_CONFLICT");
  assertIssueTransition(current.stateCode, target);
  const now = new Date();
  const changed = await transaction.issue.updateMany({
    where: { id: issue.id, rowVersion: input.expectedRowVersion },
    data: { ...issueData, rowVersion: { increment: 1 } },
  });
  if (changed.count !== 1) throw new CollaborationError("ISSUE_CONFLICT");
  await transaction.issueHandlingState.update({
    where: { id: current.id },
    data: { exitedAt: now, transitionReason: reason },
  });
  await completeIssueActions(transaction, issue.id, input.actor, reason, now);
  return createHandlingState(transaction, issue, input.actor as CollaborationActor, target, current.responsibilityRoundNo + 1, now);
}

function stateResponsibility(state: IssueHandlingState, reporterPersonId: string) {
  switch (state) {
    case "PMO_INITIAL_REVIEW":
    case "PMO_COORDINATION":
    case "PMO_DECISION_SUPPLEMENT":
      return { requiredRoleCode: "PMO" as const, requiredPersonId: null, settingType: null };
    case "REPORTER_SUPPLEMENT":
      return { requiredRoleCode: null, requiredPersonId: reporterPersonId, settingType: "ISSUE_REPORTER_SUPPLEMENT" as const };
    case "DEAN_DECISION":
      return { requiredRoleCode: "DEAN" as const, requiredPersonId: null, settingType: "ISSUE_DEAN_DECISION" as const };
    case "PMO_IMPLEMENTATION":
      return { requiredRoleCode: "PMO" as const, requiredPersonId: null, settingType: "ISSUE_PMO_IMPLEMENTATION" as const };
    case "DEAN_IMPLEMENTATION_CONFIRMATION":
      return { requiredRoleCode: "DEAN" as const, requiredPersonId: null, settingType: null };
    case "REPORTER_RESOLUTION_CONFIRMATION":
      return { requiredRoleCode: null, requiredPersonId: reporterPersonId, settingType: "ISSUE_REPORTER_CONFIRMATION" as const };
    case "RESOLVED":
    case "CLOSED_INVALID":
      return { requiredRoleCode: null, requiredPersonId: null, settingType: null };
  }
}

async function effectiveTimeLimit(transaction: Transaction, projectId: string, responsibilityType: "ISSUE_DEAN_DECISION" | "ISSUE_PMO_IMPLEMENTATION" | "ISSUE_REPORTER_SUPPLEMENT" | "ISSUE_REPORTER_CONFIRMATION") {
  const project = await transaction.collaborationTimeLimitSetting.findUnique({
    where: { projectId_responsibilityType: { projectId, responsibilityType } },
  });
  const setting = project ?? await transaction.collaborationTimeLimitSetting.findFirst({
    where: { projectId: null, responsibilityType },
  });
  if (!setting) throw new CollaborationError("ISSUE_CONFLICT");
  return setting;
}

async function bumpIssue(transaction: Transaction, issueId: string, rowVersion: number): Promise<void> {
  const changed = await transaction.issue.updateMany({ where: { id: issueId, rowVersion }, data: { rowVersion: { increment: 1 } } });
  if (changed.count !== 1) throw new CollaborationError("ISSUE_CONFLICT");
}

async function addActivity(
  transaction: Transaction,
  actor: CollaborationActor,
  issue: { id: string; projectId: string; reportedRoleCode: "PMO" | "KEY_SUB_I" | "DEAN" | "CRC" | "STATISTICIAN" | "COLLABORATION_LEAD" },
  handlingStateId: string | null,
  activityType: "REPORTER_SUPPLEMENT" | "PMO_INTERNAL_NOTE" | "PMO_COORDINATION_UPDATE" | "DEAN_DECISION_RECORDED" | "PMO_IMPLEMENTATION_UPDATE" | "DEAN_IMPLEMENTATION_REVIEWED" | "REPORTER_RESOLUTION_RESPONSE" | "INVALID_CLOSURE_RECORDED",
  detail: string,
  visibilityScope: IssueVisibilityScope,
  decisionRoundId?: string,
) {
  const aggregate = await transaction.issueActivity.aggregate({ where: { issueId: issue.id }, _max: { sequenceNo: true } });
  return transaction.issueActivity.create({ data: {
    projectId: issue.projectId,
    issueId: issue.id,
    handlingStateId,
    decisionRoundId,
    sequenceNo: (aggregate._max.sequenceNo ?? 0) + 1,
    activityType,
    performedByPersonId: actor.personId,
    performedRoleCode: actor.roleCode,
    detail,
    visibilityScope,
  } });
}

async function createSharedSummary(
  transaction: Transaction,
  actor: CollaborationActor,
  issue: { id: string; projectId: string },
  summaryType: "INITIAL" | "COORDINATION" | "IMPLEMENTATION" | "RESOLUTION" | "INVALID_CLOSURE",
  content: string,
  publishedAt: Date,
  decisionRoundId?: string,
) {
  return transaction.issueSharedSummary.create({ data: {
    projectId: issue.projectId,
    issueId: issue.id,
    decisionRoundId,
    summaryType,
    content,
    publishedByPersonId: actor.personId,
    publishedRoleCode: actor.roleCode,
    publishedAt,
  } });
}

async function requireCurrentDecisionRound(transaction: Transaction, issueId: string, status: "PENDING_DEAN_DECISION" | "PENDING_PMO_SUPPLEMENT" | "PENDING_DEAN_REVIEW" | "PENDING_REPORTER_CONFIRMATION") {
  const round = await transaction.issueDecisionRound.findFirst({ where: { issueId, status }, orderBy: { roundNo: "desc" } });
  if (!round) throw new CollaborationError("ISSUE_CONFLICT");
  return round;
}

async function requireDecisionRound(transaction: Transaction, issueId: string, decisionRoundId: string, status: "PENDING_PMO_IMPLEMENTATION" | "PENDING_DEAN_REVIEW") {
  const round = await transaction.issueDecisionRound.findFirst({ where: { id: decisionRoundId, issueId, status } });
  if (!round) throw new CollaborationError("ISSUE_CONFLICT");
  return round;
}

async function createStateActions(
  transaction: Transaction,
  actor: CollaborationActor,
  issue: { id: string; projectId: string; reportedRoleCode: "PMO" | "KEY_SUB_I" | "DEAN" | "CRC" | "STATISTICIAN" | "COLLABORATION_LEAD" },
  state: { id: string; stateCode: IssueHandlingState; responsibilityRoundNo: number; requiredRoleCode: string | null; requiredPersonId: string | null },
  decisionRoundId?: string,
  implementationSubmissionId?: string,
): Promise<void> {
  let recipients: Array<{ personId: string }> = [];
  if (state.requiredPersonId) recipients = [{ personId: state.requiredPersonId }];
  else if (state.requiredRoleCode === "PMO" || state.requiredRoleCode === "DEAN") {
    recipients = await transaction.roleAssignment.findMany({
      where: { roleCode: state.requiredRoleCode, projectId: null, assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } },
      distinct: ["personId"],
      select: { personId: true },
    });
  }
  if (!recipients.length) return;
  const group = `issue-state:${state.id}`;
  await transaction.notification.createMany({ data: recipients.map(({ personId }) => ({
    recipientPersonId: personId,
    recipientRoleCode: state.requiredRoleCode === "PMO" || state.requiredRoleCode === "DEAN" ? state.requiredRoleCode : issue.reportedRoleCode,
    notificationType: "ISSUE_MESSAGE" as const,
    eventCode: "ISSUE_ACTION_REQUIRED",
    triggeredByPersonId: actor.personId,
    triggeredByRoleCode: actor.roleCode,
    projectId: issue.projectId,
    issueId: issue.id,
    issueHandlingStateId: state.id,
    issueDecisionRoundId: decisionRoundId,
    issueImplementationSubmissionId: implementationSubmissionId,
    title: "项目问题待处理",
    content: `问题已进入 ${state.stateCode}。`,
    eventKey: `${group}:${personId}`,
    messageKind: "ACTION" as const,
    actionStatus: "PENDING" as const,
    actionGroupKey: group,
  })), skipDuplicates: true });
}

async function completeIssueActions(transaction: Transaction, issueId: string, actor: CollaborationActor, reason: string, at: Date): Promise<void> {
  const actions = await transaction.notification.findMany({
    where: { issueId, messageKind: "ACTION", actionStatus: "PENDING" },
    select: { recipientPersonId: true, recipientRoleCode: true, projectId: true, issueHandlingStateId: true, actionGroupKey: true },
  });
  await transaction.notification.updateMany({
    where: { issueId, messageKind: "ACTION", actionStatus: "PENDING" },
    data: { actionStatus: "COMPLETED", actionCompletedAt: at, actionCompletionReason: reason },
  });
  const others = actions.filter((action) => action.actionGroupKey && action.recipientPersonId !== actor.personId);
  if (others.length) await transaction.notification.createMany({ data: others.map((action) => ({
    recipientPersonId: action.recipientPersonId,
    recipientRoleCode: action.recipientRoleCode,
    notificationType: "ISSUE_MESSAGE" as const,
    eventCode: "ISSUE_SHARED_ACTION_RESULT",
    triggeredByPersonId: actor.personId,
    triggeredByRoleCode: actor.roleCode,
    projectId: action.projectId,
    issueId,
    issueHandlingStateId: action.issueHandlingStateId,
    title: "问题待办已由其他责任人处理",
    content: `${actor.roleCode}已处理：${reason}`,
    eventKey: `${action.actionGroupKey}:result:${action.recipientPersonId}`,
    messageKind: "INFORMATIONAL" as const,
    actionStatus: "NOT_APPLICABLE" as const,
  })), skipDuplicates: true });
}

async function notifyKeySubIs(
  transaction: Transaction,
  actor: CollaborationActor,
  issue: { id: string; projectId: string },
  event: {
    eventCode: string;
    title: string;
    content: string;
    occurrence: string;
    issueDecisionRoundId?: string;
    issueSharedSummaryId?: string;
  },
  recipientsRequired = false,
): Promise<void> {
  const recipients = await transaction.roleAssignment.findMany({
    where: { projectId: issue.projectId, roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } },
    distinct: ["personId"],
    select: { personId: true },
  });
  if (!recipients.length) {
    if (recipientsRequired) throw new CollaborationError("ISSUE_NOTIFICATION_RECIPIENT_REQUIRED");
    return;
  }
  await transaction.notification.createMany({ data: recipients.map(({ personId }) => ({
    recipientPersonId: personId,
    recipientRoleCode: "KEY_SUB_I" as const,
    notificationType: "ISSUE_MESSAGE" as const,
    eventCode: event.eventCode,
    triggeredByPersonId: actor.personId,
    triggeredByRoleCode: actor.roleCode,
    projectId: issue.projectId,
    issueId: issue.id,
    issueDecisionRoundId: event.issueDecisionRoundId,
    issueSharedSummaryId: event.issueSharedSummaryId,
    title: event.title,
    content: event.content,
    eventKey: `${event.eventCode}:${issue.id}:${event.occurrence}:${personId}`,
    messageKind: "INFORMATIONAL" as const,
    actionStatus: "NOT_APPLICABLE" as const,
  })), skipDuplicates: true });
}

async function addAudit(
  transaction: Transaction,
  actor: CollaborationActor,
  issue: { id: string; issueNo: string; projectId: string },
  actionCode: string,
  changedFields: string[],
  entityId = issue.id,
): Promise<void> {
  await transaction.auditLog.create({ data: {
    actorPersonId: actor.personId,
    actorRoleCode: actor.roleCode,
    sessionId: actor.sessionId,
    actionCode,
    result: "SUCCESS",
    projectId: issue.projectId,
    entityType: "ISSUE",
    entityId,
    entityBusinessCode: issue.issueNo,
    summary: "处理项目问题",
    changedFields,
    correlationId: randomUUID(),
  } });
}

type IssueDraftAsset = {
  draftId: string;
  draftRowVersion: number;
  projectId: string;
  visibilityScope: "PROJECT_SHARED" | IssueVisibilityScope;
  purposeCode: string;
  assetId: string;
};

async function loadIssueDraftAssets(
  transaction: Transaction,
  input: { projectId: string; actor: CollaborationActor; attachmentDraftIds: string[] },
  parentType: "ISSUE" | "ISSUE_ACTIVITY" | "ISSUE_DEAN_DECISION" | "ISSUE_IMPLEMENTATION_SUBMISSION",
  issueId: string | null,
): Promise<IssueDraftAsset[]> {
  const draftIds = [...new Set(input.attachmentDraftIds)];
  if (draftIds.length !== input.attachmentDraftIds.length || draftIds.length > 10) invalidInput();
  if (!draftIds.length) return [];
  const drafts = await transaction.attachmentDraft.findMany({
    where: {
      id: { in: draftIds },
      projectId: input.projectId,
      issueId,
      parentType,
      uploaderPersonId: input.actor.personId,
      uploaderRoleCode: input.actor.roleCode,
      status: "OPEN",
      expiresAt: { gt: new Date() },
    },
    include: { uploadSessions: { include: { fileAssets: true } } },
  });
  if (drafts.length !== draftIds.length) invalidInput();
  const assets = drafts.flatMap((draft) => draft.uploadSessions.flatMap((session) => session.fileAssets.map((asset) => ({
    draftId: draft.id,
    draftRowVersion: draft.rowVersion,
    projectId: draft.projectId,
    visibilityScope: draft.visibilityScope,
    purposeCode: draft.purposeCode,
    assetId: asset.id,
    status: asset.status,
    sizeBytes: asset.sizeBytes,
  }))));
  if (drafts.some((draft) => !draft.uploadSessions.some((session) => session.fileAssets.length > 0)) ||
      !assets.length || assets.length > MAX_ATTACHMENT_FILE_COUNT ||
      assets.reduce((total, asset) => total + Number(asset.sizeBytes), 0) > MAX_ATTACHMENT_TOTAL_BYTES ||
      assets.some((asset) => asset.status !== "AVAILABLE")) invalidInput();
  return assets.map((asset) => ({
    draftId: asset.draftId,
    draftRowVersion: asset.draftRowVersion,
    projectId: asset.projectId,
    visibilityScope: asset.visibilityScope,
    purposeCode: asset.purposeCode,
    assetId: asset.assetId,
  }));
}

async function bindIssueDraftAssets(
  transaction: Transaction,
  actor: CollaborationActor,
  assets: IssueDraftAsset[],
  parentType: "ISSUE" | "ISSUE_ACTIVITY" | "ISSUE_DEAN_DECISION" | "ISSUE_IMPLEMENTATION_SUBMISSION",
  references: { issueId: string; issueActivityId?: string; issueDeanDecisionId?: string; issueImplementationSubmissionId?: string },
  submittedParentId: string,
  at: Date,
): Promise<void> {
  const drafts = new Map(assets.map((asset) => [asset.draftId, asset.draftRowVersion]));
  for (const [draftId, rowVersion] of drafts) {
    const claimed = await transaction.attachmentDraft.updateMany({
      where: { id: draftId, rowVersion, status: "OPEN" },
      data: { status: "SUBMITTED", submittedParentId, lastActivityAt: at, rowVersion: { increment: 1 } },
    });
    if (claimed.count !== 1) throw new CollaborationError("ISSUE_CONFLICT");
  }
  if (!assets.length) return;
  await transaction.businessAttachment.createMany({ data: assets.map((asset) => ({
    projectId: asset.projectId,
    fileAssetId: asset.assetId,
    parentType,
    visibilityScope: asset.visibilityScope,
    purposeCode: asset.purposeCode,
    attachedByPersonId: actor.personId,
    attachedRoleCode: actor.roleCode,
    attachedAt: at,
    ...references,
  })) });
}

async function lockIssue(transaction: Transaction, issueId: string): Promise<void> {
  await transaction.$queryRaw`SELECT "id" FROM "issue" WHERE "id" = ${issueId}::uuid FOR UPDATE`;
}

function mapIssue(issue: IssueRow): IssueListItem {
  const current = issue.handlingStates[0];
  if (!current || (issue.reportedRoleCode !== "PMO" && issue.reportedRoleCode !== "KEY_SUB_I")) {
    throw new CollaborationError("ISSUE_CONFLICT");
  }
  return {
    id: issue.id,
    projectId: issue.projectId,
    projectWorkflowStageId: issue.projectWorkflowStageId,
    issueNo: issue.issueNo,
    title: issue.title,
    description: issue.description,
    expectedSupport: issue.expectedSupport,
    currentRiskLevel: issue.currentRiskLevel,
    currentState: current.stateCode,
    rowVersion: issue.rowVersion,
    reportedByPersonId: issue.reportedByPersonId,
    reportedRoleCode: issue.reportedRoleCode,
    currentDecisionRoundId: null,
    currentDecisionRoundStatus: null,
    pendingReviewTransferId: null,
    attachments: [],
    activities: [],
    sharedSummaries: [],
  };
}

function mapIssueProjection(issue: IssueProjectionRow, actor: CollaborationActor): IssueListItem {
  const base = mapIssue(issue);
  const round = issue.decisionRounds[0];
  const initialSummary = issue.sharedSummaries.find((summary) => summary.summaryType === "INITIAL");
  return {
    ...base,
    ...(issue.reportedRoleCode === "PMO" && actor.roleCode !== "PMO" ? {
      title: `PMO创建的问题 ${issue.issueNo}`,
      description: initialSummary?.content ?? "PMO已创建问题，公开摘要待补充。",
      expectedSupport: "由 PMO协调处理",
    } : {}),
    currentDecisionRoundId: round?.id ?? null,
    currentDecisionRoundStatus: round?.status ?? null,
    pendingReviewTransferId: round?.reviewTransfers[0]?.id ?? null,
    attachments: issue.businessAttachments.map(mapIssueAttachment),
    activities: issue.activities.map((activity) => ({
      id: activity.id,
      sequenceNo: activity.sequenceNo,
      activityType: activity.activityType,
      performedRoleCode: activity.performedRoleCode,
      detail: activity.detail,
      visibilityScope: activity.visibilityScope as IssueVisibilityScope,
      createdAt: activity.createdAt.toISOString(),
      attachments: activityAttachments(issue, activity).map(mapIssueAttachment),
    })),
    sharedSummaries: issue.sharedSummaries.map((summary) => ({
      id: summary.id,
      summaryType: summary.summaryType,
      content: summary.content,
      publishedRoleCode: summary.publishedRoleCode,
      publishedAt: summary.publishedAt.toISOString(),
    })),
  };
}

function activityAttachments(
  issue: IssueProjectionRow,
  activity: IssueProjectionRow["activities"][number],
) {
  const direct = activity.businessAttachments;
  if (!activity.decisionRoundId) return direct;
  const round = issue.decisionRounds.find(({ id }) => id === activity.decisionRoundId);
  if (!round) return direct;
  if (activity.activityType === "DEAN_DECISION_RECORDED") {
    return [...direct, ...(round.deanDecision?.businessAttachments ?? [])];
  }
  if (activity.activityType === "PMO_IMPLEMENTATION_UPDATE") {
    const matchingActivities = issue.activities.filter((candidate) =>
      candidate.decisionRoundId === activity.decisionRoundId
      && candidate.activityType === "PMO_IMPLEMENTATION_UPDATE");
    const index = matchingActivities.findIndex(({ id }) => id === activity.id);
    return [...direct, ...(index >= 0 ? round.implementationSubmissions[index]?.businessAttachments ?? [] : [])];
  }
  return direct;
}

function mapIssueAttachment(attachment: {
  attachedAt: Date;
  fileAsset: { id: string; originalFileName: string; mediaType: string; sizeBytes: bigint };
}) {
  return {
    assetId: attachment.fileAsset.id,
    fileName: attachment.fileAsset.originalFileName,
    mediaType: attachment.fileAsset.mediaType,
    sizeBytes: Number(attachment.fileAsset.sizeBytes),
    attachedAt: attachment.attachedAt.toISOString(),
  };
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function forbidden(): never {
  throw new CollaborationError("COLLABORATION_FORBIDDEN");
}

async function registerIssueTypeSuggestion(
  transaction: Transaction,
  issueId: string,
  submittedByPersonId: string,
  rawDisplayName: string,
): Promise<void> {
  const proposedDisplayName = rawDisplayName.normalize("NFKC").trim();
  if (!proposedDisplayName || [...proposedDisplayName].length > 100) invalidInput();
  const formalOption = await transaction.dictionaryOption.findFirst({
    where: {
      dictionaryCode: "ISSUE_TYPE",
      optionCode: { not: "OTHER" },
      enabled: true,
      displayName: { equals: proposedDisplayName, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (formalOption) invalidInput();
  const suggestion = await transaction.dictionaryOptionSuggestion.upsert({
    where: {
      dictionaryCode_normalizedName: {
        dictionaryCode: "ISSUE_TYPE",
        normalizedName: proposedDisplayName.toLocaleLowerCase("zh-CN"),
      },
    },
    create: {
      dictionaryCode: "ISSUE_TYPE",
      proposedDisplayName,
      normalizedName: proposedDisplayName.toLocaleLowerCase("zh-CN"),
    },
    update: {},
    select: { id: true },
  });
  await transaction.dictionaryOptionSuggestionSource.create({
    data: {
      suggestionId: suggestion.id,
      issueId,
      fieldCode: "ISSUE_TYPE",
      submittedByPersonId,
    },
  });
}

function invalidInput(): never {
  throw new CollaborationError("ISSUE_INVALID_INPUT");
}

function isDatabaseConflict(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error.code === "P2002" || error.code === "P2034"));
}
