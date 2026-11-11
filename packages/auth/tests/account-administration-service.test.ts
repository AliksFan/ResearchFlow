import { describe, expect, it, vi } from "vitest";

import {
  AccountAdministrationService,
  AuthDomainError,
  type AuthRepositories,
  type AuthUnitOfWork,
} from "../src/index.js";

function createHarness(overrides: Partial<AuthRepositories> = {}) {
  const repositories = {
    people: {
      findByLoginName: vi.fn(),
      findById: vi.fn(),
      findByIdForUpdate: vi.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000001",
        loginName: "virtual-pmo",
        displayName: "虚拟 PMO",
        passwordHash: "virtual-hash",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        failedLoginCount: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
        passwordChangedAt: new Date("2026-08-17T00:00:00Z"),
      }),
      listForManagement: vi.fn(),
      create: vi.fn(),
      updateStatus: vi.fn(),
      updatePassword: vi.fn(),
      updateLoginProtection: vi.fn(),
      recordLoginSuccess: vi.fn(),
    },
    credentials: {
      revokeOpen: vi.fn(),
      create: vi.fn(),
      findByHashForUpdate: vi.fn(),
      markConsumed: vi.fn(),
    },
    passwordHistory: {} as AuthRepositories["passwordHistory"],
    rateLimits: {} as AuthRepositories["rateLimits"],
    sessions: {
      create: vi.fn(),
      findByTokenHash: vi.fn(),
      findByIdForUpdate: vi.fn(),
      countActive: vi.fn(),
      revokeOldestExcess: vi.fn(),
      revokeForPerson: vi.fn(),
      revokeById: vi.fn(),
      touch: vi.fn(),
      setActiveRole: vi.fn(),
    },
    roles: {
      listActiveRoleCodes: vi.fn(),
      hasActiveRole: vi.fn(),
      hasProjectAccess: vi.fn(),
      listVisibleProjectIds: vi.fn(),
      listForManagement: vi.fn(),
      listAssignableProjects: vi.fn(),
      countAvailablePmosForUpdate: vi.fn().mockResolvedValue(2),
      personHasActiveGlobalPmo: vi.fn().mockResolvedValue(true),
      personHasActivePrimaryKeySubIForUpdate: vi.fn().mockResolvedValue(false),
      projectIsAssignableForUpdate: vi.fn(),
      create: vi.fn(),
      findByIdForUpdate: vi.fn(),
      findSystemBootstrapPmoForUpdate: vi.fn(),
      end: vi.fn(),
    },
    audit: { append: vi.fn() },
    ...overrides,
  } satisfies AuthRepositories;

  const unitOfWork: AuthUnitOfWork = {
    run: vi.fn(async (operation) => operation(repositories)),
  };

  return {
    repositories,
    service: new AccountAdministrationService(unitOfWork),
  };
}

describe("AccountAdministrationService", () => {
  it.each(["MANUAL_LOCK", "DISABLE"] as const)(
    "%s changes state, revokes sessions, and appends audit in one unit of work",
    async (operation) => {
      const { repositories, service } = createHarness();

      await service.changeAccountStatus({
        actorPersonId: "00000000-0000-4000-8000-000000000009",
        actorRoleCode: "PMO",
        targetPersonId: "00000000-0000-4000-8000-000000000001",
        operation,
        correlationId: "auth-test-correlation",
        now: new Date("2026-08-17T08:00:00Z"),
      });

      expect(repositories.people.updateStatus).toHaveBeenCalledOnce();
      expect(repositories.sessions.revokeForPerson).toHaveBeenCalledOnce();
      expect(repositories.audit.append).toHaveBeenCalledWith(
        expect.objectContaining({ result: "SUCCESS" }),
      );
    },
  );

  it("rejects removal of the final available PMO before mutating state", async () => {
    const { repositories, service } = createHarness();
    vi.mocked(repositories.roles.countAvailablePmosForUpdate).mockResolvedValue(1);

    await expect(
      service.changeAccountStatus({
        actorPersonId: "00000000-0000-4000-8000-000000000009",
        actorRoleCode: "PMO",
        targetPersonId: "00000000-0000-4000-8000-000000000001",
        operation: "DISABLE",
        correlationId: "auth-test-correlation",
        now: new Date("2026-08-17T08:00:00Z"),
      }),
    ).rejects.toEqual(new AuthDomainError("LAST_AVAILABLE_PMO"));

    expect(repositories.people.updateStatus).not.toHaveBeenCalled();
    expect(repositories.sessions.revokeForPerson).not.toHaveBeenCalled();
  });

  it("rejects ending the final active global PMO assignment", async () => {
    const { repositories, service } = createHarness();
    vi.mocked(repositories.roles.findByIdForUpdate).mockResolvedValue({
      id: "80000000-0000-4000-8000-000000000001",
      personId: "00000000-0000-4000-8000-000000000001",
      roleCode: "PMO",
      projectId: null,
      assignmentStatus: "ACTIVE",
      isPrimary: false,
    });
    vi.mocked(repositories.roles.countAvailablePmosForUpdate).mockResolvedValue(1);

    await expect(
      service.endRoleAssignment({
        actorPersonId: "00000000-0000-4000-8000-000000000009",
        actorRoleCode: "PMO",
        assignmentId: "80000000-0000-4000-8000-000000000001",
        correlationId: "auth-test-correlation",
        now: new Date("2026-08-17T08:00:00Z"),
      }),
    ).rejects.toEqual(new AuthDomainError("LAST_AVAILABLE_PMO"));

    expect(repositories.roles.end).not.toHaveBeenCalled();
  });

  it("requires handover before ending an active primary Key Sub-I assignment", async () => {
    const { repositories, service } = createHarness();
    vi.mocked(repositories.roles.findByIdForUpdate).mockResolvedValue({
      id: "80000000-0000-4000-8000-000000000002",
      personId: "00000000-0000-4000-8000-000000000002",
      roleCode: "KEY_SUB_I",
      projectId: "20000000-0000-4000-8000-000000000001",
      assignmentStatus: "ACTIVE",
      isPrimary: true,
    });

    await expect(service.endRoleAssignment({
      actorPersonId: "00000000-0000-4000-8000-000000000009",
      actorRoleCode: "PMO",
      assignmentId: "80000000-0000-4000-8000-000000000002",
      correlationId: "end-primary-key-sub-i",
      now: new Date("2026-08-17T08:00:00Z"),
    })).rejects.toEqual(new AuthDomainError("PRIMARY_KEY_SUB_I_HANDOVER_REQUIRED"));
    expect(repositories.roles.end).not.toHaveBeenCalled();
  });
});
