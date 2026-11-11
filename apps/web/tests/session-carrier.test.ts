import { encode } from "next-auth/jwt";
import { beforeAll, describe, expect, it } from "vitest";

import { decodeSessionCarrierFromCookieHeader } from "../src/server/session-carrier";

describe("server session carrier", () => {
  const secret = "virtual-next-auth-secret-at-least-32-bytes";

  beforeAll(() => {
    process.env.NEXTAUTH_SECRET = secret;
  });

  it("decodes the Auth.js JWT from a Server Component cookie header", async () => {
    const jwt = await encode({
      secret,
      token: { sessionToken: "raw-session-carrier" },
    });

    await expect(decodeSessionCarrierFromCookieHeader(
      `unrelated=value; __Host-researchflow.session-token=${jwt}`,
    )).resolves.toBe("raw-session-carrier");
  });

  it("returns null when the session cookie is absent", async () => {
    await expect(decodeSessionCarrierFromCookieHeader("unrelated=value")).resolves.toBeNull();
  });

  it("reassembles chunked Auth.js cookies in numeric order", async () => {
    const jwt = await encode({
      secret,
      token: { sessionToken: "chunked-session-carrier" },
    });
    const midpoint = Math.ceil(jwt.length / 2);

    await expect(decodeSessionCarrierFromCookieHeader(
      `__Host-researchflow.session-token.1=${jwt.slice(midpoint)}; `
      + `__Host-researchflow.session-token.0=${jwt.slice(0, midpoint)}`,
    )).resolves.toBe("chunked-session-carrier");
  });
});
