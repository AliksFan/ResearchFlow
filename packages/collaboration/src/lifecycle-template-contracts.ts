import type { AttachmentRequirement, CollaborationActor, PlanItemApplicability } from "./contracts.js";

export type LifecycleTemplateOwnerRole = "PMO" | "DEAN" | "KEY_SUB_I" | "CRC" | "STATISTICIAN" | "COLLABORATION_LEAD";

export interface LifecycleTemplateStageDraft {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  applicability: PlanItemApplicability;
}

export interface LifecycleTemplateWorkflowDraft {
  id: string;
  code: string;
  name: string;
  description: string;
  requiredByDefault: boolean;
  enabled: boolean;
}

export interface LifecycleTemplateNodeDraft {
  id: string;
  label?: string;
  workflowId: string;
  stageId: string;
  task: string;
  ownerRole: LifecycleTemplateOwnerRole;
  sortOrder: number;
  applicability: PlanItemApplicability;
  attachmentRequirement: AttachmentRequirement;
  predecessorIds: string[];
}

export interface LifecycleTemplateVersionRecord {
  id: string;
  lifecycleTemplateId: string;
  templateCode: string;
  templateName: string;
  versionNo: number;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  displayStatus: "UNPUBLISHED" | "PUBLISHED" | "EDITING" | "RETIRED";
  nameEditable: boolean;
  fingerprint: string;
  stages: LifecycleTemplateStageDraft[];
  workflows: LifecycleTemplateWorkflowDraft[];
  nodes: LifecycleTemplateNodeDraft[];
}

export interface LifecycleTemplateDraftCommand {
  templateVersionId: string;
  templateName: string;
  expectedFingerprint: string;
  stages: LifecycleTemplateStageDraft[];
  workflows: LifecycleTemplateWorkflowDraft[];
  nodes: LifecycleTemplateNodeDraft[];
}

export interface LifecycleTemplateRepository {
  listVersions(actor: CollaborationActor): Promise<LifecycleTemplateVersionRecord[]>;
  createSolution(actor: CollaborationActor, templateName: string): Promise<string>;
  createDraftFromPublished(actor: CollaborationActor, sourceTemplateVersionId: string): Promise<string>;
  saveDraft(actor: CollaborationActor, input: LifecycleTemplateDraftCommand): Promise<void>;
  publishDraft(actor: CollaborationActor, input: LifecycleTemplateDraftCommand): Promise<void>;
  deleteVersion(actor: CollaborationActor, templateVersionId: string, expectedFingerprint: string): Promise<void>;
}
