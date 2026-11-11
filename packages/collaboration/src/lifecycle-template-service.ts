import type { CollaborationActor } from "./contracts.js";
import type {
  LifecycleTemplateDraftCommand,
  LifecycleTemplateRepository,
} from "./lifecycle-template-contracts.js";
import { CollaborationError } from "./repository-contracts.js";
import { validateWorkflowDependencyGraph } from "./workflow-completion-contracts.js";

export class LifecycleTemplateService {
  constructor(private readonly repository: LifecycleTemplateRepository) {}

  listVersions(actor: CollaborationActor) {
    requirePmo(actor);
    return this.repository.listVersions(actor);
  }

  async createSolution(actor: CollaborationActor, templateName: string) {
    requirePmo(actor);
    const normalizedName = normalizeName(templateName);
    if (!normalizedName) invalid();
    return await this.repository.createSolution(actor, normalizedName);
  }

  async createDraftFromPublished(actor: CollaborationActor, sourceTemplateVersionId: string) {
    requirePmo(actor);
    if (!sourceTemplateVersionId.trim()) throw new CollaborationError("WORKFLOW_COMPLETION_INVALID_INPUT");
    return await this.repository.createDraftFromPublished(actor, sourceTemplateVersionId);
  }

  async saveDraft(actor: CollaborationActor, input: LifecycleTemplateDraftCommand) {
    requirePmo(actor);
    validateDraft(input, false);
    return await this.repository.saveDraft(actor, input);
  }

  async publishDraft(actor: CollaborationActor, input: LifecycleTemplateDraftCommand) {
    requirePmo(actor);
    validateDraft(input, true);
    return await this.repository.publishDraft(actor, input);
  }

  async deleteVersion(actor: CollaborationActor, templateVersionId: string, expectedFingerprint: string) {
    requirePmo(actor);
    if (!templateVersionId.trim() || !expectedFingerprint.trim()) invalid();
    return await this.repository.deleteVersion(actor, templateVersionId.trim(), expectedFingerprint.trim());
  }
}

function requirePmo(actor: CollaborationActor): void {
  if (actor.roleCode !== "PMO") throw new CollaborationError("COLLABORATION_FORBIDDEN");
}

function validateDraft(input: LifecycleTemplateDraftCommand, requireComplete: boolean): void {
  if (!input.templateVersionId.trim() || !normalizeName(input.templateName) || !input.expectedFingerprint.trim() ||
      (requireComplete && (input.stages.length === 0 || input.workflows.length === 0 || input.nodes.length === 0))) invalid();
  const stageIds = new Set(input.stages.map(({ id }) => id));
  const workflowIds = new Set(input.workflows.map(({ id }) => id));
  const stageCodes = new Set(input.stages.map(({ code }) => code.normalize("NFKC").trim()));
  const workflowCodes = new Set(input.workflows.map(({ code }) => code.normalize("NFKC").trim()));
  const ids = input.nodes.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new CollaborationError("WORKFLOW_DEPENDENCY_DUPLICATE");
  if (stageIds.size !== input.stages.length || workflowIds.size !== input.workflows.length ||
      stageCodes.size !== input.stages.length || workflowCodes.size !== input.workflows.length ||
      input.nodes.some(({ stageId, workflowId }) => !stageIds.has(stageId) || !workflowIds.has(workflowId)) ||
      input.stages.some(({ id, code, name, sortOrder }) => !id.trim() || !code.trim() || !name.trim() || !Number.isInteger(sortOrder)) ||
      input.workflows.some(({ id, code, name, description }) => !id.trim() || !code.trim() || !name.trim() || !description.trim()) ||
      input.nodes.some(({ id, task, sortOrder }) => !id.trim() || !task.trim() || !Number.isInteger(sortOrder))) invalid();
  validateWorkflowDependencyGraph(
    input.nodes.map(({ id, applicability }) => ({ id, applicability })),
    input.nodes.flatMap(({ id, predecessorIds }) => predecessorIds.map((predecessorId) => [predecessorId, id] as const)),
  );
}

function normalizeName(value: string): string {
  return value.normalize("NFKC").trim();
}

function invalid(): never {
  throw new CollaborationError("LIFECYCLE_TEMPLATE_INVALID_INPUT");
}
