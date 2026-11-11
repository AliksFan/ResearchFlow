import type {
  ProjectApplicationActor,
  ProjectApplicationErrorCode,
  ProjectApplicationStatus,
  ApplicationSwimlaneInput,
} from "./contracts.js";

export interface ApplicationOwnerInput {
  personId: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface ApplicationFormInput {
  projectName: string;
  projectSummary: string | null;
  directionOptionId: string | null;
  directionOptionCode?: string | null;
  directionOtherText: string | null;
  researchTypeOptionId: string | null;
  researchTypeOptionCode?: string | null;
  researchTypeOtherText: string | null;
  leadOrganizationName?: string | null;
  sponsorName?: string | null;
  fundingRecordAmountCny: string | null;
  owners: ApplicationOwnerInput[];
}

export interface ProjectApplicationSnapshot {
  projectId: string;
  applicationCode: string;
  projectCode: string | null;
  projectName: string;
  status: ProjectApplicationStatus;
  rowVersion: number;
  applicationVersionId: string;
  applicationVersionNo: number;
  reviewId: string | null;
  reviewSubmissionNo: number | null;
}

export interface ProjectApplicationListItem extends ProjectApplicationSnapshot {
  applicantPersonId: string;
  applicantDisplayName: string;
  primaryOwnerDisplayName: string | null;
  submittedAt: string | null;
  updatedAt: string;
}

export interface ProjectApplicationDetail extends ProjectApplicationListItem {
  form: ApplicationFormInput;
  swimlane: ApplicationSwimlaneInput & { sourceTemplateName: string | null };
  reviewDecision: string | null;
  reviewComment: string | null;
  activities: Array<{
    activityType: string;
    actorDisplayName: string;
    content: string | null;
    createdAt: string;
  }>;
  canAccessEstablishedProject: boolean;
  canWithdraw: boolean;
}

export interface ProjectApplicationFormOptions {
  people: Array<{ id: string; displayName: string }>;
  directions: Array<{ id: string; optionCode: string; displayName: string }>;
  researchTypes: Array<{ id: string; optionCode: string; displayName: string }>;
  lifecycleTemplates: Array<{
    id: string;
    displayName: string;
    description: string;
    stages: Array<{ id: string; code: string; displayName: string; sortOrder: number; applicability: "REQUIRED" | "OPTIONAL" | "NOT_APPLICABLE" }>;
    workflows: Array<{ id: string; code: string; displayName: string; description: string; sortOrder: number; enabled: boolean }>;
    nodes: Array<{
      id: string;
      workflowId: string;
      stageId: string;
      displayName: string;
      applicability: "REQUIRED" | "OPTIONAL" | "NOT_APPLICABLE";
      predecessorIds: string[];
      sortOrder: number;
      ownerRoles: Array<"PMO" | "KEY_SUB_I" | "CRC" | "STATISTICIAN" | "COLLABORATION_LEAD">;
      attachmentRequirement: "NONE" | "OPTIONAL" | "REQUIRED";
    }>;
  }>;
}

interface ApplicantCommandBase {
  actor: ProjectApplicationActor;
  commandId: string;
}

export interface CreateDraftInput extends ApplicantCommandBase {
  projectName: string;
  projectSummary?: string | null;
}

export interface ExistingApplicationCommandInput extends ApplicantCommandBase {
  projectId: string;
  applicationVersionId: string;
  expectedRowVersion: number;
}

export interface SaveDraftInput extends ExistingApplicationCommandInput {
  form: ApplicationFormInput;
}

export interface SaveApplicationSwimlaneInput extends ExistingApplicationCommandInput {
  swimlane: ApplicationSwimlaneInput;
}

export interface WithdrawApplicationInput extends ExistingApplicationCommandInput {
  reviewId: string | null;
  reason: string | null;
}

export interface PmoReviewCommandInput extends ExistingApplicationCommandInput {
  reviewId: string;
  comment: string | null;
}

export interface ProjectApplicationGateway {
  createDraft(input: CreateDraftInput): Promise<ProjectApplicationSnapshot>;
  saveDraft(input: SaveDraftInput): Promise<ProjectApplicationSnapshot>;
  saveSwimlane(input: SaveApplicationSwimlaneInput): Promise<ProjectApplicationSnapshot>;
  submitApplication(input: ExistingApplicationCommandInput): Promise<ProjectApplicationSnapshot>;
  withdrawApplication(input: WithdrawApplicationInput): Promise<ProjectApplicationSnapshot>;
  returnForRevision(input: PmoReviewCommandInput): Promise<ProjectApplicationSnapshot>;
  putOnHold(input: PmoReviewCommandInput): Promise<ProjectApplicationSnapshot>;
  resumeReview(input: PmoReviewCommandInput): Promise<ProjectApplicationSnapshot>;
  rejectApplication(input: PmoReviewCommandInput): Promise<ProjectApplicationSnapshot>;
  approveAndEstablish(input: PmoReviewCommandInput): Promise<ProjectApplicationSnapshot>;
  listMyApplications(actor: ProjectApplicationActor): Promise<ProjectApplicationListItem[]>;
  getMyApplicationDetail(actor: ProjectApplicationActor, projectId: string): Promise<ProjectApplicationDetail | null>;
  listPmoReviewQueue(actor: ProjectApplicationActor): Promise<ProjectApplicationListItem[]>;
  getPmoApplicationDetail(actor: ProjectApplicationActor, projectId: string): Promise<ProjectApplicationDetail | null>;
  getFormOptions(actor: ProjectApplicationActor): Promise<ProjectApplicationFormOptions>;
}

export class ProjectApplicationError extends Error {
  constructor(
    public readonly code: ProjectApplicationErrorCode,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "ProjectApplicationError";
  }
}
