"use server";

import {
  MANAGED_DICTIONARY_CODES,
  type ManagedDictionaryCode,
} from "@researchflow/collaboration";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDictionaryRuntime } from "@/server/progress-runtime";
import { requireCollaborationActor } from "@/server/collaboration-session";

const path = "/workspace/pmo/dictionaries";

export async function saveDictionaryOptions(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const code = dictionaryCode(formData);
  try {
    const ids = formData.getAll("changeId").map(String);
    await getDictionaryRuntime().saveOptions(actor, code, ids.map((id) => ({
      id,
      displayName: text(formData, `displayName:${id}`),
      sortOrder: integer(formData, `sortOrder:${id}`),
      enabled: formData.get(`enabled:${id}`) === "1",
      expectedUpdatedAt: text(formData, `expectedUpdatedAt:${id}`),
    })));
    revalidatePath(path);
  } catch (error) {
    redirect(`${path}?dictionary=${code}&error=${errorCode(error)}`);
  }
  redirect(`${path}?dictionary=${code}&saved=1`);
}

export async function createDictionaryOption(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const code = dictionaryCode(formData);
  try {
    await getDictionaryRuntime().createOption(actor, code, text(formData, "displayName"));
    revalidatePath(path);
  } catch (error) {
    redirect(`${path}?dictionary=${code}&error=${errorCode(error)}`);
  }
  redirect(`${path}?dictionary=${code}&saved=created`);
}

export async function deleteDictionaryOption(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const code = dictionaryCode(formData);
  try {
    const optionId = text(formData, "optionId");
    await getDictionaryRuntime().deleteOption(
      actor,
      code,
      optionId,
      text(formData, "expectedUpdatedAt"),
    );
    revalidatePath(path);
  } catch (error) {
    redirect(`${path}?dictionary=${code}&error=${errorCode(error)}`);
  }
  redirect(`${path}?dictionary=${code}&saved=deleted`);
}

export async function reviewDictionarySuggestion(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const code = dictionaryCode(formData);
  const action = text(formData, "decision");
  try {
    await getDictionaryRuntime().reviewSuggestion(
      actor,
      code,
      text(formData, "suggestionId"),
      integer(formData, "expectedRowVersion"),
      action === "PROMOTE"
        ? { action, displayName: text(formData, "displayName") }
        : action === "MERGE"
          ? { action, targetOptionId: text(formData, "targetOptionId") }
          : { action: "REJECT", comment: text(formData, "comment") },
    );
    revalidatePath(path);
  } catch (error) {
    redirect(`${path}?dictionary=${code}&error=${errorCode(error)}`);
  }
  redirect(`${path}?dictionary=${code}&saved=reviewed`);
}

function dictionaryCode(formData: FormData): ManagedDictionaryCode {
  const value = text(formData, "dictionaryCode");
  if (!(MANAGED_DICTIONARY_CODES as readonly string[]).includes(value)) throw new Error("DICTIONARY_INVALID_INPUT");
  return value as ManagedDictionaryCode;
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").normalize("NFKC").trim();
}

function integer(formData: FormData, key: string): number {
  const value = Number(text(formData, key));
  if (!Number.isInteger(value)) throw new Error("DICTIONARY_INVALID_INPUT");
  return value;
}

function errorCode(error: unknown): string {
  return encodeURIComponent(error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : error instanceof Error ? error.message : "DICTIONARY_INVALID_INPUT");
}
