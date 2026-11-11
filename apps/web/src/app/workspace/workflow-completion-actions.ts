"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCollaborationActor } from "@/server/collaboration-session";
import { getAttachmentRuntime, getWorkflowCompletionRuntime } from "@/server/progress-runtime";

type CompletionActionFailure = { ok: false; error: string };
type CompletionActionSuccess<T> = { ok: true; value: T };
export type CompletionActionResult<T = undefined> = CompletionActionSuccess<T> | CompletionActionFailure;

export async function createWorkflowCompletionAttachmentDraft(input: {
  projectId: string;
  projectWorkflowStageId: string;
  parentType: "WORKFLOW_COMPLETION_SUBMISSION" | "WORKFLOW_COMPLETION_SUPPLEMENT";
}): Promise<CompletionActionResult<{ draftId: string }>> {
  try {
    const actor = await requireCollaborationActor();
    const draft = await getAttachmentRuntime().createWorkflowCompletionDraft(actor, input);
    return { ok: true, value: { draftId: draft.id } };
  } catch (error) {
    return failure(error);
  }
}

export async function prepareWorkflowCompletionAttachmentUpload(input: {
  draftId: string;
  idempotencyKey: string;
  fileName: string;
  declaredMediaType: string;
  sizeBytes: number;
  sha256: string;
  declarationVersion: string;
}): Promise<CompletionActionResult<{
  assetId: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
}>> {
  try {
    const actor = await requireCollaborationActor();
    const prepared = await getAttachmentRuntime().prepareUpload(actor, input);
    return { ok: true, value: {
      assetId: prepared.asset.assetId,
      uploadUrl: prepared.authorization.url,
      requiredHeaders: { ...prepared.authorization.requiredHeaders },
    } };
  } catch (error) {
    return failure(error);
  }
}

export async function completeWorkflowCompletionAttachmentUpload(assetId: string): Promise<CompletionActionResult> {
  try {
    const actor = await requireCollaborationActor();
    await getAttachmentRuntime().completeUpload(actor, assetId);
    return { ok: true, value: undefined };
  } catch (error) {
    return failure(error);
  }
}

export async function submitWorkflowCompletionCommand(input: {
  projectId: string;
  projectWorkflowStageId: string;
  expectedNodeRowVersion: number;
  progressSummary: string;
  basis: string;
  expectedCompletionDate: string | null;
  attachmentDraftIds: string[];
}): Promise<CompletionActionResult<{ requestId: string }>> {
  try {
    const actor = await requireCollaborationActor();
    const request = await getWorkflowCompletionRuntime().submit(actor, input);
    revalidatePath(`/workspace/projects/${input.projectId}/execution`);
    return { ok: true, value: { requestId: request.id } };
  } catch (error) {
    return failure(error);
  }
}

export async function supplementWorkflowCompletionCommand(input: {
  projectId: string;
  projectWorkflowStageId: string;
  completionRequestId: string;
  expectedRowVersion: number;
  content: string;
  attachmentDraftIds: string[];
}): Promise<CompletionActionResult> {
  try {
    const actor = await requireCollaborationActor();
    await getWorkflowCompletionRuntime().supplement(actor, input);
    revalidatePath(`/workspace/projects/${input.projectId}/execution`);
    return { ok: true, value: undefined };
  } catch (error) {
    return failure(error);
  }
}

export async function resubmitWorkflowCompletionCommand(input: {
  projectId: string;
  projectWorkflowStageId: string;
  completionRequestId: string;
  expectedRowVersion: number;
  progressSummary: string;
  basis: string;
  expectedCompletionDate: string | null;
  attachmentDraftIds: string[];
}): Promise<CompletionActionResult> {
  try {
    const actor = await requireCollaborationActor();
    await getWorkflowCompletionRuntime().resubmit(actor, input);
    revalidatePath(`/workspace/projects/${input.projectId}/execution`);
    return { ok: true, value: undefined };
  } catch (error) {
    return failure(error);
  }
}

export async function submitWorkflowCompletion(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const projectId = text(formData, "projectId");
  await perform(formData, projectId, "submitted", () => getWorkflowCompletionRuntime().submit(actor, {
    projectId,
    projectWorkflowStageId: text(formData, "projectWorkflowStageId"),
    expectedNodeRowVersion: integer(formData, "expectedNodeRowVersion"),
    progressSummary: text(formData, "progressSummary"),
    basis: text(formData, "basis"),
    expectedCompletionDate: optionalText(formData, "expectedCompletionDate"),
    attachmentDraftIds: [],
  }));
}

export async function supplementWorkflowCompletion(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const projectId = text(formData, "projectId");
  await perform(formData, projectId, "supplemented", () => getWorkflowCompletionRuntime().supplement(actor, {
    ...requestInput(formData, projectId),
    content: text(formData, "content"),
    attachmentDraftIds: [],
  }));
}

export async function withdrawWorkflowCompletion(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const projectId = text(formData, "projectId");
  await perform(formData, projectId, "withdrawn", () => getWorkflowCompletionRuntime().withdraw(actor, {
    ...requestInput(formData, projectId), reason: text(formData, "reason"),
  }));
}

export async function reconfirmWorkflowCompletion(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const projectId = text(formData, "projectId");
  await perform(formData, projectId, "reconfirmed", () => getWorkflowCompletionRuntime().reconfirm(actor, {
    ...requestInput(formData, projectId), confirmation: text(formData, "confirmation"),
  }));
}

export async function resubmitWorkflowCompletion(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const projectId = text(formData, "projectId");
  await perform(formData, projectId, "resubmitted", () => getWorkflowCompletionRuntime().resubmit(actor, {
    ...requestInput(formData, projectId),
    progressSummary: text(formData, "progressSummary"),
    basis: text(formData, "basis"),
    expectedCompletionDate: optionalText(formData, "expectedCompletionDate"),
    attachmentDraftIds: [],
  }));
}

export async function reviewWorkflowCompletion(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const projectId = text(formData, "projectId");
  const decision = text(formData, "decision");
  await perform(formData, projectId, decision === "APPROVE" ? "approved" : "returned", () => getWorkflowCompletionRuntime().review(actor, {
    ...requestInput(formData, projectId),
    decision: decision === "APPROVE" ? "APPROVE" : "RETURN",
    comment: text(formData, "comment"),
  }));
}

export async function revokeFormalWorkflowCompletion(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const projectId = text(formData, "projectId");
  await perform(formData, projectId, "revoked", () => getWorkflowCompletionRuntime().revokeFormalCompletion(actor, {
    ...requestInput(formData, projectId),
    reason: text(formData, "reason"),
  }));
}

function requestInput(formData: FormData, projectId: string) {
  return { projectId, completionRequestId: text(formData, "completionRequestId"), expectedRowVersion: integer(formData, "expectedRowVersion") };
}

async function perform(formData: FormData, projectId: string, saved: string, operation: () => Promise<unknown>): Promise<never> {
  const context = nodeContext(formData);
  try {
    await operation();
    revalidatePath(`/workspace/projects/${projectId}/execution`);
  } catch (error) {
    redirect(`/workspace/projects/${projectId}/execution?${context}completionError=${errorCode(error)}`);
  }
  redirect(`/workspace/projects/${projectId}/execution?${context}completionSaved=${saved}`);
}

function nodeContext(formData: FormData): string { const value = formData.get("returnNode"); return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? `node=${encodeURIComponent(value)}&tab=progress&` : ""; }

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error("WORKFLOW_COMPLETION_INVALID_INPUT");
  return value.trim();
}

function optionalText(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integer(formData: FormData, key: string): number {
  const value = Number(text(formData, key));
  if (!Number.isInteger(value) || value < 0) throw new Error("WORKFLOW_COMPLETION_INVALID_INPUT");
  return value;
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : error instanceof Error ? error.message : "WORKFLOW_COMPLETION_FAILED";
}

function failure(error: unknown): CompletionActionFailure {
  return { ok: false, error: errorCode(error) };
}
