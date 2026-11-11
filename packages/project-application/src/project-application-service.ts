import { validateDraft, validateSubmission } from "./application-policy.js";
import { validateApplicationSwimlane } from "./swimlane-policy.js";
import type {
  ProjectApplicationActor,
  ProjectApplicationErrorCode,
} from "./contracts.js";
import {
  ProjectApplicationError,
  type ApplicationFormInput,
  type ExistingApplicationCommandInput,
  type PmoReviewCommandInput,
  type ProjectApplicationGateway,
  type SaveDraftInput,
  type SaveApplicationSwimlaneInput,
  type WithdrawApplicationInput,
} from "./repository-contracts.js";

export class ProjectApplicationService {
  constructor(private readonly gateway: ProjectApplicationGateway) {}

  async createDraft(input: {
    actor: ProjectApplicationActor;
    commandId: string;
    projectName: string;
    projectSummary?: string | null;
  }) {
    requireRole(input.actor, "KEY_SUB_I");
    throwFirst(validateDraft(input));
    return this.gateway.createDraft(input);
  }

  async saveDraft(input: SaveDraftInput) {
    requireRole(input.actor, "KEY_SUB_I");
    throwFirst(validateDraft(input.form));
    return this.gateway.saveDraft(input);
  }

  async saveSwimlane(input: SaveApplicationSwimlaneInput) {
    requireRole(input.actor, "KEY_SUB_I");
    if (!validateApplicationSwimlane(input.swimlane)) {
      throw new ProjectApplicationError("PROJECT_APPLICATION_SWIMLANE_INVALID");
    }
    return this.gateway.saveSwimlane(input);
  }

  async submitApplication(input: ExistingApplicationCommandInput & {
    formForValidation: ApplicationFormInput;
    applicantPersonId: string;
  }) {
    requireRole(input.actor, "KEY_SUB_I");
    throwFirst(validateSubmission({
      applicantPersonId: input.applicantPersonId,
      projectName: input.formForValidation.projectName,
      projectSummary: input.formForValidation.projectSummary ?? "",
      directionOptionId: input.formForValidation.directionOptionId ?? "",
      directionOptionCode: input.formForValidation.directionOptionCode ?? "",
      directionOtherText: input.formForValidation.directionOtherText,
      researchTypeOptionId: input.formForValidation.researchTypeOptionId ?? "",
      researchTypeOptionCode: input.formForValidation.researchTypeOptionCode ?? "",
      researchTypeOtherText: input.formForValidation.researchTypeOtherText,
      fundingRecordAmountCny: input.formForValidation.fundingRecordAmountCny,
      owners: input.formForValidation.owners.map((owner) => ({
        personId: owner.personId,
        isPrimary: owner.isPrimary,
        activeKeySubI: true,
      })),
      hasValidSwimlane: true,
    }));
    return this.gateway.submitApplication(input);
  }

  async withdrawApplication(input: WithdrawApplicationInput) {
    requireRole(input.actor, "KEY_SUB_I");
    return this.gateway.withdrawApplication(input);
  }

  async returnForRevision(input: PmoReviewCommandInput) {
    requireRole(input.actor, "PMO");
    requireComment(input.comment);
    return this.gateway.returnForRevision(input);
  }

  async putOnHold(input: PmoReviewCommandInput) {
    requireRole(input.actor, "PMO");
    requireComment(input.comment);
    return this.gateway.putOnHold(input);
  }

  async resumeReview(input: PmoReviewCommandInput) {
    requireRole(input.actor, "PMO");
    return this.gateway.resumeReview(input);
  }

  async rejectApplication(input: PmoReviewCommandInput) {
    requireRole(input.actor, "PMO");
    requireComment(input.comment);
    return this.gateway.rejectApplication(input);
  }

  async approveAndEstablish(input: PmoReviewCommandInput) {
    requireRole(input.actor, "PMO");
    return this.gateway.approveAndEstablish(input);
  }
}

function requireRole(actor: ProjectApplicationActor, roleCode: "KEY_SUB_I" | "PMO"): void {
  if (actor.roleCode !== roleCode) {
    throw new ProjectApplicationError("PROJECT_APPLICATION_FORBIDDEN");
  }
}

function requireComment(comment: string | null): void {
  if (!comment?.trim()) {
    throw new ProjectApplicationError("PROJECT_APPLICATION_VALIDATION_FAILED");
  }
}

function throwFirst(errors: readonly ProjectApplicationErrorCode[]): void {
  const [error] = errors;
  if (error) throw new ProjectApplicationError(error);
}
