import { describe, expect, it } from "vitest";

import {
  authorizationResultSchema,
  ACTIVATION_TOKEN_TTL_MS,
  credentialTokenSchema,
  LOGIN_FAILURE_LIMIT,
  LOGIN_TEMPORARY_LOCK_MS,
  MAX_ACTIVE_SESSIONS,
  PASSWORD_RESET_TOKEN_TTL_MS,
  roleContextSchema,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
  sessionRecordSchema,
} from "../src/index.js";

describe("authentication and authorization contracts", () => {
  it("accepts an unused activation credential without exposing the raw token", () => {
    const parsed = credentialTokenSchema.parse({
      purpose: "ACTIVATION",
      expiresAt: new Date("2026-08-20T08:00:00.000Z"),
      consumedAt: null,
      revokedAt: null,
    });

    expect(parsed.purpose).toBe("ACTIVATION");
    expect(Object.hasOwn(parsed, "token")).toBe(false);
  });

  it("rejects unsupported credential purposes", () => {
    expect(() =>
      credentialTokenSchema.parse({
        purpose: "EMAIL_CHANGE",
        expiresAt: new Date(),
        consumedAt: null,
        revokedAt: null,
      }),
    ).toThrow();
  });

  it("validates an authoritative session record and nullable role context", () => {
    expect(
      sessionRecordSchema.parse({
        accountStatus: "ACTIVE",
        lockedUntil: null,
        expiresAt: new Date("2026-08-17T20:00:00.000Z"),
        lastSeenAt: new Date("2026-08-17T08:00:00.000Z"),
        revokedAt: null,
        activeRoleCode: null,
      }).activeRoleCode,
    ).toBeNull();

    expect(
      roleContextSchema.parse({
        activeRoleCode: "KEY_SUB_I",
        availableRoleCodes: ["KEY_SUB_I", "CRC"],
      }),
    ).toEqual({
      activeRoleCode: "KEY_SUB_I",
      availableRoleCodes: ["KEY_SUB_I", "CRC"],
    });
  });

  it("uses fixed authorization denial codes", () => {
    expect(
      authorizationResultSchema.parse({
        allowed: false,
        code: "PROJECT_OUT_OF_SCOPE",
      }),
    ).toEqual({ allowed: false, code: "PROJECT_OUT_OF_SCOPE" });

    expect(() =>
      authorizationResultSchema.parse({ allowed: false, code: "CUSTOM_ERROR" }),
    ).toThrow();
  });

  it("fixes the approved credential, login protection, and session limits", () => {
    expect(ACTIVATION_TOKEN_TTL_MS).toBe(72 * 60 * 60 * 1000);
    expect(PASSWORD_RESET_TOKEN_TTL_MS).toBe(30 * 60 * 1000);
    expect(LOGIN_FAILURE_LIMIT).toBe(5);
    expect(LOGIN_TEMPORARY_LOCK_MS).toBe(15 * 60 * 1000);
    expect(SESSION_IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000);
    expect(SESSION_ABSOLUTE_TIMEOUT_MS).toBe(12 * 60 * 60 * 1000);
    expect(MAX_ACTIVE_SESSIONS).toBe(5);
  });
});
