"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCollaborationActor } from "@/server/collaboration-session";
import { getAttachmentRuntime, getIssueRuntime } from "@/server/progress-runtime";

type IssueActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export async function createIssueAttachmentDraft(input: {
  projectId: string;
  projectWorkflowStageId: string | null;
  issueId: string | null;
  parentType: "ISSUE" | "ISSUE_ACTIVITY" | "ISSUE_DEAN_DECISION" | "ISSUE_IMPLEMENTATION_SUBMISSION";
  visibilityScope: "PMO_ONLY" | "PMO_AND_DEAN" | "ISSUE_PARTICIPANTS";
}): Promise<IssueActionResult<{ draftId: string }>> {
  try {
    const actor = await requireCollaborationActor();
    const draft = await getAttachmentRuntime().createIssueDraft(actor, input);
    return { ok: true, value: { draftId: draft.id } };
  } catch (error) { return { ok: false, error: errorCode(error) }; }
}

export async function prepareIssueAttachmentUpload(input: { draftId: string; idempotencyKey: string; fileName: string; declaredMediaType: string; sizeBytes: number; sha256: string; declarationVersion: string }): Promise<IssueActionResult<{ assetId: string; uploadUrl: string; requiredHeaders: Record<string, string> }>> {
  try {
    const actor = await requireCollaborationActor();
    const prepared = await getAttachmentRuntime().prepareUpload(actor, input);
    return { ok: true, value: { assetId: prepared.asset.assetId, uploadUrl: prepared.authorization.url, requiredHeaders: { ...prepared.authorization.requiredHeaders } } };
  } catch (error) { return { ok: false, error: errorCode(error) }; }
}

export async function completeIssueAttachmentUpload(assetId: string): Promise<IssueActionResult> {
  try {
    const actor = await requireCollaborationActor();
    await getAttachmentRuntime().completeUpload(actor, assetId);
    return { ok: true, value: undefined };
  } catch (error) { return { ok: false, error: errorCode(error) }; }
}

export async function createIssue(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const projectId = text(formData, "projectId");
  await perform(formData, projectId, "created", () => getIssueRuntime().create(actor, {
    projectId,
    projectWorkflowStageId: text(formData, "projectWorkflowStageId"),
    issueTypeOptionId: text(formData, "issueTypeOptionId"),
    issueTypeOtherText: optionalText(formData, "issueTypeOtherText"),
    title: text(formData, "title"),
    description: text(formData, "description"),
    expectedSupport: optionalText(formData, "expectedSupport"),
    currentRiskLevel: text(formData, "currentRiskLevel") === "BLOCKED" ? "BLOCKED" : "RISK",
    sharedSummary: optionalText(formData, "sharedSummary"),
    attachmentDraftIds: draftIds(formData),
    commandId: text(formData, "commandId"),
  }));
}

export async function createIssueExternalContact(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const projectId = text(formData, "projectId");
  await perform(formData, projectId, "contact-created", () => getIssueRuntime().createExternalContact(actor, { projectId, name: text(formData, "name"), email: text(formData, "email"), category: text(formData, "category") }));
}

export async function recordIssueManualEmail(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const projectId = text(formData, "projectId");
  await perform(formData, projectId, "email-attempt-recorded", () => getIssueRuntime().recordManualEmail(actor, { projectId, issueId: text(formData, "issueId"), subject: text(formData, "subject"), body: text(formData, "body"), recipientRefs: formData.getAll("recipientRefs").filter((value): value is string => typeof value === "string"), idempotencyKey: text(formData, "commandId") }));
}

export async function returnIssueForSupplement(formData: FormData): Promise<void> { await mutate(formData, "returned", (actor, input) => getIssueRuntime().returnForSupplement(actor, { ...input, reason: text(formData, "reason") })); }
export async function supplementIssue(formData: FormData): Promise<void> { await mutate(formData, "supplemented", (actor, input) => getIssueRuntime().supplement(actor, { ...input, latestProgress: optionalText(formData, "latestProgress"), supplementalDetail: text(formData, "supplementalDetail"), expectedSupport: optionalText(formData, "expectedSupport"), attachmentDraftIds: draftIds(formData) })); }
export async function appendIssueCoordination(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const projectId = text(formData, "projectId");
  await perform(formData, projectId, "coordination-appended", () => getIssueRuntime().appendCoordination(actor, {
    projectId,
    issueId: text(formData, "issueId"),
    detail: text(formData, "detail"),
    visibilityScope: visibility(formData),
    expectedRowVersion: integer(formData, "expectedRowVersion"),
    attachmentDraftIds: draftIds(formData),
    commandId: text(formData, "commandId"),
  }));
}
export async function submitIssueResolution(formData: FormData): Promise<void> { await mutate(formData, "resolution-submitted", (actor, input) => getIssueRuntime().submitResolution(actor, { ...input, result: text(formData, "result"), attachmentDraftIds: draftIds(formData) })); }
export async function closeIssueInvalid(formData: FormData): Promise<void> { await mutate(formData, "closed-invalid", (actor, input) => getIssueRuntime().closeInvalid(actor, { ...input, reasonCode: invalidReason(formData), conclusionSummary: text(formData, "conclusionSummary"), duplicateIssueId: optionalText(formData, "duplicateIssueId") })); }
export async function escalateIssueToDean(formData: FormData): Promise<void> { await mutate(formData, "escalated", (actor, input) => getIssueRuntime().escalateToDean(actor, { ...input, pmoAssessment: optionalText(formData, "pmoAssessment"), recommendation: optionalText(formData, "recommendation"), decisionQuestion: text(formData, "decisionQuestion"), suggestedDeadline: optionalText(formData, "suggestedDeadline"), attachmentDraftIds: draftIds(formData) })); }
export async function recordIssueDeanDecision(formData: FormData): Promise<void> { await mutate(formData, "decided", (actor, input) => getIssueRuntime().recordDeanDecision(actor, { ...input, decisionCode: decisionCode(formData), decisionContent: optionalText(formData, "decisionContent"), pmoImplementationInstruction: optionalText(formData, "pmoImplementationInstruction"), implementationReviewRequired: explicitBoolean(formData, "implementationReviewRequired"), attachmentDraftIds: draftIds(formData) })); }
export async function requestIssueDecisionSupplement(formData: FormData): Promise<void> { await mutate(formData, "decision-supplement-requested", (actor, input) => getIssueRuntime().requestDecisionSupplement(actor, { ...input, reason: text(formData, "reason") })); }
export async function resubmitIssueDecisionMaterials(formData: FormData): Promise<void> { await mutate(formData, "decision-materials-resubmitted", (actor, input) => getIssueRuntime().resubmitDecisionMaterials(actor, { ...input, content: text(formData, "content") })); }
export async function submitIssueImplementation(formData: FormData): Promise<void> { await mutate(formData, "implementation-submitted", (actor, input) => getIssueRuntime().submitImplementation(actor, { ...input, decisionRoundId: text(formData, "decisionRoundId"), resultSummary: text(formData, "resultSummary"), attachmentDraftIds: draftIds(formData) })); }
export async function reviewIssueImplementation(formData: FormData): Promise<void> { await mutate(formData, "implementation-reviewed", (actor, input) => getIssueRuntime().reviewImplementation(actor, { ...input, decision: text(formData, "decision") === "ACCEPTED" ? "ACCEPTED" : "RETURNED", comment: optionalText(formData, "comment") })); }
export async function confirmIssueResolution(formData: FormData): Promise<void> { await mutate(formData, "resolution-confirmed", (actor, input) => getIssueRuntime().confirmResolution(actor, { ...input, resolved: text(formData, "resolved") === "1", confirmation: optionalText(formData, "confirmation") })); }
export async function requestIssueDeanReviewTransfer(formData: FormData): Promise<void> { await mutate(formData, "transfer-requested", (actor, input) => getIssueRuntime().requestDeanReviewTransfer(actor, { ...input, decisionRoundId: text(formData, "decisionRoundId"), reason: text(formData, "reason") })); }
export async function acceptIssueDeanReviewTransfer(formData: FormData): Promise<void> { await mutate(formData, "transfer-accepted", (actor, input) => getIssueRuntime().acceptDeanReviewTransfer(actor, { ...input, transferId: text(formData, "transferId") })); }

async function mutate(formData: FormData, saved: string, operation: (actor: Awaited<ReturnType<typeof requireCollaborationActor>>, input: ReturnType<typeof mutationInput>) => Promise<unknown>): Promise<never> {
  const actor = await requireCollaborationActor();
  const input = mutationInput(formData);
  return await perform(formData, input.projectId, saved, () => operation(actor, input));
}

function mutationInput(formData: FormData) { return { projectId: text(formData, "projectId"), issueId: text(formData, "issueId"), expectedRowVersion: integer(formData, "expectedRowVersion"), commandId: text(formData, "commandId") }; }
async function perform(formData: FormData, projectId: string, saved: string, operation: () => Promise<unknown>): Promise<never> { const context = nodeContext(formData); try { await operation(); revalidatePath(`/workspace/projects/${projectId}/execution`); } catch (error) { redirect(`/workspace/projects/${projectId}/execution?${context}issueError=${errorCode(error)}`); } redirect(`/workspace/projects/${projectId}/execution?${context}issueSaved=${saved}`); }
function nodeContext(formData: FormData): string { const value = formData.get("returnNode"); return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? `node=${encodeURIComponent(value)}&tab=issues&` : ""; }
function text(formData: FormData, key: string): string { const value = formData.get(key); if (typeof value !== "string" || !value.trim()) throw new Error("ISSUE_INVALID_INPUT"); return value.trim(); }
function optionalText(formData: FormData, key: string): string | null { const value = formData.get(key); return typeof value === "string" && value.trim() ? value.trim() : null; }
function integer(formData: FormData, key: string): number { const value = Number(text(formData, key)); if (!Number.isInteger(value) || value < 0) throw new Error("ISSUE_INVALID_INPUT"); return value; }
function explicitBoolean(formData: FormData, key: string): boolean { const value = text(formData, key); if (value !== "1" && value !== "0") throw new Error("ISSUE_INVALID_INPUT"); return value === "1"; }
function visibility(formData: FormData) { const value = text(formData, "visibilityScope"); if (value !== "PMO_ONLY" && value !== "PMO_AND_DEAN" && value !== "ISSUE_PARTICIPANTS") throw new Error("ISSUE_INVALID_INPUT"); return value; }
function decisionCode(formData: FormData) { const value = text(formData, "decisionCode"); if (value !== "AGREE_WITH_PMO_RECOMMENDATION" && value !== "COORDINATE_RESOURCES" && value !== "OTHER") throw new Error("ISSUE_INVALID_INPUT"); return value; }
function invalidReason(formData: FormData) { const value = text(formData, "reasonCode"); if (!["DUPLICATE", "INVALID", "INCORRECT", "OUT_OF_SCOPE", "CREATED_BY_MISTAKE"].includes(value)) throw new Error("ISSUE_INVALID_INPUT"); return value as "DUPLICATE" | "INVALID" | "INCORRECT" | "OUT_OF_SCOPE" | "CREATED_BY_MISTAKE"; }
function draftIds(formData: FormData): string[] { return formData.getAll("attachmentDraftIds").filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()); }
function errorCode(error: unknown): string { return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : error instanceof Error ? error.message : "ISSUE_FAILED"; }
