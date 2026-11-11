import { describe, expect, it } from "vitest";

import { evaluatePasswordCandidate } from "../src/index.js";

describe("evaluatePasswordCandidate", () => {
  it("accepts a long Unicode passphrase without composition rules", () => {
    expect(
      evaluatePasswordCandidate({
        loginName: "pmo",
        password: "虚构研究中心 项目管理 安全口令",
      }),
    ).toEqual({ ok: true });
  });

  it.each([
    "aaaaaaaaaaaa",
    "111111111111",
    "012345678901",
    "987654321098",
    "qwertyqwerty",
    "asdfghjkl123",
    "1qaz2wsx3edc",
  ])("rejects the predictable weak password %s", (password) => {
    expect(evaluatePasswordCandidate({ loginName: "pmo", password })).toEqual({
      ok: false,
      code: "PASSWORD_TOO_COMMON",
    });
  });

  it.each([
    ["short", "PASSWORD_TOO_SHORT"],
    ["a".repeat(129), "PASSWORD_TOO_LONG"],
    ["secure-pmo-passphrase", "PASSWORD_CONTAINS_LOGIN_NAME"],
    ["password123456", "PASSWORD_TOO_COMMON"],
  ] as const)("rejects an invalid password with a stable code", (password, code) => {
    expect(evaluatePasswordCandidate({ loginName: "pmo", password })).toEqual({
      ok: false,
      code,
    });
  });

  it("counts Unicode code points rather than UTF-16 units", () => {
    expect(
      evaluatePasswordCandidate({ loginName: "pmo", password: "🔐虚构研究中心 项目管理 安全口令" }),
    ).toEqual({ ok: true });
  });

  it("rejects a password that Argon2 verification matched to current or recent history", () => {
    expect(
      evaluatePasswordCandidate({
        loginName: "pmo",
        password: "历史口令 仅用于虚构测试",
        matchesCurrentOrRecentPassword: true,
      }),
    ).toEqual({ ok: false, code: "PASSWORD_REUSED" });
  });
});
