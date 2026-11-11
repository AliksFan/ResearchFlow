import { beforeAll, describe, expect, it } from "vitest";

import { getAuthOptions } from "../src/server/auth-options";

describe("Auth.js security boundary", () => {
  beforeAll(() => {
    process.env.NEXTAUTH_SECRET = "virtual-next-auth-secret-at-least-32-bytes";
  });

  it("stores only the random database-session carrier in the encrypted JWT", async () => {
    const callback = getAuthOptions().callbacks?.jwt;
    if (!callback) throw new Error("JWT callback missing");
    const token = await callback({
      token: { roleCode: "PMO", projectIds: ["must-not-survive"] },
      user: { id: "virtual-person", sessionToken: "raw-session-carrier" },
      account: null,
      profile: undefined,
      trigger: "signIn",
      isNewUser: false,
      session: undefined,
    });
    expect(token).toEqual({ sessionToken: "raw-session-carrier" });
    expect(token).not.toHaveProperty("roleCode");
    expect(token).not.toHaveProperty("projectIds");
  });

  it("uses host-only secure HttpOnly cookies for session and CSRF material", () => {
    const cookies = getAuthOptions().cookies;
    expect(cookies?.sessionToken).toMatchObject({
      name: "__Host-researchflow.session-token",
      options: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
    });
    expect(cookies?.csrfToken).toMatchObject({
      name: "__Host-researchflow.csrf-token",
      options: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
    });
  });
});
