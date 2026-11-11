import { beforeEach, describe, expect, it, vi } from "vitest";

import { PmoManagementError } from "@researchflow/auth";

const state = vi.hoisted(() => ({
  createInvitedAccount: vi.fn(),
}));

vi.mock("node:crypto", () => ({ randomUUID: () => "11111111-1111-4111-8111-111111111111" }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ origin: "https://127.0.0.1:35453" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/request-security", () => ({
  getSourceIp: vi.fn(() => null),
  hasTrustedOrigin: vi.fn(() => true),
}));
vi.mock("@/server/session-carrier", () => ({ getRawSessionCarrier: vi.fn(async () => "virtual-session") }));
vi.mock("@/server/auth-runtime", () => ({
  requiredEnvironment: vi.fn(() => "https://127.0.0.1:35453"),
  getAuthRuntime: vi.fn(async () => ({
    pmoManagement: { createInvitedAccount: state.createInvitedAccount },
  })),
}));

import { createAccountAction } from "@/app/auth-actions";

describe("PMO create account action", () => {
  beforeEach(() => {
    state.createInvitedAccount.mockReset();
    vi.restoreAllMocks();
  });

  it.each([
    ["LOGIN_NAME_INVALID", "登录名需为 3–50 位"],
    ["LOGIN_NAME_DUPLICATE", "该登录名已存在"],
    ["DISPLAY_NAME_INVALID", "显示名称不能为空"],
  ] as const)("returns a specific safe message for %s", async (code, expected) => {
    state.createInvitedAccount.mockRejectedValue(new PmoManagementError(code));
    const result = await createAccountAction({ ok: false, message: "" }, accountForm());
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining(expected) });
  });

  it("recognizes an allowlisted domain code across a production bundle boundary", async () => {
    state.createInvitedAccount.mockRejectedValue(Object.assign(new Error("bundled domain error"), {
      code: "LOGIN_NAME_INVALID",
    }));
    const result = await createAccountAction({ ok: false, message: "" }, accountForm());
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("登录名需为 3–50 位") });
  });

  it("returns only a tracking number and logs no database message for an unknown error", async () => {
    state.createInvitedAccount.mockRejectedValue(new Error("password for database user is secret"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await createAccountAction({ ok: false, message: "" }, accountForm());

    expect(result).toEqual({
      ok: false,
      message: "账号未创建，系统处理异常。追踪编号：11111111-1111-4111-8111-111111111111。",
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("password for database user");
    expect(consoleError).toHaveBeenCalledWith("PMO_ACCOUNT_CREATE_UNEXPECTED", {
      correlationId: "11111111-1111-4111-8111-111111111111",
      error: "Error",
    });
  });
});

function accountForm(): FormData {
  const form = new FormData();
  form.set("loginName", "virtual-user");
  form.set("displayName", "虚构用户");
  return form;
}
