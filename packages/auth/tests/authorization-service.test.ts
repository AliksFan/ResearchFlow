import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationService,
  type AuthRepositories,
  type AuthUnitOfWork,
  type SessionAuthRecord,
} from "../src/index.js";

const now = new Date("2026-08-17T08:00:00Z");

describe("AuthorizationService", () => {
  it("rejects a cookie carrier when the database session has been revoked", async () => {
    const { repositories, service } = createHarness();
    vi.mocked(repositories.sessions.findByTokenHash).mockResolvedValue({
      ...session(),
      revokedAt: new Date("2026-08-17T07:59:00Z"),
    });
    await expect(service.authorize(request())).resolves.toEqual({
      allowed: false,
      code: "SESSION_INVALID",
    });
    expect(repositories.roles.hasActiveRole).not.toHaveBeenCalled();
  });

  it("clears a role that is no longer assigned", async () => {
    const { repositories, service } = createHarness();
    vi.mocked(repositories.roles.hasActiveRole).mockResolvedValue(false);
    await expect(service.authorize(request())).resolves.toEqual({
      allowed: false,
      code: "ROLE_NOT_ACTIVE",
    });
    expect(repositories.sessions.setActiveRole).toHaveBeenCalledWith("session-id", null);
  });

  it("denies a role action on the server even if a client displays the control", async () => {
    const { service } = createHarness({ activeRoleCode: "DEAN" });
    await expect(service.authorize(request({ action: "MANAGE_ACCESS" })))
      .resolves.toEqual({ allowed: false, code: "ACTION_FORBIDDEN" });
  });

  it("hides an out-of-scope project before contextual field checks", async () => {
    const { repositories, service } = createHarness({ activeRoleCode: "KEY_SUB_I" });
    vi.mocked(repositories.roles.hasProjectAccess).mockResolvedValue(false);
    await expect(service.authorize(request({
      action: "VIEW_PROJECT",
      projectId: "20000000-0000-4000-8000-000000000002",
      contextualPermissionSatisfied: true,
    }))).resolves.toEqual({ allowed: false, code: "PROJECT_OUT_OF_SCOPE" });
    expect(repositories.roles.hasProjectAccess).toHaveBeenCalledWith({
      personId: "00000000-0000-4000-8000-000000000001",
      roleCode: "KEY_SUB_I",
      projectId: "20000000-0000-4000-8000-000000000002",
    });
    expect(repositories.roles.listVisibleProjectIds).not.toHaveBeenCalled();
  });

  it("returns only database-derived scope for an allowed request", async () => {
    const { repositories, service } = createHarness();
    vi.mocked(repositories.roles.listVisibleProjectIds).mockResolvedValue([
      "20000000-0000-4000-8000-000000000001",
    ]);
    await expect(service.authorize(request())).resolves.toMatchObject({
      allowed: true,
      roleCode: "PMO",
      visibleProjectIds: ["20000000-0000-4000-8000-000000000001"],
    });
  });
});

function createHarness(sessionOverrides: Partial<SessionAuthRecord> = {}) {
  const repositories = {
    people: {
      findByLoginName: vi.fn(),
      findById: vi.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000001",
        loginName: "virtual-pmo",
        displayName: "虚拟 PMO",
        passwordHash: "virtual-hash",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        failedLoginCount: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
        passwordChangedAt: now,
      }),
      findByIdForUpdate: vi.fn(),
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
    passwordHistory: {
      listRecentHashes: vi.fn(),
      add: vi.fn(),
      keepMostRecent: vi.fn(),
    },
    rateLimits: {
      findForUpdate: vi.fn(),
      registerFailure: vi.fn(),
      clear: vi.fn(),
    },
    sessions: {
      create: vi.fn(),
      findByTokenHash: vi.fn().mockResolvedValue(session(sessionOverrides)),
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
      hasActiveRole: vi.fn().mockResolvedValue(true),
      hasProjectAccess: vi.fn().mockResolvedValue(true),
      listVisibleProjectIds: vi.fn().mockResolvedValue([]),
      listForManagement: vi.fn(),
      listAssignableProjects: vi.fn(),
      countAvailablePmosForUpdate: vi.fn(),
      personHasActiveGlobalPmo: vi.fn(),
      personHasActivePrimaryKeySubIForUpdate: vi.fn(),
      projectIsAssignableForUpdate: vi.fn(),
      create: vi.fn(),
      findByIdForUpdate: vi.fn(),
      findSystemBootstrapPmoForUpdate: vi.fn(),
      end: vi.fn(),
    },
    audit: { append: vi.fn() },
  } satisfies AuthRepositories;
  const unitOfWork: AuthUnitOfWork = {
    run: async (operation) => operation(repositories),
  };
  return {
    repositories,
    service: new AuthorizationService({
      unitOfWork,
      tokenCodec: {
        generate: vi.fn(),
        hash: vi.fn().mockReturnValue("hashed-session-token"),
      },
    }),
  };
}

function session(overrides: Partial<SessionAuthRecord> = {}): SessionAuthRecord {
  return {
    id: "session-id",
    personId: "00000000-0000-4000-8000-000000000001",
    tokenHash: "hashed-session-token",
    activeRoleCode: "PMO" as const,
    expiresAt: new Date("2026-08-17T20:00:00Z"),
    revokedAt: null,
    createdAt: now,
    lastSeenAt: new Date("2026-08-17T07:50:00Z"),
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    rawSessionToken: "raw-session-token",
    action: "MANAGE_ACCESS" as const,
    now,
    correlationId: "authorize-request",
    ...overrides,
  };
}
