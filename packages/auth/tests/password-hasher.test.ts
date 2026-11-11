import { describe, expect, it } from "vitest";

import { Argon2idPasswordHasher } from "../src/index.js";

describe("Argon2idPasswordHasher", () => {
  it("hashes with the approved Argon2id parameters and verifies without exposing the password", async () => {
    const hasher = new Argon2idPasswordHasher();
    const password = "虚拟 Argon2id 安全口令 2026";
    const passwordHash = await hasher.hash(password);

    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    await expect(hasher.verify(passwordHash, password)).resolves.toBe(true);
    await expect(hasher.verify(passwordHash, "另一个虚拟口令")).resolves.toBe(false);
  });
});
