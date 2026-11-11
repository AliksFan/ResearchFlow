import { randomUUID } from "node:crypto";
import { normalizeProjectName } from "@researchflow/project-application";
import { CollaborationError, type CollaborationActor, type ProjectBasicInformationChangeCommand, type ProjectBasicInformationChangeSummary, type ProjectBasicInformationDecisionCommand, type ProjectBasicInformationRepository, type ProjectBasicInformationWorkspace } from "@researchflow/collaboration";
import type { Prisma } from "../generated/client.js";
import type { ApplicationPrismaClient } from "./client.js";

type Tx = Prisma.TransactionClient;
const terminal = ["APPLIED", "STALE", "CLOSED"] as const;
const requestInclude = { submittedBy: { select: { displayName: true } }, items: { orderBy: { fieldCode: "asc" as const }, include: { oldOption: { select: { optionCode: true, displayName: true } }, newOption: { select: { optionCode: true, displayName: true } } } } } satisfies Prisma.ProjectFieldChangeRequestInclude;
type RequestRow = Prisma.ProjectFieldChangeRequestGetPayload<{ include: typeof requestInclude }>;

export class PrismaProjectBasicInformationRepository implements ProjectBasicInformationRepository {
  constructor(private readonly client: ApplicationPrismaClient) {}

  getWorkspace(actor: CollaborationActor, projectId: string): Promise<ProjectBasicInformationWorkspace | null> {
    return this.client.$transaction(async (tx) => {
      const project = await readableProject(tx, actor, projectId);
      if (!project) return null;
      const requests = await tx.projectFieldChangeRequest.findMany({ where: { projectId, changeCategory: "BASIC_INFORMATION" }, orderBy: { submittedAt: "desc" }, include: requestInclude });
      const diseaseAreas = await options(tx, "DISEASE_AREA");
      const researchTypes = await options(tx, "RESEARCH_TYPE");
      const primary = project.roleAssignments.find((item) => item.isPrimary) ?? null;
      const mapped = requests.map((request) => mapRequest(request, actor, primary?.personId ?? null));
      return {
        projectId,
        projectStatus: project.status as ProjectBasicInformationWorkspace["projectStatus"],
        canSubmit: project.status === "ACTIVE" && !mapped.some((item) => !terminal.includes(item.status as (typeof terminal)[number])) && (actor.roleCode === "PMO" || primary?.personId === actor.personId),
        values: values(project),
        dictionaryOptions: { diseaseAreas, researchTypes },
        activeRequest: mapped.find((item) => !terminal.includes(item.status as (typeof terminal)[number])) ?? null,
        history: mapped.filter((item) => terminal.includes(item.status as (typeof terminal)[number])),
      };
    }, { isolationLevel: "Serializable" });
  }

  submit(actor: CollaborationActor, input: ProjectBasicInformationChangeCommand): Promise<{ requestId: string }> {
    return this.client.$transaction(async (tx) => {
      const duplicate = await tx.projectFieldChangeRequest.findUnique({ where: { submittedByPersonId_commandId: { submittedByPersonId: actor.personId, commandId: input.commandId } }, select: { id: true, projectId: true, submittedRoleCode: true } });
      if (duplicate) {
        if (duplicate.projectId !== input.projectId || duplicate.submittedRoleCode !== actor.roleCode) forbidden();
        return { requestId: duplicate.id };
      }
      const project = await writableProject(tx, actor, input.projectId);
      if (!project) forbidden();
      if (project.status !== "ACTIVE") throw new CollaborationError("PROJECT_NOT_ACTIVE");
      const primary = project.roleAssignments.find((item) => item.isPrimary);
      if (!primary || (actor.roleCode === "KEY_SUB_I" && primary.personId !== actor.personId)) forbidden();
      const disease = await validOption(tx, "DISEASE_AREA", input.diseaseAreaOptionId, input.diseaseAreaOptionCode);
      const research = await validOption(tx, "RESEARCH_TYPE", input.researchTypeOptionId, input.researchTypeOptionCode);
      const items = changes(project, input, disease, research);
      if (!items.length) throw new CollaborationError("PROJECT_BASIC_INFORMATION_NO_CHANGES");
      const now = new Date();
      const request = await tx.projectFieldChangeRequest.create({ data: { commandId: input.commandId, projectId: project.id, changeCategory: "BASIC_INFORMATION", projectRowVersionSnapshot: project.rowVersion, reason: input.reason, status: actor.roleCode === "PMO" ? "PENDING_PRIMARY_KEY_SUB_I_REVIEW" : "PENDING_PMO_REVIEW", submittedByPersonId: actor.personId, submittedRoleCode: actor.roleCode, primaryKeySubIPersonIdSnapshot: primary.personId, governanceEscalationRequired: false, governanceEvaluationSummary: "基础信息变更不升级院长", submittedAt: now, items: { create: items } } });
      const activity = await tx.projectFieldChangeActivity.create({ data: { requestId: request.id, activityType: "SUBMITTED", actorPersonId: actor.personId, actorRoleCode: actor.roleCode, content: input.reason } });
      await notifyReviewers(tx, actor, project, request.id, activity.id, primary.personId);
      await audit(tx, actor, project, request.id, "PROJECT_BASIC_INFORMATION_CHANGE_SUBMITTED", items.map((item) => item.fieldCode), "提交项目基础信息变更");
      return { requestId: request.id };
    }, { isolationLevel: "Serializable" }).catch(async (error: unknown) => {
      if (isUniqueConflict(error)) {
        const duplicate = await this.client.projectFieldChangeRequest.findUnique({ where: { submittedByPersonId_commandId: { submittedByPersonId: actor.personId, commandId: input.commandId } }, select: { id: true, projectId: true, submittedRoleCode: true } });
        if (duplicate?.projectId === input.projectId && duplicate.submittedRoleCode === actor.roleCode) return { requestId: duplicate.id };
      }
      return mapConflict(error);
    });
  }

  decide(actor: CollaborationActor, input: ProjectBasicInformationDecisionCommand): Promise<void> {
    return this.client.$transaction(async (tx) => {
      const request = await tx.projectFieldChangeRequest.findUnique({ where: { id: input.requestId }, include: { ...requestInclude, project: { include: { roleAssignments: { where: { roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } }, select: { personId: true, isPrimary: true } } } } } });
      if (!request || request.projectId !== input.projectId || request.changeCategory !== "BASIC_INFORMATION") forbidden();
      const project = request.project;
      const readable = await readableProject(tx, actor, project.id);
      if (!readable) forbidden();
      const primary = project.roleAssignments.find((item) => item.isPrimary);
      const pmoDecision = request.status === "PENDING_PMO_REVIEW" && actor.roleCode === "PMO";
      const primaryDecision = request.status === "PENDING_PRIMARY_KEY_SUB_I_REVIEW" && actor.roleCode === "KEY_SUB_I" && request.primaryKeySubIPersonIdSnapshot === actor.personId && primary?.personId === actor.personId;
      if (!pmoDecision && !primaryDecision) forbidden();
      if (input.decision === "RETURN") {
        const activity = await tx.projectFieldChangeActivity.create({ data: { requestId: request.id, activityType: "RETURNED", actorPersonId: actor.personId, actorRoleCode: actor.roleCode, content: input.note } });
        await tx.projectFieldChangeRequest.update({ where: { id: request.id }, data: { status: "CLOSED", closedAt: new Date() } });
        await finishAction(tx, request.id, actor, "已退回并关闭");
        await notifySubmitter(tx, actor, project, request, activity.id, "PROJECT_BASIC_INFORMATION_CHANGE_RETURNED", "项目基础信息变更已退回", input.note ?? "");
        await audit(tx, actor, project, request.id, "PROJECT_BASIC_INFORMATION_CHANGE_RETURNED", [], "退回项目基础信息变更");
        return;
      }
      if (project.status !== "ACTIVE" || project.rowVersion !== request.projectRowVersionSnapshot || !primary || primary.personId !== request.primaryKeySubIPersonIdSnapshot) {
        await tx.projectFieldChangeRequest.update({ where: { id: request.id }, data: { status: "STALE", closedAt: new Date() } });
        await tx.projectFieldChangeActivity.create({ data: { requestId: request.id, activityType: "MARKED_STALE", actorPersonId: actor.personId, actorRoleCode: actor.roleCode, content: "项目状态、正式值或主负责人已变化" } });
        await finishAction(tx, request.id, actor, "正式值已变化，申请失效");
        await audit(tx, actor, project, request.id, "PROJECT_BASIC_INFORMATION_CHANGE_STALE", [], "项目基础信息变更因正式值变化而失效");
        return "STALE" as const;
      }
      const data = applyData(request.items);
      if (data.projectName) {
        data.normalizedNameOccupancy = normalizeProjectName(data.projectName as string);
        const occupied = await tx.project.findFirst({ where: { id: { not: project.id }, normalizedNameOccupancy: data.normalizedNameOccupancy as string }, select: { id: true } });
        if (occupied) {
          await markStale(tx, actor, project, request, "项目名称已被其他项目占用");
          return "STALE" as const;
        }
      }
      const updated = await tx.project.updateMany({ where: { id: project.id, rowVersion: request.projectRowVersionSnapshot, status: "ACTIVE" }, data: { ...data, rowVersion: { increment: 1 } } });
      if (updated.count !== 1) {
        await markStale(tx, actor, project, request, "项目状态或正式值已并发变化");
        return "STALE" as const;
      }
      const now = new Date();
      const activity = await tx.projectFieldChangeActivity.create({ data: { requestId: request.id, activityType: pmoDecision ? "PMO_APPLIED" : "APPLIED", actorPersonId: actor.personId, actorRoleCode: actor.roleCode, content: input.note } });
      await tx.projectFieldChangeRequest.update({ where: { id: request.id }, data: { status: "APPLIED", appliedAt: now, closedAt: now } });
      await finishAction(tx, request.id, actor, "变更已确认并生效");
      await notifySubmitter(tx, actor, project, request, activity.id, "PROJECT_BASIC_INFORMATION_CHANGE_APPLIED", "项目基础信息变更已生效", input.note ?? "");
      await audit(tx, actor, project, request.id, "PROJECT_BASIC_INFORMATION_CHANGE_APPLIED", request.items.map((item) => item.fieldCode), "应用项目基础信息变更");
      return "APPLIED" as const;
    }, { isolationLevel: "Serializable" }).then((outcome) => {
      if (outcome === "STALE") throw new CollaborationError("PROJECT_BASIC_INFORMATION_CONFLICT");
    }).catch(mapConflict);
  }
}

async function readableProject(tx: Tx, actor: CollaborationActor, id: string) {
  if (actor.roleCode !== "PMO" && actor.roleCode !== "DEAN" && actor.roleCode !== "KEY_SUB_I") return null;
  const session = await tx.session.findFirst({ where: { id: actor.sessionId, personId: actor.personId, activeRoleCode: actor.roleCode, revokedAt: null, expiresAt: { gt: new Date() }, person: { accountStatus: "ACTIVE" } }, select: { id: true } });
  if (!session) forbidden();
  if (actor.roleCode === "PMO" || actor.roleCode === "DEAN") { const global = await tx.roleAssignment.findFirst({ where: { personId: actor.personId, projectId: null, roleCode: actor.roleCode, assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } }, select: { id: true } }); if (!global) return null; }
  return tx.project.findFirst({ where: { id, projectCode: { not: null }, status: { in: ["ACTIVE", "CLOSING", "COMPLETED", "ARCHIVED"] }, ...(actor.roleCode === "KEY_SUB_I" ? { roleAssignments: { some: { personId: actor.personId, roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE" } } } : {}) }, include: { applicant: { select: { displayName: true } }, establishedBy: { select: { displayName: true } }, diseaseAreaOption: { select: { optionCode: true, displayName: true } }, researchTypeOption: { select: { optionCode: true, displayName: true } }, roleAssignments: { where: { roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } }, orderBy: [{ isPrimary: "desc" }, { activatedAt: "asc" }], select: { personId: true, isPrimary: true, person: { select: { displayName: true } } } } } });
}
async function writableProject(tx: Tx, actor: CollaborationActor, id: string) { if (actor.roleCode !== "PMO" && actor.roleCode !== "KEY_SUB_I") return null; return readableProject(tx, actor, id); }
type ProjectRow = NonNullable<Awaited<ReturnType<typeof readableProject>>>;
function values(project: ProjectRow) { return { projectName: project.projectName, projectSummary: project.projectSummary ?? "", diseaseAreaOptionId: project.diseaseAreaOptionId ?? "", diseaseAreaOptionCode: project.diseaseAreaOption?.optionCode ?? "", diseaseAreaOtherText: project.diseaseAreaOtherText, researchTypeOptionId: project.researchTypeOptionId ?? "", researchTypeOptionCode: project.researchTypeOption?.optionCode ?? "", researchTypeOtherText: project.researchTypeOtherText, leadOrganizationName: project.leadOrganizationName, sponsorName: project.sponsorName, fundingRecordAmountCny: project.fundingRecordAmountCny?.toFixed(2) ?? null }; }
async function options(tx: Tx, code: string) { return (await tx.dictionaryOption.findMany({ where: { dictionaryCode: code, enabled: true }, orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }], select: { id: true, optionCode: true, displayName: true } })).map((item) => ({ id: item.id, code: item.optionCode, label: item.displayName })); }
async function validOption(tx: Tx, dictionaryCode: string, id: string, optionCode: string) { const item = await tx.dictionaryOption.findFirst({ where: { id, dictionaryCode, optionCode, enabled: true }, select: { id: true, optionCode: true, displayName: true } }); if (!item) throw new CollaborationError("PROJECT_BASIC_INFORMATION_INVALID_INPUT"); return item; }
function changes(project: ProjectRow, input: ProjectBasicInformationChangeCommand, disease: { id: string; optionCode: string; displayName: string }, research: { id: string; optionCode: string; displayName: string }): Prisma.ProjectFieldChangeItemCreateWithoutRequestInput[] { const rows: Prisma.ProjectFieldChangeItemCreateWithoutRequestInput[] = []; const text = (fieldCode: string, oldValueText: string | null, newValueText: string | null) => { if ((oldValueText ?? "") !== (newValueText ?? "")) rows.push({ fieldCode, oldValueText, newValueText }); }; text("PROJECT_NAME", project.projectName, input.projectName); text("PROJECT_SUMMARY", project.projectSummary, input.projectSummary); if (project.diseaseAreaOptionId !== disease.id || project.diseaseAreaOtherText !== input.diseaseAreaOtherText) rows.push({ fieldCode: "DISEASE_AREA", oldOption: project.diseaseAreaOptionId ? { connect: { id: project.diseaseAreaOptionId } } : undefined, newOption: { connect: { id: disease.id } }, oldValueText: project.diseaseAreaOtherText, newValueText: input.diseaseAreaOtherText }); if (project.researchTypeOptionId !== research.id || project.researchTypeOtherText !== input.researchTypeOtherText) rows.push({ fieldCode: "RESEARCH_TYPE", oldOption: project.researchTypeOptionId ? { connect: { id: project.researchTypeOptionId } } : undefined, newOption: { connect: { id: research.id } }, oldValueText: project.researchTypeOtherText, newValueText: input.researchTypeOtherText }); text("LEAD_ORGANIZATION_NAME", project.leadOrganizationName, input.leadOrganizationName); text("SPONSOR_NAME", project.sponsorName, input.sponsorName); if ((project.fundingRecordAmountCny?.toFixed(2) ?? null) !== input.fundingRecordAmountCny) rows.push({ fieldCode: "FUNDING_RECORD_AMOUNT_CNY", oldNumberValue: project.fundingRecordAmountCny, newNumberValue: input.fundingRecordAmountCny }); return rows; }
function mapRequest(request: RequestRow, actor: CollaborationActor, primaryId: string | null): ProjectBasicInformationChangeSummary { return { requestId: request.id, status: request.status as ProjectBasicInformationChangeSummary["status"], submittedByDisplayName: request.submittedBy.displayName, submittedRoleCode: request.submittedRoleCode as "PMO" | "KEY_SUB_I", reason: request.reason, submittedAt: request.submittedAt.toISOString(), closedAt: request.closedAt?.toISOString() ?? null, items: request.items.map((item) => ({ fieldCode: item.fieldCode as ProjectBasicInformationChangeSummary["items"][number]["fieldCode"], oldDisplayValue: display(item, "old"), newDisplayValue: display(item, "new") })), canApply: (request.status === "PENDING_PMO_REVIEW" && actor.roleCode === "PMO") || (request.status === "PENDING_PRIMARY_KEY_SUB_I_REVIEW" && actor.roleCode === "KEY_SUB_I" && actor.personId === request.primaryKeySubIPersonIdSnapshot && actor.personId === primaryId), canReturn: (request.status === "PENDING_PMO_REVIEW" && actor.roleCode === "PMO") || (request.status === "PENDING_PRIMARY_KEY_SUB_I_REVIEW" && actor.roleCode === "KEY_SUB_I" && actor.personId === request.primaryKeySubIPersonIdSnapshot && actor.personId === primaryId) }; }
function display(item: RequestRow["items"][number], side: "old" | "new") { const option = side === "old" ? item.oldOption : item.newOption; const text = side === "old" ? item.oldValueText : item.newValueText; const number = side === "old" ? item.oldNumberValue : item.newNumberValue; if (option) return option.optionCode === "OTHER" && text ? `${option.displayName}：${text}` : option.displayName; if (number !== null) return `¥${number.toFixed(2)}`; return text || "未填写"; }
function applyData(items: RequestRow["items"]): Prisma.ProjectUpdateManyMutationInput { const data: Record<string, unknown> = {}; for (const item of items) { if (item.fieldCode === "PROJECT_NAME") data.projectName = item.newValueText!; else if (item.fieldCode === "PROJECT_SUMMARY") data.projectSummary = item.newValueText!; else if (item.fieldCode === "DISEASE_AREA") { data.diseaseAreaOptionId = item.newOptionId; data.diseaseAreaOtherText = item.newValueText; } else if (item.fieldCode === "RESEARCH_TYPE") { data.researchTypeOptionId = item.newOptionId; data.researchTypeOtherText = item.newValueText; } else if (item.fieldCode === "LEAD_ORGANIZATION_NAME") data.leadOrganizationName = item.newValueText; else if (item.fieldCode === "SPONSOR_NAME") data.sponsorName = item.newValueText; else if (item.fieldCode === "FUNDING_RECORD_AMOUNT_CNY") data.fundingRecordAmountCny = item.newNumberValue; } return data as Prisma.ProjectUpdateManyMutationInput; }
type ProjectIdentity = { id: string; projectCode: string | null; projectName: string };
async function notifyReviewers(tx: Tx, actor: CollaborationActor, project: ProjectIdentity, requestId: string, activityId: string, primaryId: string) { const recipients = actor.roleCode === "PMO" ? [{ personId: primaryId, roleCode: "KEY_SUB_I" as const }] : await tx.roleAssignment.findMany({ where: { projectId: null, roleCode: "PMO", assignmentStatus: "ACTIVE", person: { accountStatus: "ACTIVE" } }, distinct: ["personId"], select: { personId: true, roleCode: true } }); if (!recipients.length) forbidden(); await tx.notification.createMany({ data: recipients.map((recipient) => ({ recipientPersonId: recipient.personId, recipientRoleCode: recipient.roleCode, notificationType: "PROJECT_REVIEW_NOTICE" as const, eventCode: "PROJECT_BASIC_INFORMATION_CHANGE_REVIEW_REQUESTED", triggeredByPersonId: actor.personId, triggeredByRoleCode: actor.roleCode, projectId: project.id, projectFieldChangeRequestId: requestId, projectFieldChangeActivityId: activityId, title: `${project.projectCode ?? "项目"} 基础信息待确认`, content: `${project.projectName} 有一项基础信息变更待处理。`, eventKey: `project-basic-information-review:${requestId}:${recipient.personId}`, messageKind: "ACTION" as const, actionStatus: "PENDING" as const, actionGroupKey: `project-basic-information:${requestId}` })), skipDuplicates: true }); }
async function notifySubmitter(tx: Tx, actor: CollaborationActor, project: ProjectIdentity, request: RequestRow, activityId: string, eventCode: string, title: string, content: string) { if (request.submittedByPersonId === actor.personId && request.submittedRoleCode === actor.roleCode) return; await tx.notification.create({ data: { recipientPersonId: request.submittedByPersonId, recipientRoleCode: request.submittedRoleCode, notificationType: "PROJECT_REVIEW_NOTICE", eventCode, triggeredByPersonId: actor.personId, triggeredByRoleCode: actor.roleCode, projectId: project.id, projectFieldChangeRequestId: request.id, projectFieldChangeActivityId: activityId, title, content: `${project.projectCode ?? "项目"} · ${content}`, eventKey: `${eventCode}:${request.id}:${request.submittedByPersonId}`, messageKind: "INFORMATIONAL", actionStatus: "NOT_APPLICABLE" } }); }
async function finishAction(tx: Tx, requestId: string, actor: CollaborationActor, reason: string) { await tx.notification.updateMany({ where: { projectFieldChangeRequestId: requestId, actionStatus: "PENDING" }, data: { actionStatus: "COMPLETED", actionCompletedAt: new Date(), actionCompletionReason: `${actor.roleCode}：${reason}` } }); }
async function markStale(tx: Tx, actor: CollaborationActor, project: ProjectIdentity, request: RequestRow, content: string) { await tx.projectFieldChangeRequest.update({ where: { id: request.id }, data: { status: "STALE", closedAt: new Date() } }); await tx.projectFieldChangeActivity.create({ data: { requestId: request.id, activityType: "MARKED_STALE", actorPersonId: actor.personId, actorRoleCode: actor.roleCode, content } }); await finishAction(tx, request.id, actor, "正式值已变化，申请失效"); await audit(tx, actor, project, request.id, "PROJECT_BASIC_INFORMATION_CHANGE_STALE", [], "项目基础信息变更因正式值变化而失效"); }
async function audit(tx: Tx, actor: CollaborationActor, project: ProjectIdentity, requestId: string, actionCode: string, changedFields: string[], summary: string) { await tx.auditLog.create({ data: { actorPersonId: actor.personId, actorRoleCode: actor.roleCode, sessionId: actor.sessionId, actionCode, result: "SUCCESS", projectId: project.id, entityType: "PROJECT_FIELD_CHANGE_REQUEST", entityId: requestId, entityBusinessCode: project.projectCode, summary, changedFields, correlationId: randomUUID() } }); }
function mapConflict(error: unknown): never { if (error instanceof CollaborationError) throw error; if (error && typeof error === "object" && "code" in error && ((error as { code?: string }).code === "P2002" || (error as { code?: string }).code === "P2034")) throw new CollaborationError("PROJECT_BASIC_INFORMATION_CONFLICT"); throw error; }
function isUniqueConflict(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002"); }
function forbidden(): never { throw new CollaborationError("PROJECT_BASIC_INFORMATION_FORBIDDEN"); }
