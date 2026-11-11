"use server";

import { CollaborationError } from "@researchflow/collaboration";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCollaborationActor } from "@/server/collaboration-session";
import { getProjectBasicInformationRuntime } from "@/server/project-basic-information-runtime";

export async function submitProjectBasicInformationChange(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const projectId = text(formData, "projectId");
  try {
    const runtime = getProjectBasicInformationRuntime();
    const workspace = await runtime.getWorkspace(actor, projectId);
    const diseaseAreaOptionId = text(formData, "diseaseAreaOptionId");
    const researchTypeOptionId = text(formData, "researchTypeOptionId");
    const disease = workspace.dictionaryOptions.diseaseAreas.find((item) => item.id === diseaseAreaOptionId);
    const research = workspace.dictionaryOptions.researchTypes.find((item) => item.id === researchTypeOptionId);
    if (!disease || !research) throw new CollaborationError("PROJECT_BASIC_INFORMATION_INVALID_INPUT");
    await runtime.submit(actor, { commandId: text(formData, "commandId"), projectId, projectName: text(formData, "projectName"), projectSummary: text(formData, "projectSummary"), diseaseAreaOptionId, diseaseAreaOptionCode: disease.code, diseaseAreaOtherText: optional(formData, "diseaseAreaOtherText"), researchTypeOptionId, researchTypeOptionCode: research.code, researchTypeOtherText: optional(formData, "researchTypeOtherText"), leadOrganizationName: optional(formData, "leadOrganizationName"), sponsorName: optional(formData, "sponsorName"), fundingRecordAmountCny: optional(formData, "fundingRecordAmountCny"), reason: text(formData, "reason") });
    revalidatePath(`/workspace/projects/${projectId}/execution`);
  } catch (error) { redirect(`${projectPath(projectId)}?basicInfoError=${code(error)}`); }
  redirect(`${projectPath(projectId)}?basicInfoSaved=submitted`);
}

export async function decideProjectBasicInformationChange(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const projectId = text(formData, "projectId");
  try {
    await getProjectBasicInformationRuntime().decide(actor, { projectId, requestId: text(formData, "requestId"), decision: text(formData, "decision") === "RETURN" ? "RETURN" : "APPLY", note: optional(formData, "note") });
    revalidatePath(`/workspace/projects/${projectId}/execution`);
  } catch (error) { redirect(`${projectPath(projectId)}?basicInfoError=${code(error)}`); }
  redirect(`${projectPath(projectId)}?basicInfoSaved=${text(formData, "decision") === "RETURN" ? "returned" : "applied"}`);
}

function text(formData: FormData, key: string) { const value = formData.get(key); if (typeof value !== "string") throw new CollaborationError("PROJECT_BASIC_INFORMATION_INVALID_INPUT"); return value; }
function optional(formData: FormData, key: string) { const value = text(formData, key).trim(); return value || null; }
function code(error: unknown) {
  if (error instanceof CollaborationError) return error.code;
  console.error("PROJECT_BASIC_INFORMATION_OPERATION_FAILED", error instanceof Error ? { name: error.name, message: error.message } : { type: typeof error });
  return "PROJECT_BASIC_INFORMATION_OPERATION_FAILED";
}
function projectPath(projectId: string) { return `/workspace/projects/${encodeURIComponent(projectId)}/execution`; }
