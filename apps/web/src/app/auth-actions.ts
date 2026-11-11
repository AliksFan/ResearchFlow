"use server";

import { randomUUID } from "node:crypto";

import {
  credentialTokenPurposeSchema,
  roleCodeSchema,
  type AccountStatusOperation,
  type PmoManagementError,
} from "@researchflow/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { getAuthRuntime, requiredEnvironment } from "@/server/auth-runtime";
import { getSourceIp, hasTrustedOrigin } from "@/server/request-security";
import { getRawSessionCarrier } from "@/server/session-carrier";

export type FormResult = { ok: boolean; message: string };
export type PmoFormResult = FormResult & { oneTimeLink?: string };

const GENERIC_FAILURE = { ok: false, message: "操作未完成，请检查输入或联系 PMO。" };

export async function consumeCredentialAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  await assertActionOrigin();
  const token = formData.get("token");
  const purpose = credentialTokenPurposeSchema.safeParse(formData.get("purpose"));
  const newPassword = formData.get("newPassword");
  if (typeof token !== "string" || !purpose.success || typeof newPassword !== "string") {
    return GENERIC_FAILURE;
  }
  const requestHeaders = await headers();
  try {
    await (await getAuthRuntime()).credentials.consume({
      token,
      purpose: purpose.data,
      newPassword,
      sourceIp: getSourceIp(
        requestHeaders,
        process.env.AUTH_TRUST_PROXY_HEADERS === "1",
      ),
      userAgent: (requestHeaders.get("user-agent") ?? "unavailable").slice(0, 512),
      now: new Date(),
      correlationId: randomUUID(),
    });
    return { ok: true, message: purpose.data === "ACTIVATION" ? "账号已激活。" : "密码已重置。" };
  } catch {
    return GENERIC_FAILURE;
  }
}

export async function changePasswordAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  await assertActionOrigin();
  const currentPassword = formData.get("currentPassword");
  const newPassword = formData.get("newPassword");
  const rawSessionToken = await getRawSessionCarrier();
  if (
    typeof currentPassword !== "string" ||
    typeof newPassword !== "string" ||
    !rawSessionToken
  ) return GENERIC_FAILURE;
  try {
    await (await getAuthRuntime()).credentials.changePassword({
      rawSessionToken,
      currentPassword,
      newPassword,
      now: new Date(),
      correlationId: randomUUID(),
    });
    return { ok: true, message: "密码已更新，其他设备上的会话已撤销。" };
  } catch {
    return GENERIC_FAILURE;
  }
}

export async function switchRoleAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  await assertActionOrigin();
  const role = roleCodeSchema.safeParse(formData.get("roleCode"));
  const rawSessionToken = await getRawSessionCarrier();
  if (!role.success || !rawSessionToken) return GENERIC_FAILURE;
  const result = await (await getAuthRuntime()).authentication.switchRole({
    rawToken: rawSessionToken,
    roleCode: role.data,
    now: new Date(),
    correlationId: randomUUID(),
  });
  return result.ok
    ? { ok: true, message: "角色已切换。" }
    : GENERIC_FAILURE;
}

export async function createAccountAction(
  _previous: PmoFormResult,
  formData: FormData,
): Promise<PmoFormResult> {
  await assertActionOrigin();
  const rawSessionToken = await getRawSessionCarrier();
  const loginName = formData.get("loginName");
  const displayName = formData.get("displayName");
  if (!rawSessionToken || typeof loginName !== "string" || typeof displayName !== "string") return GENERIC_FAILURE;
  const correlationId = randomUUID();
  try {
    await (await getAuthRuntime()).pmoManagement.createInvitedAccount({
      rawSessionToken,
      loginName,
      displayName,
      now: new Date(),
      correlationId,
    });
    revalidatePath("/admin/access");
    return { ok: true, message: "受邀账号已创建，请继续生成激活链接。" };
  } catch (error) {
    const code = safeErrorCode(error);
    const messages: Partial<Record<PmoManagementError["code"], string>> = {
      LOGIN_NAME_INVALID: "登录名需为 3–50 位小写字母、数字、点、下划线或连字符，首尾必须为字母或数字。",
      LOGIN_NAME_DUPLICATE: "该登录名已存在，请直接维护已有账号或使用其他登录名。",
      DISPLAY_NAME_INVALID: "显示名称不能为空且不能超过 100 个字符。",
      UNAUTHORIZED: "当前会话已失效或不再具有 PMO 权限，请重新登录。",
    };
    const message = messages[code as PmoManagementError["code"]];
    if (message) return { ok: false, message };
    console.error("PMO_ACCOUNT_CREATE_UNEXPECTED", {
      correlationId,
      error: code,
    });
    return { ok: false, message: `账号未创建，系统处理异常。追踪编号：${correlationId}。` };
  }
}

export async function issueCredentialAction(
  _previous: PmoFormResult,
  formData: FormData,
): Promise<PmoFormResult> {
  return runPmoAction(async (rawSessionToken) => {
    const targetPersonId = formData.get("targetPersonId");
    const purpose = credentialTokenPurposeSchema.safeParse(formData.get("purpose"));
    if (!isUuid(targetPersonId) || !purpose.success) return GENERIC_FAILURE;
    const result = await (await getAuthRuntime()).pmoManagement.issueCredential({
      rawSessionToken,
      targetPersonId,
      purpose: purpose.data,
      now: new Date(),
      correlationId: randomUUID(),
    });
    const path = purpose.data === "ACTIVATION" ? "/activate" : "/reset-password";
    const oneTimeLink = `${requiredEnvironment("NEXTAUTH_URL")}${path}#token=${encodeURIComponent(result.token)}`;
    return {
      ok: true,
      message: "链接仅在本次结果中显示；关闭后无法再次读取。",
      oneTimeLink,
    };
  });
}

export async function changeManagedAccountStatusAction(
  _previous: PmoFormResult,
  formData: FormData,
): Promise<PmoFormResult> {
  return runPmoAction(async (rawSessionToken) => {
    const targetPersonId = formData.get("targetPersonId");
    const operation = formData.get("operation");
    const operations: AccountStatusOperation[] = ["MANUAL_LOCK", "UNLOCK", "DISABLE", "REENABLE"];
    if (!isUuid(targetPersonId) || typeof operation !== "string" || !operations.includes(operation as AccountStatusOperation)) {
      return GENERIC_FAILURE;
    }
    await (await getAuthRuntime()).pmoManagement.changeAccountStatus({
      rawSessionToken,
      targetPersonId,
      operation: operation as AccountStatusOperation,
      now: new Date(),
      correlationId: randomUUID(),
    });
    revalidatePath("/admin/access");
    return { ok: true, message: "账号状态已更新。" };
  });
}

export async function grantRoleAction(
  _previous: PmoFormResult,
  formData: FormData,
): Promise<PmoFormResult> {
  return runPmoAction(async (rawSessionToken) => {
    const targetPersonId = formData.get("targetPersonId");
    const roleCode = roleCodeSchema.safeParse(formData.get("roleCode"));
    const projectCandidate = formData.get("projectId");
    const projectId = projectCandidate === "" ? null : projectCandidate;
    if (!isUuid(targetPersonId) || !roleCode.success || (projectId !== null && !isUuid(projectId))) {
      return GENERIC_FAILURE;
    }
    await (await getAuthRuntime()).pmoManagement.grantRole({
      rawSessionToken,
      targetPersonId,
      roleCode: roleCode.data,
      projectId,
      now: new Date(),
      correlationId: randomUUID(),
    });
    revalidatePath("/admin/access");
    return { ok: true, message: "角色授权已生效。" };
  });
}

export async function endRoleAction(
  _previous: PmoFormResult,
  formData: FormData,
): Promise<PmoFormResult> {
  return runPmoAction(async (rawSessionToken) => {
    const assignmentId = formData.get("assignmentId");
    if (!isUuid(assignmentId)) return GENERIC_FAILURE;
    await (await getAuthRuntime()).pmoManagement.endRole({
      rawSessionToken,
      assignmentId,
      now: new Date(),
      correlationId: randomUUID(),
    });
    revalidatePath("/admin/access");
    return { ok: true, message: "角色授权已结束。" };
  });
}

export async function grantKeySubIEligibilityAction(
  _previous: PmoFormResult,
  formData: FormData,
): Promise<PmoFormResult> {
  return runPmoAction(async (rawSessionToken) => {
    const targetPersonId = formData.get("targetPersonId");
    const reason = formData.get("reason");
    if (!isUuid(targetPersonId) || typeof reason !== "string" || !reason.trim()) return GENERIC_FAILURE;
    await (await getAuthRuntime()).pmoManagement.grantKeySubIEligibility({
      rawSessionToken,
      targetPersonId,
      reason,
      now: new Date(),
      correlationId: randomUUID(),
    });
    revalidatePath("/admin/access");
    return { ok: true, message: "Key Sub-I 申请资格已生效。" };
  });
}

export async function endKeySubIEligibilityAction(
  _previous: PmoFormResult,
  formData: FormData,
): Promise<PmoFormResult> {
  return runPmoAction(async (rawSessionToken) => {
    const eligibilityId = formData.get("eligibilityId");
    if (!isUuid(eligibilityId)) return GENERIC_FAILURE;
    await (await getAuthRuntime()).pmoManagement.endKeySubIEligibility({
      rawSessionToken,
      eligibilityId,
      now: new Date(),
      correlationId: randomUUID(),
    });
    revalidatePath("/admin/access");
    return { ok: true, message: "Key Sub-I 申请资格已结束，既有项目授权未改变。" };
  });
}

async function runPmoAction(
  operation: (rawSessionToken: string) => Promise<PmoFormResult>,
): Promise<PmoFormResult> {
  await assertActionOrigin();
  const rawSessionToken = await getRawSessionCarrier();
  if (!rawSessionToken) return GENERIC_FAILURE;
  try {
    return await operation(rawSessionToken);
  } catch {
    return GENERIC_FAILURE;
  }
}

function isUuid(value: FormDataEntryValue | null): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 80);
  }
  return error instanceof Error ? error.name.slice(0, 80) : typeof error;
}

async function assertActionOrigin(): Promise<void> {
  const requestHeaders = await headers();
  if (!hasTrustedOrigin(
    requiredEnvironment("NEXTAUTH_URL"),
    requestHeaders.get("origin"),
  )) {
    throw new Error("REQUEST_ORIGIN_REJECTED");
  }
}
