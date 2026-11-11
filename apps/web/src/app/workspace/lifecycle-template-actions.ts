"use server";

import type { AttachmentRequirement, LifecycleTemplateOwnerRole, PlanItemApplicability } from "@researchflow/collaboration";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCollaborationActor } from "@/server/collaboration-session";
import { getLifecycleTemplateRuntime } from "@/server/progress-runtime";

const path = "/workspace/pmo/lifecycle-templates";

export async function createLifecycleTemplateSolution(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  let templateVersionId: string;
  try {
    templateVersionId = await getLifecycleTemplateRuntime().createSolution(actor, text(formData, "templateName"));
    revalidatePath(path);
  } catch (error) {
    redirect(`${path}?templateError=${errorCode(error)}`);
  }
  redirect(successUrl("created", templateVersionId));
}

export async function createLifecycleTemplateDraft(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  let templateVersionId: string;
  try {
    templateVersionId = await getLifecycleTemplateRuntime().createDraftFromPublished(actor, text(formData, "sourceTemplateVersionId"));
    revalidatePath(path);
  } catch (error) {
    redirect(`${path}?templateError=${errorCode(error)}`);
  }
  redirect(successUrl("created", templateVersionId));
}

export async function saveLifecycleTemplateDraft(formData: FormData): Promise<void> {
  await mutate(formData, false);
}

export async function publishLifecycleTemplateDraft(formData: FormData): Promise<void> {
  await mutate(formData, true);
}

export async function deleteLifecycleTemplateVersion(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  try {
    await getLifecycleTemplateRuntime().deleteVersion(
      actor,
      text(formData, "templateVersionId"),
      text(formData, "expectedFingerprint"),
    );
    revalidatePath(path);
  } catch (error) {
    redirect(`${path}?templateError=${errorCode(error)}`);
  }
  redirect(`${path}?templateSaved=deleted`);
}

async function mutate(formData: FormData, publish: boolean): Promise<never> {
  const actor = await requireCollaborationActor();
  let templateVersionId = "";
  try {
    const input = parseDraft(formData);
    templateVersionId = input.templateVersionId;
    if (publish) await getLifecycleTemplateRuntime().publishDraft(actor, input);
    else await getLifecycleTemplateRuntime().saveDraft(actor, input);
    revalidatePath(path);
  } catch (error) {
    redirect(`${path}?templateError=${errorCode(error)}`);
  }
  redirect(successUrl(publish ? "published" : "saved", templateVersionId));
}

function successUrl(result: "created" | "saved" | "published", templateVersionId: string): string {
  return `${path}?templateSaved=${result}&selectedTemplateVersionId=${encodeURIComponent(templateVersionId)}`;
}

function parseDraft(formData: FormData) {
  const stageIds = strings(formData, "stageId");
  const workflowIds = strings(formData, "workflowId");
  const nodeIds = formData.getAll("nodeId").filter((value): value is string => typeof value === "string");
  return {
    templateVersionId: text(formData, "templateVersionId"),
    templateName: text(formData, "templateName"),
    expectedFingerprint: text(formData, "expectedFingerprint"),
    stages: stageIds.map((id) => ({
      id,
      code: text(formData, `stageCode:${id}`),
      name: text(formData, `stageName:${id}`),
      sortOrder: integer(formData, `stageOrder:${id}`),
      applicability: applicability(text(formData, `stageApplicability:${id}`)),
    })),
    workflows: workflowIds.map((id) => ({
      id,
      code: text(formData, `workflowCode:${id}`),
      name: text(formData, `workflowName:${id}`),
      description: text(formData, `workflowDescription:${id}`),
      requiredByDefault: text(formData, `workflowRequired:${id}`) === "1",
      enabled: text(formData, `workflowEnabled:${id}`) === "1",
    })),
    nodes: nodeIds.map((id) => ({
      id,
      workflowId: text(formData, `nodeWorkflow:${id}`),
      stageId: text(formData, `nodeStage:${id}`),
      task: text(formData, `nodeTask:${id}`),
      ownerRole: ownerRole(text(formData, `nodeOwner:${id}`)),
      sortOrder: integer(formData, `nodeOrder:${id}`),
      applicability: applicability(text(formData, `applicability:${id}`)),
      attachmentRequirement: attachmentRequirement(text(formData, `attachment:${id}`)),
      predecessorIds: formData.getAll(`predecessor:${id}`).filter((value): value is string => typeof value === "string"),
    })),
  };
}

function strings(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((value): value is string => typeof value === "string" && value.trim() !== "");
}

function integer(formData: FormData, key: string): number {
  const value = Number(text(formData, key));
  if (!Number.isInteger(value)) throw new Error("LIFECYCLE_TEMPLATE_INVALID_INPUT");
  return value;
}

function ownerRole(value: string): LifecycleTemplateOwnerRole {
  if (!["PMO", "DEAN", "KEY_SUB_I", "CRC", "STATISTICIAN", "COLLABORATION_LEAD"].includes(value)) {
    throw new Error("LIFECYCLE_TEMPLATE_INVALID_INPUT");
  }
  return value as LifecycleTemplateOwnerRole;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error("WORKFLOW_COMPLETION_INVALID_INPUT");
  return value.trim();
}

function applicability(value: string): PlanItemApplicability {
  if (value !== "REQUIRED" && value !== "OPTIONAL" && value !== "NOT_APPLICABLE") throw new Error("WORKFLOW_COMPLETION_INVALID_INPUT");
  return value;
}

function attachmentRequirement(value: string): AttachmentRequirement {
  if (value !== "NONE" && value !== "OPTIONAL" && value !== "REQUIRED") throw new Error("WORKFLOW_COMPLETION_INVALID_INPUT");
  return value;
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : error instanceof Error ? error.message : "WORKFLOW_COMPLETION_FAILED";
}
