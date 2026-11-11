"use server";

import { CollaborationError, type RevisionValueMode } from "@researchflow/collaboration";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCollaborationActor } from "@/server/collaboration-session";
import { getAttachmentRuntime, getWorkflowProgressRuntime } from "@/server/progress-runtime";

type ActionFailure = { ok: false; error: string };
type ActionSuccess<T> = { ok: true; value: T };
export type ProgressActionResult<T = undefined> = ActionSuccess<T> | ActionFailure;

export async function createProgressAttachmentDraft(input: {
  projectId: string;
  projectWorkflowStageId: string;
}): Promise<ProgressActionResult<{ draftId: string }>> {
  try {
    const actor = await requireCollaborationActor();
    const draft = await getAttachmentRuntime().createProgressDraft(actor, input);
    return { ok: true, value: { draftId: draft.id } };
  } catch (error) {
    return failure(error);
  }
}

export async function prepareProgressAttachmentUpload(input: {
  draftId: string;
  idempotencyKey: string;
  fileName: string;
  declaredMediaType: string;
  sizeBytes: number;
  sha256: string;
  declarationVersion: string;
}): Promise<ProgressActionResult<{
  assetId: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}>> {
  try {
    const actor = await requireCollaborationActor();
    const prepared = await getAttachmentRuntime().prepareUpload(actor, input);
    return { ok: true, value: {
      assetId: prepared.asset.assetId,
      uploadUrl: prepared.authorization.url,
      requiredHeaders: { ...prepared.authorization.requiredHeaders },
      expiresAt: prepared.authorization.expiresAt,
    } };
  } catch (error) {
    return failure(error);
  }
}

export async function completeProgressAttachmentUpload(
  assetId: string,
): Promise<ProgressActionResult> {
  try {
    const actor = await requireCollaborationActor();
    await getAttachmentRuntime().completeUpload(actor, assetId);
    return { ok: true, value: undefined };
  } catch (error) {
    return failure(error);
  }
}

export async function submitWorkflowProgress(input: {
  projectId: string;
  projectWorkflowStageId: string;
  progressSummary: string;
  basis: string;
  expectedCompletionDate: string | null;
  budgetAmountCny: string | null;
  attachmentDraftIds: string[];
}): Promise<ProgressActionResult<{ recordId: string }>> {
  try {
    const actor = await requireCollaborationActor();
    const record = await getWorkflowProgressRuntime().submit(actor, input);
    revalidatePath(`/workspace/projects/${input.projectId}/execution`);
    return { ok: true, value: { recordId: record.id } };
  } catch (error) {
    return failure(error);
  }
}

export async function correctWorkflowProgress(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const projectId = text(formData, "projectId");
  const context = nodeContext(formData, "progress");
  try {
    await getWorkflowProgressRuntime().correct(actor, {
      projectId,
      workflowUpdateId: text(formData, "workflowUpdateId"),
      expectedLatestSequenceNo: Number(text(formData, "expectedLatestSequenceNo")),
      correctionReason: text(formData, "correctionReason"),
      revisedProgressSummary: optionalText(formData, "revisedProgressSummary"),
      revisedBasis: optionalText(formData, "revisedBasis"),
      revisedExpectedDateMode: revisionMode(formData, "revisedExpectedDateMode"),
      revisedExpectedDate: optionalText(formData, "revisedExpectedDate"),
      budgetAmountMode: revisionMode(formData, "budgetAmountMode"),
      revisedBudgetAmountCny: optionalText(formData, "revisedBudgetAmountCny"),
    });
    revalidatePath(`/workspace/projects/${projectId}/execution`);
  } catch (error) {
    redirect(`/workspace/projects/${projectId}/execution?${context}progressError=${errorCode(error)}`);
  }
  redirect(`/workspace/projects/${projectId}/execution?${context}progressSaved=correction`);
}

function failure(error: unknown): ActionFailure {
  return { ok: false, error: errorCode(error) };
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "PROGRESS_OPERATION_FAILED";
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) throw new CollaborationError("INVALID_CORRECTION");
  return value.trim();
}

function optionalText(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function revisionMode(formData: FormData, key: string): RevisionValueMode {
  const value = text(formData, key);
  if (value !== "KEEP" && value !== "SET" && value !== "CLEAR") {
    throw new CollaborationError("INVALID_CORRECTION");
  }
  return value;
}

function nodeContext(formData: FormData, tab: string): string {
  const value = formData.get("returnNode");
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? `node=${encodeURIComponent(value)}&tab=${tab}&` : "";
}
