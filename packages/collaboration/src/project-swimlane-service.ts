import type { CollaborationActor } from "./contracts.js";
import { CollaborationError } from "./repository-contracts.js";
import type { ProjectSwimlaneChangeCommand, ProjectSwimlaneRepository } from "./project-swimlane-contracts.js";

export class ProjectSwimlaneService {
  constructor(private readonly repository: ProjectSwimlaneRepository) {}

  async getEditable(actor: CollaborationActor, projectId: string) {
    requireEditorRole(actor);
    const result = await this.repository.getEditableSwimlane(actor, projectId.trim());
    if (!result) throw new CollaborationError("PROJECT_NOT_FOUND");
    return result;
  }

  async preview(actor: CollaborationActor, input: ProjectSwimlaneChangeCommand) {
    requireEditorRole(actor);
    validateCommand(input);
    return this.repository.previewSwimlaneChange(actor, normalizeCommand(input));
  }

  async apply(actor: CollaborationActor, input: ProjectSwimlaneChangeCommand) {
    requireEditorRole(actor);
    validateCommand(input);
    return this.repository.applySwimlaneChange(actor, normalizeCommand(input));
  }
}

function requireEditorRole(actor: CollaborationActor): void {
  if (actor.roleCode !== "PMO" && actor.roleCode !== "KEY_SUB_I") {
    throw new CollaborationError("PROJECT_SWIMLANE_FORBIDDEN");
  }
}

function validateCommand(input: ProjectSwimlaneChangeCommand): void {
  if (!input.projectId.trim() || !input.expectedRevision.trim() || !input.name.trim() || !input.reason.trim()) {
    throw new CollaborationError("PROJECT_SWIMLANE_INVALID_INPUT");
  }
  if (input.name.trim().length > 100 || input.reason.trim().length > 500) {
    throw new CollaborationError("PROJECT_SWIMLANE_INVALID_INPUT");
  }
  if (!input.stages.length || !input.workflows.length || !input.nodes.length) {
    throw new CollaborationError("PROJECT_SWIMLANE_INVALID_GRAPH");
  }
}

function normalizeCommand(input: ProjectSwimlaneChangeCommand): ProjectSwimlaneChangeCommand {
  return {
    ...input,
    projectId: input.projectId.trim(),
    expectedRevision: input.expectedRevision.trim(),
    name: input.name.normalize("NFKC").trim(),
    reason: input.reason.normalize("NFKC").trim(),
    stages: input.stages.map((stage) => ({ ...stage, name: stage.name.normalize("NFKC").trim() })),
    workflows: input.workflows.map((workflow) => ({ ...workflow, name: workflow.name.normalize("NFKC").trim(), description: workflow.description.trim() })),
    nodes: input.nodes.map((node) => ({ ...node, taskName: node.taskName.normalize("NFKC").trim(), taskDescription: node.taskDescription.trim() })),
  };
}
