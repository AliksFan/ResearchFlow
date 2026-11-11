"use server";

import {
  COLLABORATION_RESPONSIBILITY_TYPES,
  CollaborationError,
  type CollaborationResponsibilityType,
} from "@researchflow/collaboration";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCollaborationRuntime } from "@/server/collaboration-runtime";
import { requireCollaborationActor } from "@/server/collaboration-session";

export async function configureProjectCollaborationTimeLimit(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  let projectId = "";
  try {
    projectId = requiredText(formData, "projectId");
    const types = formData.getAll("responsibilityType");
    const modes = formData.getAll("mode");
    const days = formData.getAll("timeLimitDays");
    const reminders = formData.getAll("reminderIntervalDays");
    const expected = formData.getAll("expectedProjectSettingUpdatedAt");
    if (![modes, days, reminders, expected].every((values) => values.length === types.length)) {
      throw new CollaborationError("INVALID_TIME_LIMIT");
    }
    const changes = types.map((type, index) => {
      const responsibility = responsibilityType(type);
      const mode = modes[index];
      const expectedValue = expected[index];
      if (typeof expectedValue !== "string" || (mode !== "FOLLOW_GLOBAL" && mode !== "PROJECT_OVERRIDE")) {
        throw new CollaborationError("INVALID_TIME_LIMIT");
      }
      return mode === "FOLLOW_GLOBAL" ? {
        responsibilityType: responsibility,
        mode,
        expectedProjectSettingUpdatedAt: expectedValue || null,
      } as const : {
        responsibilityType: responsibility,
        mode,
        timeLimitDays: numberEntry(days[index]),
        reminderIntervalDays: numberEntry(reminders[index]),
        expectedProjectSettingUpdatedAt: expectedValue || null,
      } as const;
    });
    await getCollaborationRuntime().saveProjectTimeLimits(actor, {
      projectId,
      changes,
    });
    revalidatePath(`/workspace/projects/${projectId}/execution`);
  } catch (error) {
    const code = error instanceof CollaborationError ? error.code : "INVALID_TIME_LIMIT";
    redirect(projectId
      ? `/workspace/projects/${projectId}/execution?error=${code}`
      : `/workspace/projects?error=${code}`);
  }
  redirect(`/workspace/projects/${projectId}/execution?saved=1`);
}

export type TimeLimitFormResult = { ok: boolean; message: string };

export async function saveGlobalCollaborationTimeLimits(
  _previous: TimeLimitFormResult,
  formData: FormData,
): Promise<TimeLimitFormResult> {
  const actor = await requireCollaborationActor();
  try {
    const types = formData.getAll("responsibilityType");
    const days = formData.getAll("timeLimitDays");
    const reminders = formData.getAll("reminderIntervalDays");
    const expected = formData.getAll("expectedUpdatedAt");
    if (![days, reminders, expected].every((values) => values.length === types.length)) {
      throw new CollaborationError("INVALID_TIME_LIMIT");
    }
    await getCollaborationRuntime().saveGlobalTimeLimits(actor, {
      changes: types.map((type, index) => ({
        responsibilityType: responsibilityType(type),
        timeLimitDays: numberEntry(days[index]),
        reminderIntervalDays: numberEntry(reminders[index]),
        expectedUpdatedAt: stringEntry(expected[index]) || null,
      })),
    });
    revalidatePath("/workspace/pmo/collaboration-time-limits");
  } catch (error) {
    const code = error instanceof CollaborationError ? error.code : "INVALID_TIME_LIMIT";
    return { ok: false, message: code === "TIME_LIMIT_CONFLICT" ? "配置已被其他操作更新，请重新读取后再保存。" : code === "COLLABORATION_FORBIDDEN" ? "当前角色无权维护全局协作时限。" : "请输入正整数时限和提醒周期。" };
  }
  return { ok: true, message: "全局协作时限已保存。" };
}

function requiredText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim() === "") {
    throw new CollaborationError("INVALID_TIME_LIMIT");
  }
  return value.trim();
}

function numberEntry(value: FormDataEntryValue | undefined): number {
  if (typeof value !== "string" || value.trim() === "") throw new CollaborationError("INVALID_TIME_LIMIT");
  return Number(value);
}

function stringEntry(value: FormDataEntryValue | undefined): string {
  if (typeof value !== "string") throw new CollaborationError("INVALID_TIME_LIMIT");
  return value;
}

function responsibilityType(value: FormDataEntryValue | null): CollaborationResponsibilityType {
  if (
    typeof value !== "string" ||
    !COLLABORATION_RESPONSIBILITY_TYPES.includes(value as CollaborationResponsibilityType)
  ) {
    throw new CollaborationError("INVALID_TIME_LIMIT");
  }
  return value as CollaborationResponsibilityType;
}
