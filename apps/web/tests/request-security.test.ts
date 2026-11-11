import { describe, expect, it } from "vitest";

import { getSourceIp, hasTrustedOrigin } from "../src/server/request-security";

describe("authentication request security", () => {
  it("accepts only an exact same-origin state-changing request", () => {
    expect(hasTrustedOrigin("https://researchflow.example.test/api/auth/callback/credentials", "https://researchflow.example.test"))
      .toBe(true);
    expect(hasTrustedOrigin("https://researchflow.example.test/api/auth/callback/credentials", "https://evil.example.test"))
      .toBe(false);
    expect(hasTrustedOrigin("https://researchflow.example.test/api/auth/callback/credentials", null))
      .toBe(false);
  });

  it("uses proxy IP headers only under the explicit trusted-proxy contract", () => {
    const headers = new Headers({
      "x-forwarded-for": "192.0.2.80, 192.0.2.81",
      "x-real-ip": "192.0.2.82",
    });
    expect(getSourceIp(headers, false)).toBeNull();
    expect(getSourceIp(headers, true)).toBe("192.0.2.80");
  });

  it("does not accept malformed forwarded addresses", () => {
    const headers = new Headers({ "x-forwarded-for": "attacker-controlled" });
    expect(getSourceIp(headers, true)).toBeNull();
  });
});
