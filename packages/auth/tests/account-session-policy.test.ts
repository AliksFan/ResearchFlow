import { describe, expect, it } from "vitest";

import {
  evaluateSession,
  getReenabledAccountStatus,
  selectInitialRole,
  transitionAccountStatus,
} from "../src/index.js";

describe("transitionAccountStatus", () => {
  it.each([
    ["INVITED", "ACTIVATE", true, "ACTIVE"],
    ["ACTIVE", "MANUAL_LOCK", true, "LOCKED"],
    ["LOCKED", "UNLOCK", true, "ACTIVE"],
    ["INVITED", "DISABLE", false, "DISABLED"],
    ["ACTIVE", "DISABLE", true, "DISABLED"],
    ["LOCKED", "DISABLE", true, "DISABLED"],
    ["DISABLED", "REENABLE", true, "ACTIVE"],
    ["DISABLED", "REENABLE", false, "INVITED"],
  ] as const)(
    "transitions %s with %s (hasPassword=%s) to the approved status",
    (currentStatus, event, hasPassword, expectedStatus) => {
      expect(transitionAccountStatus(currentStatus, event, hasPassword)).toEqual({
        allowed: true,
        status: expectedStatus,
      });
    },
  );

  it("rejects a transition outside the approved state graph", () => {
    expect(transitionAccountStatus("INVITED", "UNLOCK", false)).toEqual({
      allowed: false,
      code: "INVALID_ACCOUNT_TRANSITION",
    });
  });
});

describe("getReenabledAccountStatus", () => {
  it("returns ACTIVE when a disabled account already has a password", () => {
    expect(getReenabledAccountStatus(true)).toBe("ACTIVE");
  });

  it("returns INVITED when a disabled account has no password", () => {
    expect(getReenabledAccountStatus(false)).toBe("INVITED");
  });
});

describe("selectInitialRole", () => {
  it("returns no-role for an account without an active role", () => {
    expect(selectInitialRole([])).toEqual({ kind: "NO_ROLE" });
  });

  it("automatically selects the only active role", () => {
    expect(selectInitialRole(["KEY_SUB_I"])).toEqual({
      kind: "SELECTED",
      roleCode: "KEY_SUB_I",
    });
  });

  it("requires selection for multiple distinct roles", () => {
    expect(selectInitialRole(["KEY_SUB_I", "CRC", "KEY_SUB_I"])).toEqual({
      kind: "SELECTION_REQUIRED",
      roleCodes: ["KEY_SUB_I", "CRC"],
    });
  });
});

describe("evaluateSession", () => {
  const now = new Date("2026-08-17T08:00:00.000Z");
  const validSession = {
    accountStatus: "ACTIVE" as const,
    lockedUntil: null,
    expiresAt: new Date("2026-08-17T10:00:00.000Z"),
    lastSeenAt: new Date("2026-08-17T07:31:00.000Z"),
    revokedAt: null,
  };

  it("accepts an active non-expired session", () => {
    expect(evaluateSession(validSession, now)).toEqual({ valid: true });
  });

  it("rejects a revoked session", () => {
    expect(
      evaluateSession(
        { ...validSession, revokedAt: new Date("2026-08-17T07:59:00.000Z") },
        now,
      ),
    ).toEqual({ valid: false, code: "SESSION_REVOKED" });
  });

  it("rejects locked, disabled, and invited accounts", () => {
    for (const accountStatus of ["LOCKED", "DISABLED", "INVITED"] as const) {
      expect(evaluateSession({ ...validSession, accountStatus }, now)).toEqual({
        valid: false,
        code: "ACCOUNT_NOT_ACTIVE",
      });
    }
  });

  it("rejects a temporarily protected account until the lock boundary", () => {
    expect(evaluateSession({
      ...validSession,
      lockedUntil: new Date("2026-08-17T08:15:00.000Z"),
    }, now)).toEqual({ valid: false, code: "ACCOUNT_NOT_ACTIVE" });
    expect(evaluateSession({ ...validSession, lockedUntil: new Date(now) }, now))
      .toEqual({ valid: true });
  });

  it("expires at the absolute boundary", () => {
    expect(
      evaluateSession({ ...validSession, expiresAt: new Date(now) }, now),
    ).toEqual({ valid: false, code: "SESSION_EXPIRED" });
  });

  it("expires at the 30-minute idle boundary", () => {
    expect(
      evaluateSession(
        {
          ...validSession,
          lastSeenAt: new Date("2026-08-17T07:30:00.000Z"),
        },
        now,
      ),
    ).toEqual({ valid: false, code: "SESSION_IDLE_TIMEOUT" });
  });
});
