import type { CollaborationActor } from "./contracts.js";
import type {
  ArchiveProjectInput,
  CompletionMutationInput,
  ProjectClosureRepository,
  ProjectCompletionMaterials,
  SubmitProjectCompletionInput,
} from "./project-closure-contracts.js";
import { CollaborationError } from "./repository-contracts.js";

export class ProjectClosureService {
  constructor(private readonly repository: ProjectClosureRepository) {}

  getState(actor: CollaborationActor, projectId: string) {
    requireCoreRole(actor);
    return this.repository.getState(actor, text(projectId));
  }

  checkInitialReadiness(actor: CollaborationActor, projectId: string) {
    return this.repository.checkInitialReadiness(requireKeySubI(actor), text(projectId));
  }

  async submit(actor: CollaborationActor, input: SubmitProjectCompletionInput) {
    const keySubI = requireKeySubI(actor);
    projectVersion(input.projectId, input.expectedProjectRowVersion, input.commandId);
    return await this.repository.submit({ ...input, ...materials(input), actor: keySubI, projectId: text(input.projectId), attachmentDraftIds: draftIds(input.attachmentDraftIds), commandId: text(input.commandId) });
  }

  async returnForSupplement(actor: CollaborationActor, input: CompletionMutationInput & { reason: string }) {
    const pmo = requirePmo(actor); mutation(input);
    return await this.repository.returnForSupplement({ ...input, actor: pmo, reason: text(input.reason) });
  }

  async resubmit(actor: CollaborationActor, input: CompletionMutationInput & ProjectCompletionMaterials & { attachmentDraftIds: string[] }) {
    const keySubI = requireKeySubI(actor); mutation(input);
    return await this.repository.resubmit({ ...input, ...materials(input), actor: keySubI, attachmentDraftIds: draftIds(input.attachmentDraftIds) });
  }

  async withdraw(actor: CollaborationActor, input: CompletionMutationInput & { reason: string }) {
    const keySubI = requireKeySubI(actor); mutation(input);
    return await this.repository.withdraw({ ...input, actor: keySubI, reason: text(input.reason) });
  }

  async approve(actor: CollaborationActor, input: CompletionMutationInput & { comment: string | null }) {
    const pmo = requirePmo(actor); mutation(input);
    return await this.repository.approve({ ...input, actor: pmo, comment: optional(input.comment) });
  }

  async archive(actor: CollaborationActor, input: ArchiveProjectInput) {
    const pmo = requirePmo(actor); projectVersion(input.projectId, input.expectedProjectRowVersion, input.commandId);
    return await this.repository.archive({ ...input, actor: pmo, projectId: text(input.projectId), reason: text(input.reason), commandId: text(input.commandId) });
  }

  async restoreArchive(actor: CollaborationActor, input: ArchiveProjectInput) {
    const pmo = requirePmo(actor); projectVersion(input.projectId, input.expectedProjectRowVersion, input.commandId);
    return await this.repository.restoreArchive({ ...input, actor: pmo, projectId: text(input.projectId), reason: text(input.reason), commandId: text(input.commandId) });
  }
}

function materials(input: ProjectCompletionMaterials): ProjectCompletionMaterials {
  const value = {
    completionSummary: text(input.completionSummary),
    unfinishedOptionalAndLegacyStatement: text(input.unfinishedOptionalAndLegacyStatement),
    noUnfinishedItemConfirmed: input.noUnfinishedItemConfirmed,
    archiveComplianceSelfCheck: text(input.archiveComplianceSelfCheck),
    exceptionStatement: optional(input.exceptionStatement),
    truthConfirmed: input.truthConfirmed,
  };
  if (!value.noUnfinishedItemConfirmed || !value.truthConfirmed) invalid();
  return value;
}

function mutation(input: CompletionMutationInput) { projectVersion(input.projectId, input.expectedRowVersion, input.commandId); text(input.completionRequestId); }
function projectVersion(projectId: string, version: number, commandId: string) { text(projectId); text(commandId); if (!Number.isInteger(version) || version < 0) invalid(); }
function draftIds(values: string[]) { const result = [...new Set(values.map(text))]; if (result.length !== values.length || result.length > 10) invalid(); return result; }
function text(value: string) { const normalized = value.normalize("NFKC").trim(); if (!normalized) invalid(); return normalized; }
function optional(value: string | null | undefined) { if (value == null) return null; return value.normalize("NFKC").trim() || null; }
function requireCoreRole(actor: CollaborationActor) { if (!(["PMO", "DEAN", "KEY_SUB_I"] as const).includes(actor.roleCode)) forbidden(); }
function requirePmo(actor: CollaborationActor) { if (actor.roleCode !== "PMO") forbidden(); return actor as CollaborationActor & { roleCode: "PMO" }; }
function requireKeySubI(actor: CollaborationActor) { if (actor.roleCode !== "KEY_SUB_I") forbidden(); return actor as CollaborationActor & { roleCode: "KEY_SUB_I" }; }
function invalid(): never { throw new CollaborationError("PROJECT_CLOSURE_INVALID_INPUT"); }
function forbidden(): never { throw new CollaborationError("COLLABORATION_FORBIDDEN"); }
