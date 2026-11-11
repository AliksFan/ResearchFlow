import { describe, expect, it } from "vitest";

import { HmacAuthKeyHasher, Sha256SessionTokenCodec } from "../src/index.js";

describe("authentication crypto utilities", () => {
  it("requires a sufficiently long independent HMAC secret", () => {
    expect(() => new HmacAuthKeyHasher("short-secret")).toThrowError(
      "AUTH_HMAC_SECRET_TOO_SHORT",
    );
  });

  it("separates normalized login-name and IP namespaces", () => {
    const hasher = new HmacAuthKeyHasher("x".repeat(32));
    expect(hasher.hashLoginName("virtual-pmo")).not.toBe(
      hasher.hashSourceIp("virtual-pmo"),
    );
  });

  it("generates a high-entropy carrier and stores only a deterministic SHA-256 hash", () => {
    const codec = new Sha256SessionTokenCodec();
    const token = codec.generate();
    expect(token.rawToken).not.toBe(token.tokenHash);
    expect(token.rawToken.length).toBeGreaterThanOrEqual(43);
    expect(token.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(codec.hash(token.rawToken)).toBe(token.tokenHash);
  });
});
