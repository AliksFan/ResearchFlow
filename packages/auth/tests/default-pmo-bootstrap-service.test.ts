import { describe, expect, it, vi } from "vitest";

import {
  DefaultPmoBootstrapService,
  type AuthRepositories,
  type AuthUnitOfWork,
  type PasswordHasher,
} from "../src/index.js";

describe("DefaultPmoBootstrapService", () => {
  it("creates the immutable pmo login with forced first password change and bootstrap role", async () => {
    const repositories = createRepositories();
    const unitOfWork: AuthUnitOfWork = {
      run: async (operation) => operation(repositories),
    };
    const hasher: PasswordHasher = {
      hash: vi.fn().mockResolvedValue("argon2id-virtual-hash"),
      verify: vi.fn(),
    };

    await new DefaultPmoBootstrapService(unitOfWork, hasher).run({
      initialPassword: "虚拟初始安全口令 2026",
      correlationId: "bootstrap-test",
      now: new Date("2026-08-17T08:00:00Z"),
    });

    expect(repositories.people.create).toHaveBeenCalledWith({
      loginName: "pmo",
      displayName: "PMO",
      passwordHash: "argon2id-virtual-hash",
      accountStatus: "ACTIVE",
      mustChangePassword: true,
    });
    expect(repositories.roles.create).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: "00000000-0000-4000-8000-000000000001",
        roleCode: "PMO",
        projectId: null,
        grantSource: "SYSTEM_BOOTSTRAP",
        grantedByPersonId: null,
      }),
    );
  });

  it("does not overwrite an existing pmo password or duplicate its bootstrap role", async () => {
    const repositories = createRepositories();
    vi.mocked(repositories.people.findByLoginName).mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      loginName: "pmo",
      displayName: "PMO",
      passwordHash: "existing-hash",
      accountStatus: "ACTIVE",
      mustChangePassword: false,
      failedLoginCount: 0,
      failedLoginWindowStartedAt: null,
      lockedUntil: null,
      passwordChangedAt: new Date("2026-08-17T00:00:00Z"),
    });
    vi.mocked(repositories.roles.findSystemBootstrapPmoForUpdate).mockResolvedValue({
      id: "80000000-0000-4000-8000-000000000001",
      personId: "00000000-0000-4000-8000-000000000001",
      roleCode: "PMO",
      projectId: null,
      assignmentStatus: "ACTIVE",
      isPrimary: false,
    });
    const hasher: PasswordHasher = {
      hash: vi.fn().mockResolvedValue("new-unused-hash"),
      verify: vi.fn(),
    };

    await new DefaultPmoBootstrapService(
      { run: async (operation) => operation(repositories) },
      hasher,
    ).run({
      initialPassword: "另一个虚拟初始安全口令 2026",
      correlationId: "bootstrap-repeat-test",
      now: new Date("2026-08-17T08:00:00Z"),
    });

    expect(repositories.people.create).not.toHaveBeenCalled();
    expect(repositories.people.updatePassword).not.toHaveBeenCalled();
    expect(repositories.roles.create).not.toHaveBeenCalled();
  });
});

function createRepositories(): AuthRepositories {
  return {
    people: {
      findByLoginName: vi.fn().mockResolvedValue(null),
      findById: vi.fn(),
      findByIdForUpdate: vi.fn(),
      listForManagement: vi.fn(),
      create: vi.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000001",
        loginName: "pmo",
        displayName: "PMO",
        passwordHash: "argon2id-virtual-hash",
        accountStatus: "ACTIVE",
        mustChangePassword: true,
        failedLoginCount: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
        passwordChangedAt: null,
      }),
      updateStatus: vi.fn(),
      updatePassword: vi.fn(),
      updateLoginProtection: vi.fn(),
      recordLoginSuccess: vi.fn(),
    },
    credentials: {} as AuthRepositories["credentials"],
    passwordHistory: {} as AuthRepositories["passwordHistory"],
    rateLimits: {} as AuthRepositories["rateLimits"],
    sessions: {} as AuthRepositories["sessions"],
    roles: {
      listActiveRoleCodes: vi.fn(),
      hasActiveRole: vi.fn(),
      hasProjectAccess: vi.fn(),
      listVisibleProjectIds: vi.fn(),
      listForManagement: vi.fn(),
      listAssignableProjects: vi.fn(),
      countAvailablePmosForUpdate: vi.fn(),
      personHasActiveGlobalPmo: vi.fn(),
      personHasActivePrimaryKeySubIForUpdate: vi.fn(),
      projectIsAssignableForUpdate: vi.fn(),
      create: vi.fn(),
      findByIdForUpdate: vi.fn(),
      findSystemBootstrapPmoForUpdate: vi.fn().mockResolvedValue(null),
      end: vi.fn(),
    },
    audit: { append: vi.fn() },
  };
}
