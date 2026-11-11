"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCollaborationActor } from "@/server/collaboration-session";
import { getProjectClosureRuntime } from "@/server/progress-runtime";
import { getAttachmentRuntime } from "@/server/progress-runtime";

type AttachmentActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
export async function createProjectClosureAttachmentDraft(input: { projectId: string; completionRequestId: string | null }): Promise<AttachmentActionResult<{ draftId: string }>> { try { const actor = await requireCollaborationActor(); const draft = await getAttachmentRuntime().createProjectClosureDraft(actor, input); return { ok: true, value: { draftId: draft.id } }; } catch (error) { return { ok: false, error: errorCode(error) }; } }

export async function submitProjectClosure(formData: FormData): Promise<void> { const actor = await requireCollaborationActor(); const projectId = text(formData, "projectId"); await perform(projectId, "submitted", () => getProjectClosureRuntime().submit(actor, { projectId, expectedProjectRowVersion: integer(formData, "expectedProjectRowVersion"), ...materials(formData), attachmentDraftIds: draftIds(formData), commandId: text(formData, "commandId") })); }
export async function returnProjectClosure(formData: FormData): Promise<void> { await mutate(formData, "returned", (actor, input) => getProjectClosureRuntime().returnForSupplement(actor, { ...input, reason: text(formData, "reason") })); }
export async function resubmitProjectClosure(formData: FormData): Promise<void> { await mutate(formData, "resubmitted", (actor, input) => getProjectClosureRuntime().resubmit(actor, { ...input, ...materials(formData), attachmentDraftIds: draftIds(formData) })); }
export async function withdrawProjectClosure(formData: FormData): Promise<void> { await mutate(formData, "withdrawn", (actor, input) => getProjectClosureRuntime().withdraw(actor, { ...input, reason: text(formData, "reason") })); }
export async function approveProjectClosure(formData: FormData): Promise<void> { await mutate(formData, "approved", (actor, input) => getProjectClosureRuntime().approve(actor, { ...input, comment: optionalText(formData, "comment") })); }
export async function archiveProject(formData: FormData): Promise<void> { await archiveMutation(formData, "archived", (actor, input) => getProjectClosureRuntime().archive(actor, input)); }
export async function restoreArchivedProject(formData: FormData): Promise<void> { await archiveMutation(formData, "restored", (actor, input) => getProjectClosureRuntime().restoreArchive(actor, input)); }

function materials(formData: FormData) { return { completionSummary: text(formData, "completionSummary"), unfinishedOptionalAndLegacyStatement: text(formData, "unfinishedOptionalAndLegacyStatement"), noUnfinishedItemConfirmed: formData.get("noUnfinishedItemConfirmed") === "1", archiveComplianceSelfCheck: text(formData, "archiveComplianceSelfCheck"), exceptionStatement: optionalText(formData, "exceptionStatement"), truthConfirmed: formData.get("truthConfirmed") === "1" }; }
async function mutate(formData: FormData, saved: string, operation: (actor: Awaited<ReturnType<typeof requireCollaborationActor>>, input: { projectId: string; completionRequestId: string; expectedRowVersion: number; commandId: string }) => Promise<unknown>) { const actor = await requireCollaborationActor(); const input = { projectId: text(formData, "projectId"), completionRequestId: text(formData, "completionRequestId"), expectedRowVersion: integer(formData, "expectedRowVersion"), commandId: text(formData, "commandId") }; await perform(input.projectId, saved, () => operation(actor, input)); }
async function archiveMutation(formData: FormData, saved: string, operation: (actor: Awaited<ReturnType<typeof requireCollaborationActor>>, input: { projectId: string; expectedProjectRowVersion: number; reason: string; commandId: string }) => Promise<unknown>) { const actor = await requireCollaborationActor(); const input = { projectId: text(formData, "projectId"), expectedProjectRowVersion: integer(formData, "expectedProjectRowVersion"), reason: text(formData, "reason"), commandId: text(formData, "commandId") }; await perform(input.projectId, saved, () => operation(actor, input)); }
async function perform(projectId: string, saved: string, operation: () => Promise<unknown>): Promise<never> { try { await operation(); revalidatePath(`/workspace/projects/${projectId}/execution`); } catch (error) { redirect(`/workspace/projects/${projectId}/execution?panel=closure&closureError=${errorCode(error)}`); } redirect(`/workspace/projects/${projectId}/execution?panel=closure&closureSaved=${saved}`); }
function text(formData: FormData, key: string) { const value = formData.get(key); if (typeof value !== "string" || !value.trim()) throw new Error("PROJECT_CLOSURE_INVALID_INPUT"); return value.trim(); }
function optionalText(formData: FormData, key: string) { const value = formData.get(key); return typeof value === "string" && value.trim() ? value.trim() : null; }
function integer(formData: FormData, key: string) { const value = Number(text(formData, key)); if (!Number.isInteger(value) || value < 0) throw new Error("PROJECT_CLOSURE_INVALID_INPUT"); return value; }
function draftIds(formData: FormData) { return formData.getAll("attachmentDraftIds").filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()); }
function errorCode(error: unknown) { return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : error instanceof Error ? error.message : "PROJECT_CLOSURE_FAILED"; }
