import { AuthRepositoryError } from "@researchflow/auth";
import { describe, expect, it, vi } from "vitest";

import type { Prisma } from "../generated/client.js";
import { createAuthRepositories } from "../src/auth-repositories.js";

describe("authentication repository error mapping", () => {
  it("maps a concurrent unique-login constraint to the stable domain error", async () => {
    const transaction = {
      person: {
        create: vi.fn().mockRejectedValue({ code: "P2002" }),
      },
    } as unknown as Prisma.TransactionClient;
    const repositories = createAuthRepositories(transaction);
    await expect(repositories.people.create({
      loginName: "virtual-duplicate",
      displayName: "虚构重复账号",
      passwordHash: null,
      accountStatus: "INVITED",
      mustChangePassword: true,
    })).rejects.toEqual(new AuthRepositoryError("LOGIN_NAME_DUPLICATE"));
  });
});
