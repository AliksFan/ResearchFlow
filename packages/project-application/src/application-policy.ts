import type {
  DraftValidationInput,
  ProjectApplicationErrorCode,
  ProjectApplicationStatus,
  SubmissionValidationInput,
} from "./contracts.js";
import { normalizeProjectName } from "./name-normalization.js";
import { containsProhibitedPatientData } from "./patient-data-policy.js";

const TRANSITIONS: Readonly<Record<ProjectApplicationStatus, readonly ProjectApplicationStatus[]>> = {
  DRAFT: ["PENDING_ESTABLISHMENT_REVIEW", "CANCELLED"],
  PENDING_ESTABLISHMENT_REVIEW: [
    "RETURNED_FOR_REVISION",
    "ON_HOLD",
    "REJECTED",
    "ACTIVE",
    "CANCELLED",
  ],
  RETURNED_FOR_REVISION: ["PENDING_ESTABLISHMENT_REVIEW", "CANCELLED"],
  ON_HOLD: ["PENDING_ESTABLISHMENT_REVIEW", "REJECTED", "CANCELLED"],
  ACTIVE: [],
  REJECTED: [],
  CANCELLED: [],
};

export function canTransitionProjectApplication(
  from: ProjectApplicationStatus,
  to: ProjectApplicationStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function validateDraft(
  input: DraftValidationInput,
): ProjectApplicationErrorCode[] {
  if (!normalizeProjectName(input.projectName)) {
    return ["PROJECT_APPLICATION_VALIDATION_FAILED"];
  }
  if (
    containsProhibitedPatientData(input.projectName) ||
    containsProhibitedPatientData(input.projectSummary ?? "")
  ) {
    return ["PROJECT_APPLICATION_PATIENT_DATA_PROHIBITED"];
  }
  return [];
}

export function validateSubmission(
  input: SubmissionValidationInput,
): ProjectApplicationErrorCode[] {
  const errors = new Set<ProjectApplicationErrorCode>();
  if (
    !normalizeProjectName(input.projectName) ||
    !input.directionOptionId.trim() ||
    !input.researchTypeOptionId.trim() ||
    !input.projectSummary.trim()
  ) {
    errors.add("PROJECT_APPLICATION_VALIDATION_FAILED");
  }

  if (!isValidFundingRecordAmount(input.fundingRecordAmountCny)) {
    errors.add("PROJECT_APPLICATION_VALIDATION_FAILED");
  }

  if (
    !isValidOtherSelection(input.directionOptionCode, input.directionOtherText) ||
    !isValidOtherSelection(input.researchTypeOptionCode, input.researchTypeOtherText)
  ) {
    errors.add("PROJECT_APPLICATION_VALIDATION_FAILED");
  }

  if (
    containsProhibitedPatientData(input.projectName) ||
    containsProhibitedPatientData(input.projectSummary)
  ) {
    errors.add("PROJECT_APPLICATION_PATIENT_DATA_PROHIBITED");
  }

  const uniqueOwners = new Set(input.owners.map((owner) => owner.personId));
  const applicant = input.owners.find(
    (owner) => owner.personId === input.applicantPersonId,
  );
  if (
    input.owners.length === 0 ||
    uniqueOwners.size !== input.owners.length ||
    !applicant ||
    input.owners.some((owner) => !owner.activeKeySubI)
  ) {
    errors.add("PROJECT_APPLICATION_OWNER_INACTIVE");
  }

  if (input.owners.filter((owner) => owner.isPrimary).length !== 1) {
    errors.add("PROJECT_APPLICATION_PRIMARY_OWNER_INVALID");
  }

  if (input.hasValidSwimlane === false) errors.add("PROJECT_APPLICATION_SWIMLANE_INVALID");
  return [...errors];
}

function isValidFundingRecordAmount(value: string | null): boolean {
  if (value === null) return true;
  if (!/^(?:0\.[0-9]{1,2}|[1-9][0-9]{0,11}(?:\.[0-9]{1,2})?)$/u.test(value)) return false;
  return Number(value) > 0;
}

function isValidOtherSelection(optionCode: string, otherText: string | null): boolean {
  const normalized = otherText?.normalize("NFKC").trim() ?? "";
  return optionCode === "OTHER"
    ? normalized.length > 0 && [...normalized].length <= 100
    : normalized.length === 0;
}
