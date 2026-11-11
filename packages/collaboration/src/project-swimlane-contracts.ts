import type { AttachmentRequirement, CollaborationActor, PlanItemApplicability } from "./contracts.js";

export type ProjectSwimlaneOwnerRole = "PMO" | "DEAN" | "KEY_SUB_I" | "CRC" | "STATISTICIAN" | "COLLABORATION_LEAD";

export interface ProjectSwimlaneStageInput {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  applicability: PlanItemApplicability;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
}

export interface ProjectSwimlaneWorkflowInput {
  id: string;
  code: string;
  name: string;
  description: string;
  sortOrder: number;
  enabled: boolean;
}

export interface ProjectSwimlaneNodeInput {
  id: string;
  workflowId: string;
  stageId: string;
  taskName: string;
  taskDescription: string;
  sortOrder: number;
  applicability: PlanItemApplicability;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  updateIntervalDays: number | null;
  overdueReminderIntervalDays: number;
  attachmentRequirement: AttachmentRequirement;
  ownerRoles: ProjectSwimlaneOwnerRole[];
  predecessorIds: string[];
  executionStatus: "NOT_STARTED" | "ACTIVE" | "PENDING_COMPLETION_CONFIRMATION" | "COMPLETED";
  hasExecutionHistory: boolean;
}

export interface EditableProjectSwimlane {
  projectId: string;
  projectStatus: "ACTIVE" | "CLOSING" | "COMPLETED" | "ARCHIVED";
  name: string;
  expectedRevision: string;
  canEdit: boolean;
  stages: ProjectSwimlaneStageInput[];
  workflows: ProjectSwimlaneWorkflowInput[];
  nodes: ProjectSwimlaneNodeInput[];
}

export interface ProjectSwimlaneChangeCommand {
  projectId: string;
  expectedRevision: string;
  name: string;
  reason: string;
  stages: ProjectSwimlaneStageInput[];
  workflows: ProjectSwimlaneWorkflowInput[];
  nodes: ProjectSwimlaneNodeInput[];
}

export interface ProjectSwimlaneImpact {
  swimlaneNameChanges: number;
  stageChanges: number;
  workflowChanges: number;
  nodeChanges: number;
  nodesWithHistory: number;
  nodesBecomingNotApplicable: number;
  completionRequestsToTerminate: number;
  openIssuesPreserved: number;
  scheduleOrResponsibilityChanges: number;
}

export interface ProjectSwimlaneApplyResult {
  swimlaneName: string;
  activatedAt: string;
  impact: ProjectSwimlaneImpact;
}

export interface ProjectSwimlaneRepository {
  getEditableSwimlane(actor: CollaborationActor, projectId: string): Promise<EditableProjectSwimlane | null>;
  previewSwimlaneChange(actor: CollaborationActor, input: ProjectSwimlaneChangeCommand): Promise<ProjectSwimlaneImpact>;
  applySwimlaneChange(actor: CollaborationActor, input: ProjectSwimlaneChangeCommand): Promise<ProjectSwimlaneApplyResult>;
}
