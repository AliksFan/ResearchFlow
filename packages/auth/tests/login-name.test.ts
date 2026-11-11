import { describe, expect, it } from "vitest";

import { parseLoginName } from "../src/index.js";

describe("parseLoginName", () => {
  it("normalizes a valid login name", () => {
    expect(parseLoginName("  Key.Sub-I_01  ")).toBe("key.sub-i_01");
  });

  it.each(["ab", ".pmo", "pmo-", "pmo..admin", "pmo 管理", "pmo/admin"])(
    "rejects invalid login name %s",
    (loginName) => {
      expect(() => parseLoginName(loginName)).toThrowError("INVALID_LOGIN_NAME");
    },
  );

  it("rejects login names longer than 50 characters", () => {
    expect(() => parseLoginName("a".repeat(51))).toThrowError(
      "INVALID_LOGIN_NAME",
    );
  });
});
