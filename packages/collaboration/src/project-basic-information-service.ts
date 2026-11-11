import type { CollaborationActor } from "./contracts.js";
import type { ProjectBasicInformationChangeCommand, ProjectBasicInformationDecisionCommand, ProjectBasicInformationRepository } from "./project-basic-information-contracts.js";
import { CollaborationError } from "./repository-contracts.js";

const prohibited = [/患者姓名/iu, /患者手机号/iu, /身份证号/iu, /住院号/iu, /病历/iu, /检查报告/iu, /受试者明细/iu, /\bCRF\b/iu, /\bEDC\b/iu];

export class ProjectBasicInformationService {
  constructor(private readonly repository: ProjectBasicInformationRepository) {}

  async getWorkspace(actor: CollaborationActor, projectId: string) {
    const result = await this.repository.getWorkspace(actor, projectId.trim());
    if (!result) throw new CollaborationError("PROJECT_NOT_FOUND");
    return result;
  }

  async submit(actor: CollaborationActor, input: ProjectBasicInformationChangeCommand) {
    if (actor.roleCode !== "PMO" && actor.roleCode !== "KEY_SUB_I") forbidden();
    const normalized = normalize(input);
    validate(normalized);
    return this.repository.submit(actor, normalized);
  }

  async decide(actor: CollaborationActor, input: ProjectBasicInformationDecisionCommand) {
    if (actor.roleCode !== "PMO" && actor.roleCode !== "KEY_SUB_I") forbidden();
    if (!input.projectId.trim() || !input.requestId.trim() || (input.decision === "RETURN" && !input.note?.trim())) invalid();
    return this.repository.decide(actor, { ...input, projectId: input.projectId.trim(), requestId: input.requestId.trim(), note: input.note?.normalize("NFKC").trim() || null });
  }
}

function normalize(input: ProjectBasicInformationChangeCommand): ProjectBasicInformationChangeCommand {
  const optional = (value: string | null) => value?.normalize("NFKC").trim() || null;
  return { ...input, commandId: input.commandId.trim(), projectId: input.projectId.trim(), projectName: input.projectName.normalize("NFKC").trim(), projectSummary: input.projectSummary.normalize("NFKC").trim(), diseaseAreaOptionId: input.diseaseAreaOptionId.trim(), diseaseAreaOptionCode: input.diseaseAreaOptionCode.trim(), diseaseAreaOtherText: optional(input.diseaseAreaOtherText), researchTypeOptionId: input.researchTypeOptionId.trim(), researchTypeOptionCode: input.researchTypeOptionCode.trim(), researchTypeOtherText: optional(input.researchTypeOtherText), leadOrganizationName: optional(input.leadOrganizationName), sponsorName: optional(input.sponsorName), fundingRecordAmountCny: optional(input.fundingRecordAmountCny), reason: input.reason.normalize("NFKC").trim() };
}

function validate(input: ProjectBasicInformationChangeCommand) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(input.commandId) || !input.projectId || !input.projectName || !input.projectSummary || !input.diseaseAreaOptionId || !input.researchTypeOptionId || !input.reason || input.reason.length > 500) invalid();
  if ((input.diseaseAreaOptionCode === "OTHER") !== Boolean(input.diseaseAreaOtherText) || (input.researchTypeOptionCode === "OTHER") !== Boolean(input.researchTypeOtherText)) invalid();
  if (input.fundingRecordAmountCny !== null && (!/^(?:0\.[0-9]{1,2}|[1-9][0-9]{0,11}(?:\.[0-9]{1,2})?)$/u.test(input.fundingRecordAmountCny) || Number(input.fundingRecordAmountCny) <= 0)) invalid();
  if ([input.projectName, input.projectSummary, input.diseaseAreaOtherText ?? "", input.researchTypeOtherText ?? ""].some((value) => prohibited.some((pattern) => pattern.test(value)))) throw new CollaborationError("PROJECT_BASIC_INFORMATION_PATIENT_DATA_PROHIBITED");
}
function invalid(): never { throw new CollaborationError("PROJECT_BASIC_INFORMATION_INVALID_INPUT"); }
function forbidden(): never { throw new CollaborationError("PROJECT_BASIC_INFORMATION_FORBIDDEN"); }
