import { describe, expect, it, vi } from "vitest";

import {
  CredentialService,
  CredentialServiceError,
  type AuthRepositories,
  type AuthUnitOfWork,
  type PersonAuthRecord,
  type PasswordHasher,
} from "../src/index.js";

const now = new Date("2026-08-17T08:00:00.000Z");
const personId = "00000000-0000-4000-8000-000000000001";

describe("CredentialService", () => {
  it("revokes the previous activation credential and returns raw material only once", async () => {
    const { repositories, service } = createHarness({ accountStatus: "INVITED", passwordHash: null });

    await expect(service.issue({
      actorPersonId: "00000000-0000-4000-8000-000000000009",
      actorRoleCode: "PMO",
      targetPersonId: personId,
      purpose: "ACTIVATION",
      now,
      correlationId: "issue-activation",
    })).resolves.toEqual({
      token: "raw-credential-token",
      expiresAt: new Date("2026-08-20T08:00:00.000Z"),
    });

    expect(repositories.credentials.revokeOpen).toHaveBeenCalledBefore(
      vi.mocked(repositories.credentials.create),
    );
    expect(repositories.credentials.create).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: "hashed-credential-token" }),
    );
    expect(repositories.credentials.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: "raw-credential-token" }),
    );
  });

  it("consumes a valid activation once, activates the account, and revokes sessions", async () => {
    const { repositories, service } = createHarness({ accountStatus: "INVITED", passwordHash: null });
    vi.mocked(repositories.credentials.findByHashForUpdate).mockResolvedValue({
      id: "credential-id",
      personId,
      purpose: "ACTIVATION",
      tokenHash: "hashed-credential-token",
      expiresAt: new Date("2026-08-18T08:00:00Z"),
      consumedAt: null,
      revokedAt: null,
    });

    await service.consume({
      token: "raw-credential-token",
      purpose: "ACTIVATION",
      newPassword: "虚拟激活安全口令 2026",
      sourceIp: "192.0.2.50",
      userAgent: "virtual-test-agent",
      now,
      correlationId: "consume-activation",
    });

    expect(repositories.credentials.markConsumed).toHaveBeenCalledWith("credential-id", now);
    expect(repositories.people.updateStatus).toHaveBeenCalledWith(personId, "ACTIVE");
    expect(repositories.people.updatePassword).toHaveBeenCalledWith(
      expect.objectContaining({ personId, mustChangePassword: false }),
    );
    expect(repositories.sessions.revokeForPerson).toHaveBeenCalledWith(personId, now);
  });

  it("preserves the shared source-IP failure window after a successful credential use", async () => {
    const { repositories, service } = createHarness({ accountStatus: "INVITED", passwordHash: null });
    vi.mocked(repositories.credentials.findByHashForUpdate).mockResolvedValue({
      id: "credential-id",
      personId,
      purpose: "ACTIVATION",
      tokenHash: "hashed-credential-token",
      expiresAt: new Date("2026-08-18T08:00:00Z"),
      consumedAt: null,
      revokedAt: null,
    });

    await service.consume({
      token: "raw-credential-token",
      purpose: "ACTIVATION",
      newPassword: "虚拟激活安全口令 2026",
      sourceIp: "192.0.2.50",
      userAgent: "virtual-test-agent",
      now,
      correlationId: "consume-preserve-source-ip-window",
    });

    expect(repositories.rateLimits.clear).not.toHaveBeenCalledWith(
      "SOURCE_IP",
      "credential-ip-key",
    );
  });

  it.each([
    { consumedAt: now, revokedAt: null, expiresAt: new Date("2026-08-18T08:00:00Z") },
    { consumedAt: null, revokedAt: now, expiresAt: new Date("2026-08-18T08:00:00Z") },
    { consumedAt: null, revokedAt: null, expiresAt: new Date("2026-08-17T07:59:59Z") },
  ])("rejects consumed, revoked, or expired credentials with one generic code", async (state) => {
    const { repositories, service } = createHarness({ accountStatus: "INVITED", passwordHash: null });
    vi.mocked(repositories.credentials.findByHashForUpdate).mockResolvedValue({
      id: "credential-id",
      personId,
      purpose: "ACTIVATION",
      tokenHash: "hashed-credential-token",
      ...state,
    });

    await expect(service.consume({
      token: "raw-credential-token",
      purpose: "ACTIVATION",
      newPassword: "虚拟激活安全口令 2026",
      sourceIp: "192.0.2.50",
      userAgent: "virtual-test-agent",
      now,
      correlationId: "consume-invalid",
    })).rejects.toEqual(new CredentialServiceError("CREDENTIAL_INVALID"));
    expect(repositories.rateLimits.registerFailure).toHaveBeenCalledOnce();
    expect(repositories.people.updatePassword).not.toHaveBeenCalled();
  });

  it("rejects the current or one of the five recent passwords", async () => {
    const { repositories, service, passwordHasher } = createHarness();
    vi.mocked(repositories.sessions.findByTokenHash).mockResolvedValue(session());
    vi.mocked(repositories.sessions.findByIdForUpdate).mockResolvedValue(session());
    vi.mocked(repositories.passwordHistory.listRecentHashes).mockResolvedValue([
      "historical-hash-1",
      "historical-hash-2",
    ]);
    vi.mocked(passwordHasher.verify).mockImplementation(async (hash, password) =>
      password === "虚拟当前安全口令 2026"
        ? hash === "current-hash"
        : hash === "historical-hash-2",
    );

    await expect(service.changePassword({
      rawSessionToken: "raw-session-token",
      currentPassword: "虚拟当前安全口令 2026",
      newPassword: "虚拟最近历史安全口令 2026",
      now,
      correlationId: "password-reuse",
    })).rejects.toEqual(new CredentialServiceError("PASSWORD_REUSED"));
    expect(repositories.passwordHistory.listRecentHashes).toHaveBeenCalledWith(personId, 5);
    expect(repositories.people.updatePassword).not.toHaveBeenCalled();
  });

  it("changes the password and revokes every other session while retaining the current session", async () => {
    const { repositories, service, passwordHasher } = createHarness();
    vi.mocked(repositories.sessions.findByTokenHash).mockResolvedValue(session());
    vi.mocked(repositories.sessions.findByIdForUpdate).mockResolvedValue(session());
    vi.mocked(passwordHasher.verify).mockImplementation(async (hash, password) =>
      hash === "current-hash" && password === "虚拟当前安全口令 2026",
    );

    await service.changePassword({
      rawSessionToken: "raw-session-token",
      currentPassword: "虚拟当前安全口令 2026",
      newPassword: "全新虚拟安全口令 2026",
      now,
      correlationId: "password-change",
    });

    expect(repositories.passwordHistory.add).toHaveBeenCalledWith(personId, "current-hash", now);
    expect(repositories.passwordHistory.keepMostRecent).toHaveBeenCalledWith(personId, 5);
    expect(repositories.sessions.revokeForPerson).toHaveBeenCalledWith(personId, now, "session-id");
  });
});

function createHarness(personOverrides: Partial<PersonAuthRecord> = {}) {
  const personRecord = person(personOverrides);
  const repositories = {
    people: {
      findByLoginName: vi.fn(),
      findById: vi.fn(),
      findByIdForUpdate: vi.fn().mockResolvedValue(personRecord),
      listForManagement: vi.fn(),
      create: vi.fn(),
      updateStatus: vi.fn(),
      updatePassword: vi.fn(),
      updateLoginProtection: vi.fn(),
      recordLoginSuccess: vi.fn(),
    },
    credentials: {
      revokeOpen: vi.fn(),
      create: vi.fn().mockResolvedValue({
        id: "credential-id",
        personId,
        purpose: "ACTIVATION",
        tokenHash: "hashed-credential-token",
        expiresAt: new Date("2026-08-20T08:00:00Z"),
        consumedAt: null,
        revokedAt: null,
      }),
      findByHashForUpdate: vi.fn(),
      markConsumed: vi.fn(),
    },
    passwordHistory: {
      listRecentHashes: vi.fn().mockResolvedValue([]),
      add: vi.fn(),
      keepMostRecent: vi.fn(),
    },
    rateLimits: {
      findForUpdate: vi.fn().mockResolvedValue(null),
      registerFailure: vi.fn(),
      clear: vi.fn(),
    },
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
  const passwordHasher: PasswordHasher = {
    hash: vi.fn().mockResolvedValue("new-password-hash"),
    verify: vi.fn().mockResolvedValue(false),
  };
  const service = new CredentialService({
    unitOfWork,
    passwordHasher,
    keyHasher: {
      hashLoginName: vi.fn().mockReturnValue("login-key"),
      hashSourceIp: vi.fn().mockReturnValue("login-ip-key"),
      hashCredentialSourceIp: vi.fn().mockReturnValue("credential-ip-key"),
    },
    tokenCodec: {
      generate: vi.fn().mockReturnValue({
        rawToken: "raw-credential-token",
        tokenHash: "hashed-credential-token",
      }),
      hash: vi.fn((token: string) => token === "raw-session-token"
        ? "hashed-session-token"
        : "hashed-credential-token"),
    },
  });
  return { repositories, service, passwordHasher };
}

function person(overrides: Partial<PersonAuthRecord> = {}): PersonAuthRecord {
  return {
    id: personId,
    loginName: "virtual-user",
    displayName: "虚拟用户",
    passwordHash: "current-hash",
    accountStatus: "ACTIVE" as const,
    mustChangePassword: false,
    failedLoginCount: 0,
    failedLoginWindowStartedAt: null,
    lockedUntil: null,
    passwordChangedAt: new Date("2026-08-16T08:00:00Z"),
    ...overrides,
  };
}

function session() {
  return {
    id: "session-id",
    personId,
    tokenHash: "hashed-session-token",
    activeRoleCode: "PMO" as const,
    expiresAt: new Date("2026-08-17T20:00:00Z"),
    revokedAt: null,
    createdAt: now,
    lastSeenAt: new Date("2026-08-17T07:50:00Z"),
  };
}
