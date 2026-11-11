import type { CollaborationActor } from "./contracts.js";
import { CollaborationError } from "./repository-contracts.js";
import type {
  SubmitWorkflowCompletionInput,
  ResubmitWorkflowCompletionInput,
  WorkflowCompletionMutationInput,
  WorkflowCompletionRepository,
} from "./workflow-completion-contracts.js";

export class WorkflowCompletionService {
  constructor(private readonly repository: WorkflowCompletionRepository) {}

  list(actor: CollaborationActor, projectId: string) {
    requireCoreRole(actor);
    return this.repository.list(actor, projectId);
  }

  async submit(actor: CollaborationActor, input: SubmitWorkflowCompletionInput) {
    requireKeySubI(actor);
    requireVersion(input.expectedNodeRowVersion);
    return await this.repository.submit({
      ...input,
      actor,
      progressSummary: requireText(input.progressSummary),
      basis: requireText(input.basis),
      expectedCompletionDate: normalizeDate(input.expectedCompletionDate),
      attachmentDraftIds: uniqueDraftIds(input.attachmentDraftIds),
    });
  }

  async supplement(actor: CollaborationActor, input: WorkflowCompletionMutationInput & {
    content: string;
    attachmentDraftIds: string[];
  }) {
    requireKeySubI(actor);
    requireVersion(input.expectedRowVersion);
    return await this.repository.supplement({
      ...input,
      actor,
      content: requireText(input.content),
      attachmentDraftIds: uniqueDraftIds(input.attachmentDraftIds),
    });
  }

  async withdraw(actor: CollaborationActor, input: WorkflowCompletionMutationInput & { reason: string }) {
    requireKeySubI(actor);
    requireVersion(input.expectedRowVersion);
    return await this.repository.withdraw({ ...input, actor, reason: requireText(input.reason) });
  }

  async reconfirm(actor: CollaborationActor, input: WorkflowCompletionMutationInput & { confirmation: string }) {
    requireKeySubI(actor);
    requireVersion(input.expectedRowVersion);
    return await this.repository.reconfirm({
      ...input,
      actor,
      confirmation: requireText(input.confirmation),
    });
  }

  async resubmit(actor: CollaborationActor, input: ResubmitWorkflowCompletionInput) {
    requireKeySubI(actor);
    requireVersion(input.expectedRowVersion);
    return await this.repository.resubmit({
      ...input,
      actor,
      progressSummary: requireText(input.progressSummary),
      basis: requireText(input.basis),
      expectedCompletionDate: normalizeDate(input.expectedCompletionDate),
      attachmentDraftIds: uniqueDraftIds(input.attachmentDraftIds),
    });
  }

  async review(actor: CollaborationActor, input: WorkflowCompletionMutationInput & {
    decision: "APPROVE" | "RETURN";
    comment: string;
  }) {
    if (actor.roleCode !== "PMO") throw new CollaborationError("COLLABORATION_FORBIDDEN");
    requireVersion(input.expectedRowVersion);
    return await this.repository.review({ ...input, actor, comment: requireText(input.comment) });
  }

  async synchronizeIssueGate(actor: CollaborationActor, input: WorkflowCompletionMutationInput) {
    if (actor.roleCode !== "PMO") throw new CollaborationError("COLLABORATION_FORBIDDEN");
    requireVersion(input.expectedRowVersion);
    return await this.repository.synchronizeIssueGate({ ...input, actor });
  }

  async revokeFormalCompletion(actor: CollaborationActor, input: WorkflowCompletionMutationInput & { reason: string }) {
    if (actor.roleCode !== "PMO") throw new CollaborationError("COLLABORATION_FORBIDDEN");
    requireVersion(input.expectedRowVersion);
    return await this.repository.revokeFormalCompletion({ ...input, actor, reason: requireText(input.reason) });
  }

  async activatePlanChange(actor: CollaborationActor, input: { projectId: string; planChangeRequestId: string }) {
    if (actor.roleCode !== "PMO") throw new CollaborationError("COLLABORATION_FORBIDDEN");
    return await this.repository.activatePlanChange({ ...input, actor });
  }
}

function requireCoreRole(actor: CollaborationActor): void {
  if (!(["PMO", "DEAN", "KEY_SUB_I"] as const).includes(actor.roleCode)) {
    throw new CollaborationError("COLLABORATION_FORBIDDEN");
  }
}

function requireKeySubI(actor: CollaborationActor): void {
  if (actor.roleCode !== "KEY_SUB_I") throw new CollaborationError("COLLABORATION_FORBIDDEN");
}

function requireVersion(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new CollaborationError("WORKFLOW_COMPLETION_INVALID_INPUT");
  }
}

function requireText(value: string): string {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized) throw new CollaborationError("WORKFLOW_COMPLETION_INVALID_INPUT");
  return normalized;
}

function normalizeDate(value: string | null): string | null {
  if (value === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) throw new CollaborationError("WORKFLOW_COMPLETION_INVALID_INPUT");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new CollaborationError("WORKFLOW_COMPLETION_INVALID_INPUT");
  }
  return value;
}

function uniqueDraftIds(values: string[]): string[] {
  const result = [...new Set(values)];
  if (result.length !== values.length || result.length > 10) {
    throw new CollaborationError("WORKFLOW_COMPLETION_INVALID_INPUT");
  }
  return result;
}
