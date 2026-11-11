import { describe, expect, it, vi } from "vitest";

import {
  PmoManagementError,
  PmoManagementService,
  type AuthRepositories,
  type AuthUnitOfWork,
} from "../src/index.js";

const now = new Date("2026-08-17T08:00:00Z");
const pmoId = "00000000-0000-4000-8000-000000000001";

describe("PmoManagementService", () => {
  it("rejects management when the authoritative session has no active PMO role", async () => {
    const { repositories, service } = createHarness();
    vi.mocked(repositories.sessions.findByTokenHash).mockResolvedValue({
      ...activeSession(),
      activeRoleCode: "DEAN",
    });
    await expect(service.list("raw-session-token", now))
      .rejects.toEqual(new PmoManagementError("UNAUTHORIZED"));
    expect(repositories.people.listForManagement).not.toHaveBeenCalled();
  });

  it("creates an invited account without a password or automatic role", async () => {
    const { repositories, service } = createHarness();
    await service.createInvitedAccount({
      rawSessionToken: "raw-session-token",
      loginName: " Virtual-Invitee ",
      displayName: "虚拟受邀用户",
      now,
      correlationId: "create-invitee",
    });
    expect(repositories.people.create).toHaveBeenCalledWith({
      loginName: "virtual-invitee",
      displayName: "虚拟受邀用户",
      passwordHash: null,
      accountStatus: "INVITED",
      mustChangePassword: true,
    });
    expect(repositories.roles.create).not.toHaveBeenCalled();
  });

  it("returns specific validation and duplicate-login errors", async () => {
    const { repositories, service } = createHarness();
    await expect(service.createInvitedAccount({ rawSessionToken: "raw-session-token", loginName: "bad name", displayName: "虚构用户", now, correlationId: "invalid-login" }))
      .rejects.toEqual(new PmoManagementError("LOGIN_NAME_INVALID"));
    await expect(service.createInvitedAccount({ rawSessionToken: "raw-session-token", loginName: "valid-login", displayName: " ", now, correlationId: "invalid-display" }))
      .rejects.toEqual(new PmoManagementError("DISPLAY_NAME_INVALID"));
    vi.mocked(repositories.people.findByLoginName).mockResolvedValue({
      id: pmoId,
      loginName: "valid-login",
      displayName: "既有虚构用户",
      passwordHash: null,
      accountStatus: "INVITED",
      mustChangePassword: true,
      failedLoginCount: 0,
      failedLoginWindowStartedAt: null,
      lockedUntil: null,
      passwordChangedAt: null,
    });
    await expect(service.createInvitedAccount({ rawSessionToken: "raw-session-token", loginName: "valid-login", displayName: "虚构用户", now, correlationId: "duplicate-login" }))
      .rejects.toEqual(new PmoManagementError("LOGIN_NAME_DUPLICATE"));
    expect(repositories.people.create).not.toHaveBeenCalled();
  });

  it("maps a concurrent repository duplicate across package boundaries", async () => {
    const { repositories, service } = createHarness();
    vi.mocked(repositories.people.findByLoginName).mockResolvedValue(null);
    vi.mocked(repositories.people.create).mockRejectedValue(Object.assign(new Error("bundled repository error"), {
      code: "LOGIN_NAME_DUPLICATE",
    }));

    await expect(service.createInvitedAccount({
      rawSessionToken: "raw-session-token",
      loginName: "valid-login",
      displayName: "虚构并发账号",
      now,
      correlationId: "concurrent-duplicate",
    })).rejects.toEqual(new PmoManagementError("LOGIN_NAME_DUPLICATE"));
  });

  it("returns a one-time raw credential while persisting only its hash", async () => {
    const { repositories, service } = createHarness({ accountStatus: "INVITED", passwordHash: null });
    await expect(service.issueCredential({
      rawSessionToken: "raw-session-token",
      targetPersonId: pmoId,
      purpose: "ACTIVATION",
      now,
      correlationId: "issue-credential",
    })).resolves.toMatchObject({ token: "raw-one-time-token" });
    expect(repositories.credentials.create).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: "hashed-one-time-token" }),
    );
  });

  it("retains the last available PMO under a status change", async () => {
    const { repositories, service } = createHarness();
    vi.mocked(repositories.roles.countAvailablePmosForUpdate).mockResolvedValue(1);
    await expect(service.changeAccountStatus({
      rawSessionToken: "raw-session-token",
      targetPersonId: pmoId,
      operation: "DISABLE",
      now,
      correlationId: "disable-last-pmo",
    })).rejects.toEqual(new PmoManagementError("LAST_AVAILABLE_PMO"));
    expect(repositories.people.updateStatus).not.toHaveBeenCalled();
  });

  it("rejects disabling a current primary Key Sub-I before handover", async () => {
    const { repositories, service } = createHarness();
    vi.mocked(repositories.roles.personHasActiveGlobalPmo).mockResolvedValue(false);
    vi.mocked(repositories.roles.personHasActivePrimaryKeySubIForUpdate).mockResolvedValue(true);
    await expect(service.changeAccountStatus({
      rawSessionToken: "raw-session-token",
      targetPersonId: pmoId,
      operation: "DISABLE",
      now,
      correlationId: "disable-primary-key-sub-i",
    })).rejects.toEqual(new PmoManagementError("PRIMARY_KEY_SUB_I_HANDOVER_REQUIRED"));
    expect(repositories.people.updateStatus).not.toHaveBeenCalled();
  });

  it("rejects a project role grant when the project is archived", async () => {
    const { repositories, service } = createHarness();
    vi.mocked(repositories.roles.projectIsAssignableForUpdate).mockResolvedValue(false);
    await expect(service.grantRole({
      rawSessionToken: "raw-session-token",
      targetPersonId: pmoId,
      roleCode: "CRC",
      projectId: "20000000-0000-4000-8000-000000000001",
      now,
      correlationId: "grant-archived-project",
    })).rejects.toEqual(new PmoManagementError("PROJECT_NOT_ASSIGNABLE"));
    expect(repositories.roles.create).not.toHaveBeenCalled();
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

    await expect(service.endRole({
      rawSessionToken: "raw-session-token",
      assignmentId: "80000000-0000-4000-8000-000000000002",
      now,
      correlationId: "end-primary-key-sub-i",
    })).rejects.toEqual(new PmoManagementError("PRIMARY_KEY_SUB_I_HANDOVER_REQUIRED"));
    expect(repositories.roles.end).not.toHaveBeenCalled();
  });

  it("grants and audits Key Sub-I application eligibility separately from project roles", async () => {
    const { repositories, service } = createHarness();
    await service.grantKeySubIEligibility({
      rawSessionToken: "raw-session-token",
      targetPersonId: pmoId,
      reason: "承担虚构项目申请职责",
      now,
      correlationId: "grant-eligibility",
    });
    expect(repositories.roles.createEligibility).toHaveBeenCalledWith(expect.objectContaining({
      personId: pmoId,
      grantedByPersonId: pmoId,
      reason: "承担虚构项目申请职责",
    }));
    expect(repositories.roles.create).not.toHaveBeenCalled();
    expect(repositories.audit.append).toHaveBeenCalledWith(expect.objectContaining({
      actionCode: "KEY_SUB_I_ELIGIBILITY_GRANTED",
    }));
  });

  it("ends eligibility without ending existing project assignments", async () => {
    const { repositories, service } = createHarness();
    await service.endKeySubIEligibility({
      rawSessionToken: "raw-session-token",
      eligibilityId: "90000000-0000-4000-8000-000000000001",
      now,
      correlationId: "end-eligibility",
    });
    expect(repositories.roles.endEligibility).toHaveBeenCalled();
    expect(repositories.roles.end).not.toHaveBeenCalled();
  });
});

function createHarness(personOverrides: Record<string, unknown> = {}) {
  const actor = {
    id: pmoId,
    loginName: "virtual-pmo",
    displayName: "虚拟 PMO",
    passwordHash: "virtual-hash",
    accountStatus: "ACTIVE" as const,
    mustChangePassword: false,
    failedLoginCount: 0,
    failedLoginWindowStartedAt: null,
    lockedUntil: null,
    passwordChangedAt: now,
  };
  const person = { ...actor, ...personOverrides };
  const repositories = {
    people: {
      findByLoginName: vi.fn(),
      findById: vi.fn().mockResolvedValue(actor),
      findByIdForUpdate: vi.fn().mockResolvedValue(person),
      listForManagement: vi.fn().mockResolvedValue([person]),
      create: vi.fn().mockResolvedValue(person),
      updateStatus: vi.fn(),
      updatePassword: vi.fn(),
      updateLoginProtection: vi.fn(),
      recordLoginSuccess: vi.fn(),
    },
    credentials: {
      revokeOpen: vi.fn(),
      create: vi.fn().mockResolvedValue({
        id: "credential-id",
        personId: pmoId,
        purpose: "ACTIVATION",
        tokenHash: "hashed-one-time-token",
        expiresAt: new Date("2026-08-20T08:00:00Z"),
        consumedAt: null,
        revokedAt: null,
      }),
      findByHashForUpdate: vi.fn(),
      markConsumed: vi.fn(),
    },
    passwordHistory: { listRecentHashes: vi.fn(), add: vi.fn(), keepMostRecent: vi.fn() },
    rateLimits: { findForUpdate: vi.fn(), registerFailure: vi.fn(), clear: vi.fn() },
    sessions: {
      create: vi.fn(),
      findByTokenHash: vi.fn().mockResolvedValue(activeSession()),
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
      hasProjectAccess: vi.fn(),
      listVisibleProjectIds: vi.fn(),
      listForManagement: vi.fn().mockResolvedValue([]),
      listAssignableProjects: vi.fn().mockResolvedValue([]),
      countAvailablePmosForUpdate: vi.fn().mockResolvedValue(2),
      personHasActiveGlobalPmo: vi.fn().mockResolvedValue(true),
      personHasActivePrimaryKeySubIForUpdate: vi.fn().mockResolvedValue(false),
      projectIsAssignableForUpdate: vi.fn().mockResolvedValue(true),
      create: vi.fn(),
      findByIdForUpdate: vi.fn(),
      findSystemBootstrapPmoForUpdate: vi.fn(),
      end: vi.fn(),
      listEligibilityForManagement: vi.fn().mockResolvedValue([]),
      createEligibility: vi.fn().mockResolvedValue({
        id: "90000000-0000-4000-8000-000000000001",
        personId: pmoId,
        roleCode: "KEY_SUB_I",
        status: "ACTIVE",
        reason: "承担虚构项目申请职责",
      }),
      findEligibilityByIdForUpdate: vi.fn().mockResolvedValue({
        id: "90000000-0000-4000-8000-000000000001",
        personId: pmoId,
        roleCode: "KEY_SUB_I",
        status: "ACTIVE",
        reason: "承担虚构项目申请职责",
      }),
      endEligibility: vi.fn(),
    },
    audit: { append: vi.fn() },
  } satisfies AuthRepositories;
  const unitOfWork: AuthUnitOfWork = { run: async (operation) => operation(repositories) };
  return {
    repositories,
    service: new PmoManagementService({
      unitOfWork,
      tokenCodec: {
        generate: vi.fn().mockReturnValue({ rawToken: "raw-one-time-token", tokenHash: "hashed-one-time-token" }),
        hash: vi.fn().mockReturnValue("hashed-session-token"),
      },
    }),
  };
}

function activeSession() {
  return {
    id: "session-id",
    personId: pmoId,
    tokenHash: "hashed-session-token",
    activeRoleCode: "PMO" as const,
    expiresAt: new Date("2026-08-17T20:00:00Z"),
    revokedAt: null,
    createdAt: now,
    lastSeenAt: new Date("2026-08-17T07:50:00Z"),
  };
}
