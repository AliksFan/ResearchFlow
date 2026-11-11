"use server";

import {
  ProjectApplicationError,
  projectApplicationErrorCodeSchema,
  type ApplicationFormInput,
  type ApplicationSwimlaneInput,
  type ProjectApplicationErrorCode,
} from "@researchflow/project-application";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getProjectApplicationRuntime } from "@/server/project-application-runtime";
import { requireProjectApplicationActor } from "@/server/project-application-session";

export async function createApplication(formData: FormData) {
  const actor = await requireProjectApplicationActor("KEY_SUB_I");
  try {
    await getProjectApplicationRuntime().commands.createDraft({
      actor,
      commandId: text(formData, "commandId"),
      projectName: text(formData, "projectName"),
    });
  } catch (error) {
    redirect(`/workspace/applications/new?error=${errorCode(error)}`);
  }
  revalidatePath("/workspace/projects");
  redirect("/workspace/projects#applications");
}

export async function saveApplication(formData: FormData) {
  const actor = await requireProjectApplicationActor("KEY_SUB_I");
  const input = applicationIdentity(formData, actor, "saveCommandId");
  try {
    await getProjectApplicationRuntime().commands.saveDraft({
      ...input,
      form: parseApplicationForm(formData, actor.personId),
    });
    revalidatePath(`/workspace/applications/${input.projectId}`);
  } catch (error) {
    redirect(
      `/workspace/applications/${input.projectId}?error=${errorCode(error)}`,
    );
  }
  revalidatePath("/workspace/projects");
  redirect("/workspace/projects#applications");
}

export async function submitApplication(formData: FormData) {
  const actor = await requireProjectApplicationActor("KEY_SUB_I");
  const saveInput = applicationIdentity(formData, actor, "submitSaveCommandId");
  try {
    const runtime = getProjectApplicationRuntime();
    const form = parseApplicationForm(formData, actor.personId);
    const saved = await runtime.commands.saveDraft({
      ...saveInput,
      form,
    });
    const options = await runtime.gateway.getFormOptions(actor);
    const validationForm = {
      ...form,
      directionOptionCode: options.directions.find(({ id }) => id === form.directionOptionId)?.optionCode ?? null,
      researchTypeOptionCode: options.researchTypes.find(({ id }) => id === form.researchTypeOptionId)?.optionCode ?? null,
    };
    await runtime.commands.submitApplication({
      actor,
      commandId: text(formData, "submitCommandId"),
      projectId: saved.projectId,
      applicationVersionId: saved.applicationVersionId,
      expectedRowVersion: saved.rowVersion,
      formForValidation: validationForm,
      applicantPersonId: actor.personId,
    });
    revalidatePath(`/workspace/applications/${saveInput.projectId}`);
  } catch (error) {
    redirect(
      `/workspace/applications/${saveInput.projectId}?error=${errorCode(error)}`,
    );
  }
  revalidatePath("/workspace/projects");
  redirect("/workspace/projects#applications");
}

export async function withdrawApplication(formData: FormData) {
  const actor = await requireProjectApplicationActor("KEY_SUB_I");
  const input = applicationIdentity(formData, actor);
  try {
    await getProjectApplicationRuntime().commands.withdrawApplication({
      ...input,
      reviewId: nullableText(formData, "reviewId"),
      reason: nullableText(formData, "comment"),
    });
    revalidatePath(`/workspace/applications/${input.projectId}`);
  } catch (error) {
    redirect(
      `/workspace/applications/${input.projectId}?error=${errorCode(error)}`,
    );
  }
  revalidatePath("/workspace/projects");
  redirect("/workspace/projects#applications");
}

export async function returnApplication(formData: FormData) {
  return reviewAction(formData, "return");
}

export async function holdApplication(formData: FormData) {
  return reviewAction(formData, "hold");
}

export async function resumeApplication(formData: FormData) {
  return reviewAction(formData, "resume");
}

export async function rejectApplication(formData: FormData) {
  return reviewAction(formData, "reject");
}

export async function approveApplication(formData: FormData) {
  return reviewAction(formData, "approve");
}

async function reviewAction(
  formData: FormData,
  action: "return" | "hold" | "resume" | "reject" | "approve",
) {
  const actor = await requireProjectApplicationActor("PMO");
  const input = {
    ...applicationIdentity(formData, actor),
    reviewId: text(formData, "reviewId"),
    comment: nullableText(formData, "comment"),
  };
  const runtime = getProjectApplicationRuntime();
  const returnTo = safePmoDashboardReturnTo(nullableText(formData, "returnTo"));
  try {
    if (action === "return") await runtime.commands.returnForRevision(input);
    if (action === "hold") await runtime.commands.putOnHold(input);
    if (action === "resume") await runtime.commands.resumeReview(input);
    if (action === "reject") {
      if (formData.get("confirmIrreversible") !== "yes") {
        throw new ProjectApplicationError(
          "PROJECT_APPLICATION_VALIDATION_FAILED",
        );
      }
      await runtime.commands.rejectApplication(input);
    }
    if (action === "approve") await runtime.commands.approveAndEstablish(input);
    revalidatePath(`/workspace/pmo/project-applications/${input.projectId}`);
    revalidatePath("/workspace/projects");
  } catch (error) {
    const params = new URLSearchParams({ error: errorCode(error), returnTo });
    redirect(`/workspace/pmo/project-applications/${input.projectId}?${params}`);
  }
  const params = new URLSearchParams({ completed: action, returnTo });
  redirect(`/workspace/pmo/project-applications/${input.projectId}?${params}`);
}

function safePmoDashboardReturnTo(value: string | null): string {
  return value === "/workspace/projects" || value?.startsWith("/workspace/projects?")
    ? value
    : "/workspace/projects?focus=applications&applicationView=in_review&sort=action&order=desc";
}

function applicationIdentity(
  formData: FormData,
  actor: Awaited<ReturnType<typeof requireProjectApplicationActor>>,
  commandIdKey = "commandId",
) {
  return {
    actor,
    commandId: text(formData, commandIdKey),
    projectId: text(formData, "projectId"),
    applicationVersionId: text(formData, "applicationVersionId"),
    expectedRowVersion: integer(formData, "expectedRowVersion"),
  };
}

function parseApplicationForm(
  formData: FormData,
  applicantPersonId: string,
): ApplicationFormInput {
  const primaryOwnerPersonId = text(formData, "primaryOwnerPersonId");
  const ownerIds = Array.from(new Set([
    applicantPersonId,
    ...formData.getAll("proposedOwnerPersonId").map(String),
    primaryOwnerPersonId,
  ].filter(Boolean)));
  return {
    projectName: text(formData, "projectName"),
    projectSummary: nullableText(formData, "projectSummary"),
    directionOptionId: nullableText(formData, "directionOptionId"),
    directionOtherText: nullableText(formData, "directionOtherText"),
    researchTypeOptionId: nullableText(formData, "researchTypeOptionId"),
    researchTypeOtherText: nullableText(formData, "researchTypeOtherText"),
    leadOrganizationName: nullableText(formData, "leadOrganizationName"),
    sponsorName: nullableText(formData, "sponsorName"),
    fundingRecordAmountCny: nullableText(formData, "fundingRecordAmountCny"),
    owners: ownerIds.map((personId, index) => ({
      personId,
      isPrimary: personId === primaryOwnerPersonId,
      sortOrder: index + 1,
    })),
  };
}

export async function saveApplicationSwimlane(raw: {
  commandId: string;
  projectId: string;
  applicationVersionId: string;
  expectedRowVersion: number;
  swimlane: ApplicationSwimlaneInput;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const actor = await requireProjectApplicationActor("KEY_SUB_I");
  try {
    await getProjectApplicationRuntime().commands.saveSwimlane({ ...raw, actor });
    revalidatePath(`/workspace/applications/${raw.projectId}`);
    revalidatePath("/workspace/projects");
    return { ok: true };
  } catch (error) {
    return { ok: false, code: errorCode(error) };
  }
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function nullableText(formData: FormData, key: string) {
  return text(formData, key) || null;
}

function integer(formData: FormData, key: string) {
  const value = Number(text(formData, key));
  if (!Number.isInteger(value))
    throw new ProjectApplicationError("PROJECT_APPLICATION_VALIDATION_FAILED");
  return value;
}

function errorCode(error: unknown) {
  const domainCode = readProjectApplicationErrorCode(error);
  if (!domainCode) {
    console.error("PROJECT_APPLICATION_ACTION_UNEXPECTED", unexpectedErrorSummary(error));
  }
  return encodeURIComponent(
    domainCode ?? "PROJECT_APPLICATION_INTERNAL_ERROR",
  );
}

function readProjectApplicationErrorCode(
  error: unknown,
): ProjectApplicationErrorCode | null {
  const candidate = error instanceof ProjectApplicationError
    ? error.code
    : typeof error === "object" && error !== null && "code" in error
      ? error.code
      : null;
  const parsed = projectApplicationErrorCodeSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function unexpectedErrorSummary(error: unknown) {
  if (!(error instanceof Error)) {
    return { name: "NonError", code: null, message: String(error) };
  }
  const coded = error as Error & { code?: unknown };
  return {
    name: error.name,
    code: typeof coded.code === "string" ? coded.code : null,
    message: error.message,
  };
}
