import { describe, expect, it } from "vitest";

import {
  canRemoveAvailablePmo,
  getRoleActionDecision,
  ROLE_CODES,
} from "../src/index.js";

describe("last available PMO protection", () => {
  it.each(["LOCK_ACCOUNT", "DISABLE_ACCOUNT", "END_PMO_ASSIGNMENT"] as const)(
    "rejects %s for the final available PMO",
    (operation) => {
      expect(canRemoveAvailablePmo(1, operation)).toEqual({
        allowed: false,
        code: "LAST_AVAILABLE_PMO",
      });
    },
  );

  it("allows the operation when another PMO remains", () => {
    expect(canRemoveAvailablePmo(2, "DISABLE_ACCOUNT")).toEqual({
      allowed: true,
    });
  });
});

describe("fixed role action matrix", () => {
  it("contains exactly the six approved roles", () => {
    expect(ROLE_CODES).toEqual([
      "DEAN",
      "PMO",
      "KEY_SUB_I",
      "CRC",
      "STATISTICIAN",
      "COLLABORATION_LEAD",
    ]);
  });

  it("allows only PMO to manage users, roles, and configuration", () => {
    for (const roleCode of ROLE_CODES) {
      expect(getRoleActionDecision(roleCode, "MANAGE_ACCESS")).toBe(
        roleCode === "PMO" ? "ALLOW" : "DENY",
      );
    }
  });

  it("allows only DEAN to make dean issue decisions", () => {
    for (const roleCode of ROLE_CODES) {
      expect(getRoleActionDecision(roleCode, "DEAN_ISSUE_DECISION")).toBe(
        roleCode === "DEAN" ? "ALLOW" : "DENY",
      );
    }
  });

  it("marks reporter confirmation as contextual for every role", () => {
    for (const roleCode of ROLE_CODES) {
      expect(getRoleActionDecision(roleCode, "REPORTER_CONFIRMATION")).toBe(
        "CONDITIONAL",
      );
    }
  });

  it("denies support roles all review and configuration actions", () => {
    for (const roleCode of [
      "CRC",
      "STATISTICIAN",
      "COLLABORATION_LEAD",
    ] as const) {
      for (const action of [
        "MANAGE_ACCESS",
        "ESTABLISH_PROJECT",
        "REVIEW_WORKFLOW_COMPLETION",
        "PMO_ISSUE_HANDLING",
        "DEAN_ISSUE_DECISION",
        "REVIEW_PROJECT_COMPLETION",
        "VIEW_AUDIT_CENTER",
      ] as const) {
        expect(getRoleActionDecision(roleCode, action)).toBe("DENY");
      }
    }
  });
});
