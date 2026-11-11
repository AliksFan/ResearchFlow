import type { CollaborationActor } from "./contracts.js";

export interface ProjectBasicInformationValues {
  projectName: string;
  projectSummary: string;
  diseaseAreaOptionId: string;
  diseaseAreaOptionCode: string;
  diseaseAreaOtherText: string | null;
  researchTypeOptionId: string;
  researchTypeOptionCode: string;
  researchTypeOtherText: string | null;
  leadOrganizationName: string | null;
  sponsorName: string | null;
  fundingRecordAmountCny: string | null;
}

export interface ProjectBasicInformationChangeItem {
  fieldCode: "PROJECT_NAME" | "PROJECT_SUMMARY" | "DISEASE_AREA" | "RESEARCH_TYPE" | "LEAD_ORGANIZATION_NAME" | "SPONSOR_NAME" | "FUNDING_RECORD_AMOUNT_CNY";
  oldDisplayValue: string;
  newDisplayValue: string;
}

export interface ProjectBasicInformationChangeSummary {
  requestId: string;
  status: "PENDING_PMO_REVIEW" | "PENDING_PRIMARY_KEY_SUB_I_REVIEW" | "APPLIED" | "STALE" | "CLOSED";
  submittedByDisplayName: string;
  submittedRoleCode: "PMO" | "KEY_SUB_I";
  reason: string;
  submittedAt: string;
  closedAt: string | null;
  items: ProjectBasicInformationChangeItem[];
  canApply: boolean;
  canReturn: boolean;
}

export interface ProjectBasicInformationWorkspace {
  projectId: string;
  projectStatus: "ACTIVE" | "CLOSING" | "COMPLETED" | "ARCHIVED";
  canSubmit: boolean;
  values: ProjectBasicInformationValues;
  dictionaryOptions: {
    diseaseAreas: Array<{ id: string; code: string; label: string }>;
    researchTypes: Array<{ id: string; code: string; label: string }>;
  };
  activeRequest: ProjectBasicInformationChangeSummary | null;
  history: ProjectBasicInformationChangeSummary[];
}

export interface ProjectBasicInformationChangeCommand extends ProjectBasicInformationValues {
  commandId: string;
  projectId: string;
  reason: string;
}

export interface ProjectBasicInformationDecisionCommand {
  projectId: string;
  requestId: string;
  decision: "APPLY" | "RETURN";
  note: string | null;
}

export interface ProjectBasicInformationRepository {
  getWorkspace(actor: CollaborationActor, projectId: string): Promise<ProjectBasicInformationWorkspace | null>;
  submit(actor: CollaborationActor, input: ProjectBasicInformationChangeCommand): Promise<{ requestId: string }>;
  decide(actor: CollaborationActor, input: ProjectBasicInformationDecisionCommand): Promise<void>;
}
