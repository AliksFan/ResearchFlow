import { z } from "zod";

export const PROJECT_APPLICATION_STATUSES = [
  "DRAFT",
  "PENDING_ESTABLISHMENT_REVIEW",
  "RETURNED_FOR_REVISION",
  "ON_HOLD",
  "ACTIVE",
  "REJECTED",
  "CANCELLED",
] as const;

export const projectApplicationStatusSchema = z.enum(
  PROJECT_APPLICATION_STATUSES,
);
export type ProjectApplicationStatus = z.infer<
  typeof projectApplicationStatusSchema
>;

export const PROJECT_APPLICATION_ERROR_CODES = [
  "PROJECT_APPLICATION_NOT_FOUND",
  "PROJECT_APPLICATION_FORBIDDEN",
  "PROJECT_APPLICATION_CONFLICT",
  "PROJECT_APPLICATION_INVALID_STATE",
  "PROJECT_APPLICATION_DUPLICATE_NAME",
  "PROJECT_APPLICATION_OWNER_INACTIVE",
  "PROJECT_APPLICATION_PRIMARY_OWNER_INVALID",
  "PROJECT_APPLICATION_TEMPLATE_INVALID",
  "PROJECT_APPLICATION_SWIMLANE_INVALID",
  "PROJECT_APPLICATION_PATIENT_DATA_PROHIBITED",
  "PROJECT_APPLICATION_VALIDATION_FAILED",
  "PROJECT_APPLICATION_ESTABLISHMENT_FAILED",
] as const;

export const projectApplicationErrorCodeSchema = z.enum(
  PROJECT_APPLICATION_ERROR_CODES,
);
export type ProjectApplicationErrorCode = z.infer<
  typeof projectApplicationErrorCodeSchema
>;

export const projectApplicationActorSchema = z.object({
  personId: z.string().trim().min(1),
  roleCode: z.enum([
    "DEAN",
    "PMO",
    "KEY_SUB_I",
    "CRC",
    "STATISTICIAN",
    "COLLABORATION_LEAD",
  ]),
  sessionId: z.string().trim().min(1),
}).strict();

export const projectApplicationCommandSchema = z.object({
  actor: projectApplicationActorSchema,
  projectId: z.string().trim().min(1),
  expectedRowVersion: z.number().int().nonnegative(),
  applicationVersionId: z.string().trim().min(1).nullable(),
  reviewId: z.string().trim().min(1).nullable(),
  commandId: z.string().trim().min(1),
}).strict();

export type ProjectApplicationActor = z.infer<
  typeof projectApplicationActorSchema
>;
export type ProjectApplicationCommand = z.infer<
  typeof projectApplicationCommandSchema
>;

export interface ProposedOwnerInput {
  personId: string;
  isPrimary: boolean;
  activeKeySubI: boolean;
}

export type ApplicationSwimlaneOwnerRole = "PMO" | "KEY_SUB_I" | "CRC" | "STATISTICIAN" | "COLLABORATION_LEAD";
export type ApplicationSwimlaneApplicability = "REQUIRED" | "OPTIONAL" | "NOT_APPLICABLE";
export type ApplicationSwimlaneAttachmentRequirement = "NONE" | "OPTIONAL" | "REQUIRED";

export interface ApplicationSwimlaneStageInput {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  applicability: ApplicationSwimlaneApplicability;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
}

export interface ApplicationSwimlaneWorkflowInput {
  id: string;
  code: string;
  name: string;
  description: string;
  sortOrder: number;
  enabled: boolean;
}

export interface ApplicationSwimlaneNodeInput {
  id: string;
  workflowId: string;
  stageId: string;
  taskName: string;
  taskDescription: string;
  sortOrder: number;
  applicability: ApplicationSwimlaneApplicability;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  updateIntervalDays: number | null;
  overdueReminderIntervalDays: number;
  attachmentRequirement: ApplicationSwimlaneAttachmentRequirement;
  ownerRoles: ApplicationSwimlaneOwnerRole[];
  predecessorIds: string[];
}

export interface ApplicationSwimlaneInput {
  name: string;
  expectedRevision: number;
  sourceTemplateVersionId: string | null;
  stages: ApplicationSwimlaneStageInput[];
  workflows: ApplicationSwimlaneWorkflowInput[];
  nodes: ApplicationSwimlaneNodeInput[];
}

export interface DraftValidationInput {
  projectName: string;
  projectSummary?: string | null;
}

export interface SubmissionValidationInput {
  applicantPersonId: string;
  projectName: string;
  directionOptionId: string;
  directionOptionCode: string;
  directionOtherText: string | null;
  researchTypeOptionId: string;
  researchTypeOptionCode: string;
  researchTypeOtherText: string | null;
  fundingRecordAmountCny: string | null;
  projectSummary: string;
  owners: ProposedOwnerInput[];
  hasValidSwimlane?: boolean;
}
