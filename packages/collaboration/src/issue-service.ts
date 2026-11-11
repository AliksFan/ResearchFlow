import type { CollaborationActor } from "./contracts.js";
import type {
  AppendIssueCoordinationInput,
  CreateIssueInput,
  IssueInvalidCloseReason,
  IssueMutationInput,
  IssueRepository,
  RecordDeanDecisionInput,
} from "./issue-contracts.js";
import { CollaborationError } from "./repository-contracts.js";

export class IssueService {
  constructor(private readonly repository: IssueRepository) {}

  list(actor: CollaborationActor, projectId: string) {
    requireCoreRole(actor);
    return this.repository.list(actor, requireText(projectId));
  }

  listIssueTypes(actor: CollaborationActor, projectId: string) {
    requireCoreRole(actor);
    return this.repository.listIssueTypes(actor, requireText(projectId));
  }

  listContacts(actor: CollaborationActor, projectId: string) {
    requirePmo(actor);
    return this.repository.listContacts(actor, requireText(projectId));
  }

  createExternalContact(actor: CollaborationActor, input: { projectId: string; name: string; email: string; category: string }) {
    requirePmo(actor);
    const email = requireText(input.email).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) invalid();
    return this.repository.createExternalContact({ actor, projectId: requireText(input.projectId), name: requireText(input.name), email, category: requireText(input.category) });
  }

  recordManualEmail(actor: CollaborationActor, input: { projectId: string; issueId: string; subject: string; body: string; recipientRefs: string[]; idempotencyKey: string }) {
    requirePmo(actor);
    const recipientRefs = [...new Set(input.recipientRefs.map(requireText))];
    if (!recipientRefs.length || recipientRefs.length > 20) invalid();
    return this.repository.recordManualEmail({ actor, projectId: requireText(input.projectId), issueId: requireText(input.issueId), subject: requireText(input.subject), body: requireText(input.body), recipientRefs, idempotencyKey: requireText(input.idempotencyKey) });
  }

  async create(actor: CollaborationActor, input: CreateIssueInput) {
    if (actor.roleCode !== "KEY_SUB_I") forbidden();
    const reporter = actor as CollaborationActor & { roleCode: "KEY_SUB_I" };
    return await this.repository.create({
      ...input,
      actor: reporter,
      projectId: requireText(input.projectId),
      projectWorkflowStageId: requireText(input.projectWorkflowStageId),
      issueTypeOptionId: requireText(input.issueTypeOptionId),
      issueTypeOtherText: optionalText(input.issueTypeOtherText),
      title: requireText(input.title),
      description: requireText(input.description),
      expectedSupport: optionalText(input.expectedSupport),
      sharedSummary: null,
      attachmentDraftIds: uniqueDraftIds(input.attachmentDraftIds),
      commandId: requireText(input.commandId),
    });
  }

  async returnForSupplement(actor: CollaborationActor, input: IssueMutationInput & { reason: string }) {
    requirePmo(actor);
    mutation(input);
    return await this.repository.returnForSupplement({ ...input, actor, reason: requireText(input.reason) });
  }

  async supplement(actor: CollaborationActor, input: IssueMutationInput & {
    latestProgress: string | null;
    supplementalDetail: string;
    expectedSupport: string | null;
    attachmentDraftIds: string[];
  }) {
    if (actor.roleCode !== "PMO" && actor.roleCode !== "KEY_SUB_I") forbidden();
    mutation(input);
    return await this.repository.supplement({
      ...input,
      actor,
      latestProgress: optionalText(input.latestProgress),
      supplementalDetail: requireText(input.supplementalDetail),
      expectedSupport: optionalText(input.expectedSupport),
      attachmentDraftIds: uniqueDraftIds(input.attachmentDraftIds),
    });
  }

  async appendCoordination(actor: CollaborationActor, input: AppendIssueCoordinationInput) {
    requirePmo(actor);
    if (input.expectedRowVersion !== undefined && (!Number.isInteger(input.expectedRowVersion) || input.expectedRowVersion < 0)) invalid();
    return await this.repository.appendCoordination({
      ...input,
      actor,
      projectId: requireText(input.projectId),
      issueId: requireText(input.issueId),
      detail: requireText(input.detail),
      attachmentDraftIds: uniqueDraftIds(input.attachmentDraftIds),
      commandId: requireText(input.commandId),
    });
  }

  async submitResolution(actor: CollaborationActor, input: IssueMutationInput & { result: string; attachmentDraftIds: string[] }) {
    requirePmo(actor);
    mutation(input);
    return await this.repository.submitResolution({ ...input, actor, result: requireText(input.result), attachmentDraftIds: uniqueDraftIds(input.attachmentDraftIds) });
  }

  async closeInvalid(actor: CollaborationActor, input: IssueMutationInput & {
    reasonCode: IssueInvalidCloseReason;
    conclusionSummary: string;
    duplicateIssueId: string | null;
  }) {
    requirePmo(actor);
    mutation(input);
    if (input.reasonCode === "DUPLICATE" && optionalText(input.duplicateIssueId) === null) invalid();
    return await this.repository.closeInvalid({
      ...input,
      actor,
      conclusionSummary: requireText(input.conclusionSummary),
      duplicateIssueId: optionalText(input.duplicateIssueId),
    });
  }

  async escalateToDean(actor: CollaborationActor, input: IssueMutationInput & {
    pmoAssessment: string | null;
    recommendation: string | null;
    decisionQuestion: string;
    suggestedDeadline: string | null;
    attachmentDraftIds: string[];
  }) {
    requirePmo(actor);
    mutation(input);
    return await this.repository.escalateToDean({
      ...input,
      actor,
      pmoAssessment: optionalText(input.pmoAssessment),
      recommendation: optionalText(input.recommendation),
      decisionQuestion: requireText(input.decisionQuestion),
      suggestedDeadline: normalizeDate(input.suggestedDeadline),
      attachmentDraftIds: uniqueDraftIds(input.attachmentDraftIds),
    });
  }

  async recordDeanDecision(actor: CollaborationActor, input: RecordDeanDecisionInput) {
    if (actor.roleCode !== "DEAN") forbidden();
    mutation(input);
    if (typeof input.implementationReviewRequired !== "boolean") invalid();
    const instruction = optionalText(input.pmoImplementationInstruction);
    const decisionContent = optionalText(input.decisionContent);
    if (input.decisionCode === "OTHER" && (instruction === null || decisionContent === null)) invalid();
    return await this.repository.recordDeanDecision({
      ...input,
      actor,
      decisionContent,
      pmoImplementationInstruction: instruction,
      implementationReviewRequired: input.implementationReviewRequired,
      attachmentDraftIds: uniqueDraftIds(input.attachmentDraftIds),
    });
  }

  async requestDecisionSupplement(actor: CollaborationActor, input: IssueMutationInput & { reason: string }) {
    if (actor.roleCode !== "DEAN") forbidden();
    mutation(input);
    return await this.repository.requestDecisionSupplement({ ...input, actor, reason: requireText(input.reason) });
  }

  async resubmitDecisionMaterials(actor: CollaborationActor, input: IssueMutationInput & { content: string }) {
    requirePmo(actor);
    mutation(input);
    return await this.repository.resubmitDecisionMaterials({ ...input, actor, content: requireText(input.content) });
  }

  async submitImplementation(actor: CollaborationActor, input: IssueMutationInput & {
    decisionRoundId: string;
    resultSummary: string;
    attachmentDraftIds: string[];
  }) {
    requirePmo(actor);
    mutation(input);
    return await this.repository.submitImplementation({
      ...input,
      actor,
      decisionRoundId: requireText(input.decisionRoundId),
      resultSummary: requireText(input.resultSummary),
      attachmentDraftIds: uniqueDraftIds(input.attachmentDraftIds),
    });
  }

  async reviewImplementation(actor: CollaborationActor, input: IssueMutationInput & {
    decision: "ACCEPTED" | "RETURNED";
    comment: string | null;
  }) {
    if (actor.roleCode !== "DEAN") forbidden();
    mutation(input);
    const comment = optionalText(input.comment);
    if (input.decision === "RETURNED" && comment === null) invalid();
    return await this.repository.reviewImplementation({ ...input, actor, comment });
  }

  async requestDeanReviewTransfer(actor: CollaborationActor, input: IssueMutationInput & { decisionRoundId: string; reason: string }) {
    requirePmo(actor);
    mutation(input);
    return await this.repository.requestDeanReviewTransfer({
      ...input,
      actor,
      decisionRoundId: requireText(input.decisionRoundId),
      reason: requireText(input.reason),
    });
  }

  async acceptDeanReviewTransfer(actor: CollaborationActor, input: IssueMutationInput & { transferId: string }) {
    if (actor.roleCode !== "DEAN") forbidden();
    mutation(input);
    return await this.repository.acceptDeanReviewTransfer({ ...input, actor, transferId: requireText(input.transferId) });
  }

  async confirmResolution(actor: CollaborationActor, input: IssueMutationInput & {
    resolved: boolean;
    confirmation: string | null;
  }) {
    if (actor.roleCode !== "PMO" && actor.roleCode !== "KEY_SUB_I") forbidden();
    mutation(input);
    const confirmation = optionalText(input.confirmation);
    if (!input.resolved && confirmation === null) invalid();
    return await this.repository.confirmResolution({ ...input, actor, confirmation });
  }
}

function mutation(input: IssueMutationInput): void {
  requireText(input.projectId);
  requireText(input.issueId);
  requireText(input.commandId);
  if (!Number.isInteger(input.expectedRowVersion) || input.expectedRowVersion < 0) invalid();
}

function requireCoreRole(actor: CollaborationActor): void {
  if (!(actor.roleCode === "PMO" || actor.roleCode === "DEAN" || actor.roleCode === "KEY_SUB_I")) forbidden();
}

function requirePmo(actor: CollaborationActor): void {
  if (actor.roleCode !== "PMO") forbidden();
}

function forbidden(): never {
  throw new CollaborationError("COLLABORATION_FORBIDDEN");
}

function invalid(): never {
  throw new CollaborationError("ISSUE_INVALID_INPUT");
}

function requireText(value: string): string {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized) invalid();
  return normalized;
}

function optionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.normalize("NFKC").trim();
  return normalized || null;
}

function uniqueDraftIds(values: string[]): string[] {
  const result = [...new Set(values.map(requireText))];
  if (result.length !== values.length || result.length > 10) invalid();
  return result;
}

function normalizeDate(value: string | null): string | null {
  if (value === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) invalid();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) invalid();
  return value;
}
