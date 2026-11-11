import { describe, expect, it, vi } from "vitest";

import {
  AuthenticationService,
  type AuthKeyHasher,
  type AuthRepositories,
  type AuthUnitOfWork,
  type PasswordHasher,
  type SessionTokenCodec,
} from "../src/index.js";

const now = new Date("2026-08-17T08:00:00.000Z");

describe("AuthenticationService", () => {
  it("returns a raw carrier token but persists only its hash", async () => {
    const repositories = createRepositories();
    const service = createService(repositories);

    await expect(
      service.login({
        loginName: " Virtual-PMO ",
        password: "虚拟登录安全口令 2026",
        sourceIp: "192.0.2.10",
        userAgent: "virtual-test-agent",
        now,
        correlationId: "login-success",
      }),
    ).resolves.toMatchObject({
      ok: true,
      sessionToken: "raw-session-token",
      roleSelection: { kind: "SELECTED", roleCode: "PMO" },
    });

    expect(repositories.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: "hashed-session-token" }),
    );
    expect(repositories.sessions.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: "raw-session-token" }),
    );
  });

  it("preserves the shared source-IP failure window after a successful login", async () => {
    const repositories = createRepositories();

    await createService(repositories).login({
      loginName: "virtual-pmo",
      password: "虚拟登录安全口令 2026",
      sourceIp: "192.0.2.10",
      userAgent: "virtual-test-agent",
      now,
      correlationId: "login-preserve-source-ip-window",
    });

    expect(repositories.rateLimits.clear).toHaveBeenCalledOnce();
    expect(repositories.rateLimits.clear).toHaveBeenCalledWith("LOGIN_NAME", "login-key");
    expect(repositories.rateLimits.clear).not.toHaveBeenCalledWith("SOURCE_IP", "ip-key");
  });

  it("uses a dummy hash for an unknown account and returns only the generic code", async () => {
    const repositories = createRepositories();
    vi.mocked(repositories.people.findByLoginName).mockResolvedValue(null);
    const hasher = createPasswordHasher(false);
    const service = createService(repositories, hasher);

    await expect(
      service.login({
        loginName: "unknown-account",
        password: "虚拟错误安全口令 2026",
        sourceIp: "192.0.2.11",
        userAgent: "virtual-test-agent",
        now,
        correlationId: "login-unknown",
      }),
    ).resolves.toEqual({ ok: false, code: "AUTHENTICATION_FAILED" });

    expect(hasher.verify).toHaveBeenCalledWith(
      "dummy-argon2id-hash",
      "虚拟错误安全口令 2026",
    );
    expect(repositories.rateLimits.registerFailure).toHaveBeenCalledTimes(2);
    expect(repositories.sessions.create).not.toHaveBeenCalled();
  });

  it("does not create a shared source-IP limiter when no trusted address is available", async () => {
    const repositories = createRepositories();
    await createService(repositories).login({
      loginName: "virtual-pmo",
      password: "虚拟登录安全口令 2026",
      sourceIp: null,
      userAgent: "virtual-test-agent",
      now,
      correlationId: "login-without-source-ip",
    });

    expect(repositories.rateLimits.findForUpdate).toHaveBeenCalledOnce();
    expect(repositories.rateLimits.findForUpdate).toHaveBeenCalledWith("LOGIN_NAME", "login-key");
    expect(repositories.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: null }),
    );
  });

  it("sets the 15-minute temporary lock on the fifth failure", async () => {
    const repositories = createRepositories();
    vi.mocked(repositories.rateLimits.findForUpdate).mockResolvedValue({
      id: "rate-limit-id",
      dimension: "LOGIN_NAME",
      keyHash: "login-key",
      failureCount: 4,
      windowStartedAt: new Date("2026-08-17T07:59:00.000Z"),
      lockedUntil: null,
    });
    vi.mocked(repositories.rateLimits.registerFailure).mockResolvedValue({
      id: "rate-limit-id",
      dimension: "LOGIN_NAME",
      keyHash: "login-key",
      failureCount: 5,
      windowStartedAt: new Date("2026-08-17T07:59:00.000Z"),
      lockedUntil: new Date("2026-08-17T08:15:00.000Z"),
    });
    const service = createService(repositories, createPasswordHasher(false));

    await service.login({
      loginName: "virtual-pmo",
      password: "虚拟错误安全口令 2026",
      sourceIp: "192.0.2.12",
      userAgent: "virtual-test-agent",
      now,
      correlationId: "login-fifth-failure",
    });

    expect(repositories.people.updateLoginProtection).toHaveBeenCalledWith(
      expect.objectContaining({
        failedLoginCount: 5,
        lockedUntil: new Date("2026-08-17T08:15:00.000Z"),
      }),
    );
    expect(repositories.rateLimits.registerFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        failureLimit: 5,
        windowMs: 15 * 60 * 1000,
      }),
    );
    expect(repositories.audit.append).toHaveBeenCalledTimes(2);
    expect(repositories.audit.append).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        actionCode: "ACCOUNT_TEMPORARILY_LOCKED",
        entityType: "PERSON",
        entityId: "00000000-0000-4000-8000-000000000001",
        changedFields: ["failed_login_count", "locked_until"],
      }),
    );
    expect(repositories.audit.append).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ actionCode: "LOGIN_FAILED" }),
    );
  });

  it("does not extend or re-audit an active temporary lock", async () => {
    const repositories = createRepositories();
    const alreadyLocked = {
      ...(await repositories.people.findByLoginName("virtual-pmo"))!,
      failedLoginCount: 5,
      failedLoginWindowStartedAt: new Date("2026-08-17T07:59:00.000Z"),
      lockedUntil: new Date("2026-08-17T08:15:00.000Z"),
    };
    vi.mocked(repositories.people.findByIdForUpdate).mockResolvedValue(alreadyLocked);

    await createService(repositories, createPasswordHasher(false)).login({
      loginName: "virtual-pmo",
      password: "虚拟错误安全口令 2026",
      sourceIp: "192.0.2.12",
      userAgent: "virtual-test-agent",
      now: new Date("2026-08-17T08:05:00.000Z"),
      correlationId: "login-while-temporarily-locked",
    });

    expect(repositories.audit.append).toHaveBeenCalledOnce();
    expect(repositories.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ actionCode: "LOGIN_FAILED" }),
    );
    expect(repositories.people.updateLoginProtection).not.toHaveBeenCalled();
  });

  it("revalidates the authoritative database session and touches only a valid session", async () => {
    const repositories = createRepositories();
    vi.mocked(repositories.sessions.findByTokenHash).mockResolvedValue({
      id: "session-id",
      personId: "00000000-0000-4000-8000-000000000001",
      tokenHash: "hashed-session-token",
      activeRoleCode: "PMO",
      expiresAt: new Date("2026-08-17T20:00:00Z"),
      revokedAt: null,
      createdAt: now,
      lastSeenAt: new Date("2026-08-17T07:45:00Z"),
    });
    vi.mocked(repositories.people.findById).mockResolvedValue(
      await repositories.people.findByLoginName("virtual-pmo"),
    );
    const service = createService(repositories);

    await expect(
      service.validateSession("raw-session-token", now),
    ).resolves.toMatchObject({
      authenticated: true,
      activeRoleCode: "PMO",
      availableRoleCodes: ["PMO"],
    });
    expect(repositories.sessions.touch).toHaveBeenCalledWith("session-id", now);
  });

  it("rejects a revoked database session even when the carrier token is present", async () => {
    const repositories = createRepositories();
    vi.mocked(repositories.sessions.findByTokenHash).mockResolvedValue({
      id: "session-id",
      personId: "00000000-0000-4000-8000-000000000001",
      tokenHash: "hashed-session-token",
      activeRoleCode: "PMO",
      expiresAt: new Date("2026-08-17T20:00:00Z"),
      revokedAt: new Date("2026-08-17T07:59:00Z"),
      createdAt: now,
      lastSeenAt: new Date("2026-08-17T07:45:00Z"),
    });
    vi.mocked(repositories.people.findById).mockResolvedValue(
      await repositories.people.findByLoginName("virtual-pmo"),
    );

    await expect(
      createService(repositories).validateSession("raw-session-token", now),
    ).resolves.toEqual({ authenticated: false, code: "SESSION_REVOKED" });
    expect(repositories.sessions.touch).not.toHaveBeenCalled();
  });

  it("keeps at most five active sessions after every successful login", async () => {
    const repositories = createRepositories();
    await createService(repositories).login({
      loginName: "virtual-pmo",
      password: "虚拟登录安全口令 2026",
      sourceIp: "192.0.2.20",
      userAgent: "virtual-test-agent",
      now,
      correlationId: "login-session-cap",
    });
    expect(repositories.sessions.revokeOldestExcess).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      5,
      now,
    );
  });

  it("logs out only the current authoritative session", async () => {
    const repositories = createRepositories();
    vi.mocked(repositories.sessions.findByTokenHash).mockResolvedValue(
      activeSession(),
    );
    await createService(repositories).logout({
      rawToken: "raw-session-token",
      now,
      correlationId: "logout-current",
    });
    expect(repositories.sessions.revokeById).toHaveBeenCalledWith("session-id", now);
    expect(repositories.sessions.revokeForPerson).not.toHaveBeenCalled();
  });

  it("switches only to a currently assigned role and audits the change", async () => {
    const repositories = createRepositories();
    vi.mocked(repositories.sessions.findByTokenHash).mockResolvedValue(
      activeSession(),
    );
    vi.mocked(repositories.people.findById).mockResolvedValue(
      await repositories.people.findByLoginName("virtual-pmo"),
    );
    vi.mocked(repositories.roles.listActiveRoleCodes).mockResolvedValue([
      "PMO",
      "DEAN",
    ]);

    await expect(createService(repositories).switchRole({
      rawToken: "raw-session-token",
      roleCode: "DEAN",
      now,
      correlationId: "switch-role",
    })).resolves.toMatchObject({ ok: true, activeRoleCode: "DEAN" });
    expect(repositories.sessions.setActiveRole).toHaveBeenCalledWith("session-id", "DEAN");

    await expect(createService(repositories).switchRole({
      rawToken: "raw-session-token",
      roleCode: "CRC",
      now,
      correlationId: "switch-invalid-role",
    })).resolves.toEqual({ ok: false, code: "ROLE_NOT_ACTIVE" });
  });
});

function activeSession() {
  return {
    id: "session-id",
    personId: "00000000-0000-4000-8000-000000000001",
    tokenHash: "hashed-session-token",
    activeRoleCode: "PMO" as const,
    expiresAt: new Date("2026-08-17T20:00:00Z"),
    revokedAt: null,
    createdAt: now,
    lastSeenAt: new Date("2026-08-17T07:45:00Z"),
  };
}

function createService(
  repositories: AuthRepositories,
  passwordHasher = createPasswordHasher(true),
) {
  const unitOfWork: AuthUnitOfWork = {
    run: async (operation) => operation(repositories),
  };
  const keyHasher: AuthKeyHasher = {
    hashLoginName: vi.fn().mockReturnValue("login-key"),
    hashSourceIp: vi.fn().mockReturnValue("ip-key"),
    hashCredentialSourceIp: vi.fn().mockReturnValue("credential-ip-key"),
  };
  const tokenCodec: SessionTokenCodec = {
    generate: vi.fn().mockReturnValue({
      rawToken: "raw-session-token",
      tokenHash: "hashed-session-token",
    }),
    hash: vi.fn().mockReturnValue("hashed-session-token"),
  };
  return new AuthenticationService({
    unitOfWork,
    passwordHasher,
    keyHasher,
    tokenCodec,
    dummyPasswordHash: "dummy-argon2id-hash",
  });
}

function createPasswordHasher(result: boolean): PasswordHasher {
  return {
    hash: vi.fn(),
    verify: vi.fn().mockResolvedValue(result),
  };
}

function createRepositories(): AuthRepositories {
  return {
    people: {
      findByLoginName: vi.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000001",
        loginName: "virtual-pmo",
        displayName: "虚拟 PMO",
        passwordHash: "virtual-argon2id-hash",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        failedLoginCount: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
        passwordChangedAt: new Date("2026-08-17T00:00:00Z"),
      }),
      findById: vi.fn(),
      findByIdForUpdate: vi.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000001",
        loginName: "virtual-pmo",
        displayName: "虚拟 PMO",
        passwordHash: "virtual-argon2id-hash",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        failedLoginCount: 4,
        failedLoginWindowStartedAt: new Date("2026-08-17T07:59:00Z"),
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
    credentials: {} as AuthRepositories["credentials"],
    passwordHistory: {} as AuthRepositories["passwordHistory"],
    rateLimits: {
      findForUpdate: vi.fn().mockResolvedValue(null),
      registerFailure: vi.fn().mockImplementation(async (input) => ({
        id: "rate-limit-id",
        dimension: input.dimension,
        keyHash: input.keyHash,
        failureCount: 1,
        windowStartedAt: input.now,
        lockedUntil: null,
      })),
      clear: vi.fn(),
    },
    sessions: {
      create: vi.fn().mockResolvedValue({
        id: "session-id",
        personId: "00000000-0000-4000-8000-000000000001",
        tokenHash: "hashed-session-token",
        activeRoleCode: "PMO",
        expiresAt: new Date("2026-08-17T20:00:00Z"),
        revokedAt: null,
        createdAt: now,
        lastSeenAt: now,
      }),
      findByTokenHash: vi.fn(),
      findByIdForUpdate: vi.fn(),
      countActive: vi.fn().mockResolvedValue(0),
      revokeOldestExcess: vi.fn(),
      revokeForPerson: vi.fn(),
      revokeById: vi.fn(),
      touch: vi.fn(),
      setActiveRole: vi.fn(),
    },
    roles: {
      listActiveRoleCodes: vi.fn().mockResolvedValue(["PMO"]),
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
      findSystemBootstrapPmoForUpdate: vi.fn(),
      end: vi.fn(),
    },
    audit: { append: vi.fn() },
  };
}
