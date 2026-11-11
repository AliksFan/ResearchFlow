import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AccountAdministrationService,
  Argon2idPasswordHasher,
  AuthenticationService,
  AuthDomainError,
  CredentialService,
  CredentialServiceError,
  DefaultPmoBootstrapService,
  HmacAuthKeyHasher,
  PmoManagementError,
  PmoManagementService,
  Sha256SessionTokenCodec,
} from "@researchflow/auth";

import {
  createAuthRepositories,
  createPrismaClient,
  PrismaAuthUnitOfWork,
  type ApplicationPrismaClient,
} from "../../src/index.js";

const stage6IntegrationEnabled = process.env.RF_PHASE2_STAGE6_TEST_DATABASE === "1";
const explicitIntegrationSchema = process.env.RF_REPOSITORY_TEST_SCHEMA?.trim();
const integrationEnabled = process.env.RF_AUTH_REPOSITORY_TEST_DATABASE === "1" || stage6IntegrationEnabled || Boolean(explicitIntegrationSchema);
const expectedSchema = explicitIntegrationSchema || "p2_s6_repository_v1";

class RollbackFixture extends Error {}

describe.runIf(integrationEnabled)("Prisma authentication repositories", () => {
  let client: ApplicationPrismaClient;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const url = new URL(databaseUrl);
    if ((stage6IntegrationEnabled || explicitIntegrationSchema) && (
      url.hostname !== "127.0.0.1" ||
      url.port !== "55434" ||
      url.pathname !== "/researchflow_validation_1" ||
      url.searchParams.get("schema") !== expectedSchema ||
      !/^(?:p2_[a-z0-9_]+|formal_web_[a-z0-9_]+|prod_pilot_[a-z0-9_]+)$/u.test(expectedSchema)
    )) throw new Error(`Refusing auth integration test outside ${expectedSchema}`);
    client = createPrismaClient(databaseUrl);
    if (stage6IntegrationEnabled || explicitIntegrationSchema) {
      const identity = await client.$queryRaw<Array<{ databaseName: string; schemaName: string }>>`
        SELECT current_database() AS "databaseName", current_schema() AS "schemaName"
      `;
      expect(identity).toEqual([{ databaseName: "researchflow_validation_1", schemaName: expectedSchema }]);
    }
  });

  afterAll(async () => {
    if (client) await client.$disconnect();
  });

  it("rolls back all repository writes when the unit of work fails", async () => {
    const unitOfWork = new PrismaAuthUnitOfWork(client);
    const loginName = "repository-rollback-test";

    await expect(
      unitOfWork.run(async ({ people }) => {
        await people.create({
          loginName,
          displayName: "虚拟回滚账号",
          passwordHash: null,
          accountStatus: "INVITED",
          mustChangePassword: true,
        });
        throw new RollbackFixture();
      }),
    ).rejects.toBeInstanceOf(RollbackFixture);

    await expect(
      client.person.findUnique({ where: { loginName }, select: { id: true } }),
    ).resolves.toBeNull();
  });

  it("limits project-role visibility in the database query and locks PMO availability", async () => {
    await expectRollback(
      client.$transaction(async (transaction) => {
        const repositories = createAuthRepositories(transaction);
        const pmoId = "11000000-0000-4000-8000-000000000001";
        const keySubIId = "11000000-0000-4000-8000-000000000002";
        const projectIds = [
          "12000000-0000-4000-8000-000000000001",
          "12000000-0000-4000-8000-000000000002",
        ];

        await transaction.person.createMany({
          data: [
            {
              id: pmoId,
              loginName: "repository-virtual-pmo",
              displayName: "虚拟 Repository PMO",
              passwordHash: "virtual-hash",
              accountStatus: "ACTIVE",
              mustChangePassword: false,
            },
            {
              id: keySubIId,
              loginName: "repository-virtual-key-sub-i",
              displayName: "虚拟 Repository Key Sub-I",
              passwordHash: "virtual-hash",
              accountStatus: "ACTIVE",
              mustChangePassword: false,
            },
          ],
        });

        const dictionarySpecs = [
          ["DISEASE_AREA", "13000000-0000-4000-8000-000000000001", "14000000-0000-4000-8000-000000000001"],
          ["RESEARCH_TYPE", "13000000-0000-4000-8000-000000000002", "14000000-0000-4000-8000-000000000002"],
        ] as const;
        for (const [code, dictionaryId, optionId] of dictionarySpecs) {
          await transaction.dictionary.create({
            data: {
              id: dictionaryId,
              dictionaryCode: code,
              dictionaryName: `虚拟 ${code}`,
              description: "仅用于 Repository 集成测试",
              options: {
                create: {
                  id: optionId,
                  optionCode: "VIRTUAL",
                  displayName: "虚拟选项",
                },
              },
            },
          });
        }

        for (const [index, projectId] of projectIds.entries()) {
          await transaction.project.create({
            data: {
              id: projectId,
              applicationCode: `APP-${9001 + index}`,
              projectName: `虚拟范围项目 ${index + 1}`,
              projectSummary: "仅用于 Repository 范围测试",
              applicantPersonId: keySubIId,
              diseaseAreaOptionId: dictionarySpecs[0][2],
              researchTypeOptionId: dictionarySpecs[1][2],
              ...(index === 1 ? {
                status: "ARCHIVED" as const,
                normalizedNameOccupancy: "虚拟范围项目 2",
                projectCode: "DEMO-9002",
                establishedByPersonId: pmoId,
                establishedAt: new Date(),
                plannedStartDate: new Date("2026-01-01T00:00:00.000Z"),
                plannedEndDate: new Date("2026-12-31T00:00:00.000Z"),
                completedAt: new Date(),
                archivedAt: new Date(),
              } : {}),
            },
          });
        }

        await expect(transaction.project.update({
          where: { id: projectIds[0] },
          data: { projectName: "虚拟范围项目 1（已更新）" },
          select: { projectName: true },
        })).resolves.toEqual({ projectName: "虚拟范围项目 1（已更新）" });

        await transaction.roleAssignment.createMany({
          data: [
            {
              id: "15000000-0000-4000-8000-000000000001",
              personId: pmoId,
              roleCode: "PMO",
              projectId: null,
              assignmentStatus: "ACTIVE",
              isPrimary: false,
              grantSource: "PMO_ACTION",
              grantedByPersonId: pmoId,
              activatedAt: new Date(),
            },
            {
              id: "15000000-0000-4000-8000-000000000002",
              personId: keySubIId,
              roleCode: "KEY_SUB_I",
              projectId: projectIds[0],
              assignmentStatus: "ACTIVE",
              isPrimary: true,
              grantSource: "PMO_ACTION",
              grantedByPersonId: pmoId,
              activatedAt: new Date(),
            },
          ],
        });

        await expect(
          repositories.roles.listVisibleProjectIds(keySubIId, "KEY_SUB_I"),
        ).resolves.toEqual([projectIds[0]]);
        await expect(
          repositories.roles.listVisibleProjectIds(pmoId, "PMO"),
        ).resolves.toEqual(expect.arrayContaining(projectIds));
        await expect(repositories.roles.hasProjectAccess({
          personId: keySubIId,
          roleCode: "KEY_SUB_I",
          projectId: projectIds[0],
        })).resolves.toBe(true);
        await expect(repositories.roles.hasProjectAccess({
          personId: keySubIId,
          roleCode: "KEY_SUB_I",
          projectId: projectIds[1],
        })).resolves.toBe(false);
        await expect(repositories.roles.hasProjectAccess({
          personId: pmoId,
          roleCode: "PMO",
          projectId: projectIds[1],
        })).resolves.toBe(true);
        await expect(
          repositories.roles.personHasActivePrimaryKeySubIForUpdate(keySubIId),
        ).resolves.toBe(true);
        await expect(
          repositories.roles.findByIdForUpdate("15000000-0000-4000-8000-000000000002"),
        ).resolves.toMatchObject({
          roleCode: "KEY_SUB_I",
          assignmentStatus: "ACTIVE",
          isPrimary: true,
        });
        await expect(repositories.roles.listForManagement()).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: "15000000-0000-4000-8000-000000000002",
              isPrimary: true,
            }),
          ]),
        );
        await expect(
          repositories.roles.countAvailablePmosForUpdate(new Date()),
        ).resolves.toBe(1);

        await expect(
          repositories.roles.projectIsAssignableForUpdate(projectIds[0]),
        ).resolves.toBe(true);
        await expect(
          repositories.roles.projectIsAssignableForUpdate(projectIds[1]),
        ).resolves.toBe(false);
        await expect(repositories.roles.listAssignableProjects()).resolves.not.toEqual(
          expect.arrayContaining([expect.objectContaining({ id: projectIds[1] })]),
        );

        throw new RollbackFixture();
      }),
    );
  });

  it("serializes concurrent PMO removals so one available PMO remains", async () => {
    const pmoIds = [
      "16000000-0000-4000-8000-000000000001",
      "16000000-0000-4000-8000-000000000002",
    ] as const;
    const assignmentIds = [
      "17000000-0000-4000-8000-000000000001",
      "17000000-0000-4000-8000-000000000002",
    ] as const;
    try {
      await client.person.createMany({
        data: pmoIds.map((id, index) => ({
          id,
          loginName: `concurrent-virtual-pmo-${index + 1}`,
          displayName: `并发虚拟 PMO ${index + 1}`,
          passwordHash: "virtual-hash",
          accountStatus: "ACTIVE" as const,
          mustChangePassword: false,
        })),
      });
      await client.roleAssignment.createMany({
        data: [
          {
            id: assignmentIds[0],
            personId: pmoIds[0],
            roleCode: "PMO",
            projectId: null,
            assignmentStatus: "ACTIVE",
            isPrimary: false,
            grantSource: "PMO_ACTION",
            grantedByPersonId: pmoIds[0],
            activatedAt: new Date(),
          },
          {
            id: assignmentIds[1],
            personId: pmoIds[1],
            roleCode: "PMO",
            projectId: null,
            assignmentStatus: "ACTIVE",
            isPrimary: false,
            grantSource: "PMO_ACTION",
            grantedByPersonId: pmoIds[0],
            activatedAt: new Date(),
          },
        ],
      });

      const service = new AccountAdministrationService(
        new PrismaAuthUnitOfWork(client),
      );
      const results = await Promise.allSettled(
        pmoIds.map((targetPersonId, index) =>
          service.changeAccountStatus({
            actorPersonId: pmoIds[0],
            actorRoleCode: "PMO",
            targetPersonId,
            operation: "DISABLE",
            correlationId: `concurrent-pmo-removal-${index + 1}`,
            now: new Date(),
          }),
        ),
      );

      const diagnostic = results.map((result) =>
        result.status === "fulfilled"
          ? { status: result.status }
          : {
              status: result.status,
              reason:
                result.reason instanceof Error
                  ? `${result.reason.name}:${result.reason.message}`
                  : String(result.reason),
            },
      );
      expect(
        results.filter(({ status }) => status === "fulfilled"),
        JSON.stringify(diagnostic),
      ).toHaveLength(1);
      const rejection = results.find(({ status }) => status === "rejected");
      expect(rejection).toMatchObject({
        status: "rejected",
        reason: new AuthDomainError("LAST_AVAILABLE_PMO"),
      });
      await expect(
        client.person.count({
          where: {
            id: { in: [...pmoIds] },
            accountStatus: "ACTIVE",
            roleAssignments: {
              some: {
                roleCode: "PMO",
                projectId: null,
                assignmentStatus: "ACTIVE",
              },
            },
          },
        }),
      ).resolves.toBe(1);
    } finally {
      await client.auditLog.deleteMany({
        where: { actorPersonId: { in: [...pmoIds] } },
      });
      await client.roleAssignment.deleteMany({
        where: { id: { in: [...assignmentIds] } },
      });
      await client.person.deleteMany({ where: { id: { in: [...pmoIds] } } });
    }
  });

  it("seeds the default pmo idempotently without overwriting its password hash", async () => {
    const existing = await client.person.findUnique({
      where: { loginName: "pmo" },
      select: { id: true },
    });
    if (existing) {
      throw new Error("Refusing seed integration test because pmo already exists");
    }

    let personId: string | undefined;
    try {
      const service = new DefaultPmoBootstrapService(
        new PrismaAuthUnitOfWork(client),
        new Argon2idPasswordHasher(),
      );
      await service.run({
        initialPassword: "虚拟默认管理员初始口令 2026",
        correlationId: "default-pmo-seed-first",
        now: new Date(),
      });
      const first = await client.person.findUniqueOrThrow({
        where: { loginName: "pmo" },
        select: { id: true, passwordHash: true, mustChangePassword: true },
      });
      personId = first.id;
      const firstAssignment = await client.roleAssignment.findFirstOrThrow({
        where: { personId: first.id, grantSource: "SYSTEM_BOOTSTRAP" },
        select: { id: true },
      });

      await service.run({
        initialPassword: "不同的虚拟默认管理员初始口令 2026",
        correlationId: "default-pmo-seed-repeat",
        now: new Date(),
      });
      const repeated = await client.person.findUniqueOrThrow({
        where: { loginName: "pmo" },
        select: { passwordHash: true, mustChangePassword: true },
      });
      const assignments = await client.roleAssignment.findMany({
        where: { personId: first.id, grantSource: "SYSTEM_BOOTSTRAP" },
        select: { id: true },
      });

      expect(repeated.passwordHash).toBe(first.passwordHash);
      expect(repeated.mustChangePassword).toBe(true);
      expect(assignments).toEqual([{ id: firstAssignment.id }]);
    } finally {
      if (personId) {
        await client.auditLog.deleteMany({ where: { entityId: personId } });
        await client.roleAssignment.deleteMany({ where: { personId } });
        await client.person.delete({ where: { id: personId } });
      }
    }
  });

  it("creates and authoritatively revokes database sessions with atomic login limits", async () => {
    const personId = "18000000-0000-4000-8000-000000000001";
    const assignmentId = "19000000-0000-4000-8000-000000000001";
    const loginName = "integration-auth-user";
    const password = "虚拟集成认证安全口令 2026";
    const hasher = new Argon2idPasswordHasher();
    const keyHasher = new HmacAuthKeyHasher("integration-hmac-secret-value-0001");
    const tokenCodec = new Sha256SessionTokenCodec();
    const dummyPasswordHash = await hasher.hash("虚拟恒定时间占位安全口令 2026");
    try {
      await client.person.create({
        data: {
          id: personId,
          loginName,
          displayName: "虚拟集成认证用户",
          passwordHash: await hasher.hash(password),
          accountStatus: "ACTIVE",
          mustChangePassword: false,
        },
      });
      await client.roleAssignment.create({
        data: {
          id: assignmentId,
          personId,
          roleCode: "PMO",
          projectId: null,
          assignmentStatus: "ACTIVE",
          isPrimary: false,
          grantSource: "PMO_ACTION",
          grantedByPersonId: personId,
          activatedAt: new Date(),
        },
      });
      const service = new AuthenticationService({
        unitOfWork: new PrismaAuthUnitOfWork(client),
        passwordHasher: hasher,
        keyHasher,
        tokenCodec,
        dummyPasswordHash,
      });

      const login = await service.login({
        loginName,
        password,
        sourceIp: null,
        userAgent: "virtual-integration-agent",
        now: new Date(),
        correlationId: "integration-login-success",
      });
      expect(login).toMatchObject({ ok: true, personId });
      if (!login.ok) throw new Error("Expected integration login to succeed");
      await expect(client.auditLog.findFirst({
        where: { correlationId: "integration-login-success" },
        select: { ipAddress: true },
      })).resolves.toEqual({ ipAddress: null });
      await expect(
        service.validateSession(login.sessionToken, new Date()),
      ).resolves.toMatchObject({ authenticated: true, personId });

      let newestLogin = login;
      for (let index = 0; index < 5; index += 1) {
        const additionalLogin = await service.login({
          loginName,
          password,
          sourceIp: `192.0.2.${50 + index}`,
          userAgent: "virtual-integration-agent",
          now: new Date(Date.now() + 100 + index),
          correlationId: `integration-login-session-cap-${index + 1}`,
        });
        expect(additionalLogin).toMatchObject({ ok: true, personId });
        if (!additionalLogin.ok) throw new Error("Expected additional login to succeed");
        newestLogin = additionalLogin;
      }
      await expect(client.session.count({
        where: { personId, revokedAt: null, expiresAt: { gt: new Date() } },
      })).resolves.toBe(5);
      await expect(
        service.validateSession(login.sessionToken, new Date()),
      ).resolves.toEqual({ authenticated: false, code: "SESSION_REVOKED" });

      await client.session.update({
        where: { id: newestLogin.sessionId },
        data: { revokedAt: new Date() },
      });
      await expect(
        service.validateSession(newestLogin.sessionToken, new Date()),
      ).resolves.toEqual({ authenticated: false, code: "SESSION_REVOKED" });

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await expect(
          service.login({
            loginName,
            password: "虚拟错误集成认证口令 2026",
            sourceIp: "192.0.2.41",
            userAgent: "virtual-integration-agent",
            now: new Date(Date.now() + attempt),
            correlationId: `integration-login-failure-${attempt}`,
          }),
        ).resolves.toEqual({ ok: false, code: "AUTHENTICATION_FAILED" });
      }
      const protectedPerson = await client.person.findUniqueOrThrow({
        where: { id: personId },
        select: { failedLoginCount: true, lockedUntil: true },
      });
      expect(protectedPerson.failedLoginCount).toBe(5);
      expect(protectedPerson.lockedUntil).not.toBeNull();
    } finally {
      await client.auditLog.deleteMany({
        where: { correlationId: { startsWith: "integration-login-" } },
      });
      await client.session.deleteMany({ where: { personId } });
      await client.authRateLimit.deleteMany({
        where: {
          keyHash: {
            in: [
              keyHasher.hashLoginName(loginName),
              keyHasher.hashSourceIp("192.0.2.40"),
              keyHasher.hashSourceIp("192.0.2.41"),
            ],
          },
        },
      });
      await client.roleAssignment.deleteMany({ where: { id: assignmentId } });
      await client.person.deleteMany({ where: { id: personId } });
    }
  });

  it("consumes one-time credentials atomically and enforces password history", async () => {
    const personId = "1a000000-0000-4000-8000-000000000001";
    const loginName = "integration-credential-user";
    const initialPassword = "虚拟激活初始安全口令 2026";
    const nextPassword = "虚拟更新后安全口令 2026";
    const hasher = new Argon2idPasswordHasher();
    const keyHasher = new HmacAuthKeyHasher("integration-credential-hmac-secret-001");
    const tokenCodec = new Sha256SessionTokenCodec();
    try {
      await client.person.create({
        data: {
          id: personId,
          loginName,
          displayName: "虚拟凭证集成用户",
          passwordHash: null,
          accountStatus: "INVITED",
          mustChangePassword: true,
        },
      });
      const credentialService = new CredentialService({
        unitOfWork: new PrismaAuthUnitOfWork(client),
        passwordHasher: hasher,
        keyHasher,
        tokenCodec,
      });
      const first = await credentialService.issue({
        actorPersonId: personId,
        actorRoleCode: "PMO",
        targetPersonId: personId,
        purpose: "ACTIVATION",
        now: new Date(),
        correlationId: "integration-credential-issue-first",
      });
      const second = await credentialService.issue({
        actorPersonId: personId,
        actorRoleCode: "PMO",
        targetPersonId: personId,
        purpose: "ACTIVATION",
        now: new Date(),
        correlationId: "integration-credential-issue-second",
      });
      await expect(credentialService.consume({
        token: first.token,
        purpose: "ACTIVATION",
        newPassword: initialPassword,
        sourceIp: "192.0.2.70",
        userAgent: "virtual-integration-agent",
        now: new Date(),
        correlationId: "integration-credential-revoked-token",
      })).rejects.toEqual(new CredentialServiceError("CREDENTIAL_INVALID"));
      await expect(client.authRateLimit.count({
        where: { keyHash: keyHasher.hashCredentialSourceIp("192.0.2.70") },
      })).resolves.toBe(1);

      await credentialService.consume({
        token: second.token,
        purpose: "ACTIVATION",
        newPassword: initialPassword,
        sourceIp: "192.0.2.71",
        userAgent: "virtual-integration-agent",
        now: new Date(),
        correlationId: "integration-credential-activation-success",
      });
      const activated = await client.person.findUniqueOrThrow({
        where: { id: personId },
        select: { accountStatus: true, passwordHash: true, mustChangePassword: true },
      });
      expect(activated).toMatchObject({ accountStatus: "ACTIVE", mustChangePassword: false });
      expect(activated.passwordHash).not.toBe(initialPassword);
      await expect(client.authCredentialToken.findUnique({
        where: { tokenHash: tokenCodec.hash(second.token) },
        select: { consumedAt: true },
      })).resolves.toMatchObject({ consumedAt: expect.any(Date) });

      const authenticationService = new AuthenticationService({
        unitOfWork: new PrismaAuthUnitOfWork(client),
        passwordHasher: hasher,
        keyHasher,
        tokenCodec,
        dummyPasswordHash: await hasher.hash("虚拟恒定时间占位安全口令 2026"),
      });
      const login = await authenticationService.login({
        loginName,
        password: initialPassword,
        sourceIp: "192.0.2.72",
        userAgent: "virtual-integration-agent",
        now: new Date(),
        correlationId: "integration-credential-login",
      });
      if (!login.ok) throw new Error("Expected activated account login to succeed");
      await credentialService.changePassword({
        rawSessionToken: login.sessionToken,
        currentPassword: initialPassword,
        newPassword: nextPassword,
        now: new Date(),
        correlationId: "integration-credential-password-change",
      });
      await expect(credentialService.changePassword({
        rawSessionToken: login.sessionToken,
        currentPassword: nextPassword,
        newPassword: initialPassword,
        now: new Date(),
        correlationId: "integration-credential-password-reuse",
      })).rejects.toEqual(new CredentialServiceError("PASSWORD_REUSED"));
      await expect(client.passwordHistory.count({ where: { personId } })).resolves.toBe(1);
    } finally {
      await client.auditLog.deleteMany({
        where: { correlationId: { startsWith: "integration-credential-" } },
      });
      await client.session.deleteMany({ where: { personId } });
      await client.passwordHistory.deleteMany({ where: { personId } });
      await client.authCredentialToken.deleteMany({ where: { personId } });
      await client.authRateLimit.deleteMany({
        where: {
          keyHash: {
            in: [
              keyHasher.hashCredentialSourceIp("192.0.2.70"),
              keyHasher.hashCredentialSourceIp("192.0.2.71"),
              keyHasher.hashLoginName(loginName),
              keyHasher.hashSourceIp("192.0.2.72"),
            ],
          },
        },
      });
      await client.person.deleteMany({ where: { id: personId } });
    }
  });

  it("revalidates the PMO session and role in each management transaction", async () => {
    const personIds = [
      "1b000000-0000-4000-8000-000000000001",
      "1b000000-0000-4000-8000-000000000002",
    ] as const;
    const assignmentIds = [
      "1c000000-0000-4000-8000-000000000001",
      "1c000000-0000-4000-8000-000000000002",
    ] as const;
    const sessionIds = [
      "1d000000-0000-4000-8000-000000000001",
      "1d000000-0000-4000-8000-000000000002",
    ] as const;
    const rawTokens = ["integration-pmo-session-one", "integration-pmo-session-two"] as const;
    const tokenCodec = new Sha256SessionTokenCodec();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
    try {
      await client.person.createMany({
        data: personIds.map((id, index) => ({
          id,
          loginName: `integration-pmo-management-${index + 1}`,
          displayName: `虚拟事务 PMO ${index + 1}`,
          passwordHash: "virtual-hash",
          accountStatus: "ACTIVE" as const,
          mustChangePassword: false,
        })),
      });
      await client.roleAssignment.createMany({
        data: personIds.map((personId, index) => ({
          id: assignmentIds[index],
          personId,
          roleCode: "PMO" as const,
          projectId: null,
          assignmentStatus: "ACTIVE" as const,
          isPrimary: false,
          grantSource: "PMO_ACTION" as const,
          grantedByPersonId: personIds[0],
          activatedAt: now,
        })),
      });
      await client.session.createMany({
        data: personIds.map((personId, index) => ({
          id: sessionIds[index],
          personId,
          tokenHash: tokenCodec.hash(rawTokens[index]),
          activeRoleCode: "PMO" as const,
          expiresAt,
          lastSeenAt: now,
        })),
      });

      const firstService = new PmoManagementService({
        unitOfWork: new PrismaAuthUnitOfWork(client),
        tokenCodec,
      });
      const secondService = new PmoManagementService({
        unitOfWork: new PrismaAuthUnitOfWork(client),
        tokenCodec,
      });
      await expect(firstService.list(rawTokens[0], now)).resolves.toMatchObject({
        people: expect.any(Array),
      });

      await secondService.endRole({
        rawSessionToken: rawTokens[1],
        assignmentId: assignmentIds[0],
        now: new Date(now.getTime() + 1_000),
        correlationId: "integration-pmo-management-end-first",
      });
      await expect(firstService.list(rawTokens[0], new Date(now.getTime() + 2_000)))
        .rejects.toEqual(new PmoManagementError("UNAUTHORIZED"));
      await expect(secondService.endRole({
        rawSessionToken: rawTokens[1],
        assignmentId: assignmentIds[1],
        now: new Date(now.getTime() + 3_000),
        correlationId: "integration-pmo-management-end-last",
      })).rejects.toEqual(new PmoManagementError("LAST_AVAILABLE_PMO"));

      await client.session.update({
        where: { id: sessionIds[1] },
        data: { revokedAt: new Date(now.getTime() + 4_000) },
      });
      await expect(secondService.createInvitedAccount({
        rawSessionToken: rawTokens[1],
        loginName: "integration-should-not-be-created",
        displayName: "不应创建的虚拟账号",
        now: new Date(now.getTime() + 5_000),
        correlationId: "integration-pmo-management-revoked-session",
      })).rejects.toEqual(new PmoManagementError("UNAUTHORIZED"));
      await expect(client.person.findUnique({
        where: { loginName: "integration-should-not-be-created" },
        select: { id: true },
      })).resolves.toBeNull();
    } finally {
      await client.auditLog.deleteMany({
        where: {
          OR: [
            { sessionId: { in: [...sessionIds] } },
            { correlationId: { startsWith: "integration-pmo-management-" } },
          ],
        },
      });
      await client.session.deleteMany({ where: { id: { in: [...sessionIds] } } });
      await client.roleAssignment.deleteMany({ where: { id: { in: [...assignmentIds] } } });
      await client.person.deleteMany({ where: { id: { in: [...personIds] } } });
      await client.person.deleteMany({ where: { loginName: "integration-should-not-be-created" } });
    }
  });
});

async function expectRollback(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof RollbackFixture) return;
    throw error;
  }
  throw new Error("Expected rollback fixture");
}
