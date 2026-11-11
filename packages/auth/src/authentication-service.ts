import {
  LOGIN_FAILURE_LIMIT,
  LOGIN_TEMPORARY_LOCK_MS,
} from "./account-policy.js";
import { AUTHENTICATION_PUBLIC_FAILURE_CODE } from "./contracts.js";
import { parseLoginName } from "./login-policy.js";
import type { PasswordHasher } from "./password-hasher.js";
import type {
  AuthUnitOfWork,
  PersonAuthRecord,
} from "./repository-contracts.js";
import {
  MAX_ACTIVE_SESSIONS,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  evaluateSession,
  selectInitialRole,
  type InitialRoleSelection,
} from "./session-policy.js";

export interface AuthKeyHasher {
  hashLoginName(loginName: string): string;
  hashSourceIp(sourceIp: string): string;
  hashCredentialSourceIp(sourceIp: string): string;
}

export interface SessionTokenCodec {
  generate(): { rawToken: string; tokenHash: string };
  hash(rawToken: string): string;
}

export type LoginResult =
  | {
      ok: true;
      sessionToken: string;
      sessionId: string;
      personId: string;
      mustChangePassword: boolean;
      roleSelection: InitialRoleSelection;
    }
  | { ok: false; code: typeof AUTHENTICATION_PUBLIC_FAILURE_CODE };

export type AuthoritativeSessionResult =
  | {
      authenticated: true;
      sessionId: string;
      personId: string;
      activeRoleCode: import("./contracts.js").RoleCode | null;
      availableRoleCodes: import("./contracts.js").RoleCode[];
      mustChangePassword: boolean;
    }
  | {
      authenticated: false;
      code: import("./contracts.js").SessionFailureCode;
    };

export type RoleSwitchResult =
  | {
      ok: true;
      sessionId: string;
      personId: string;
      activeRoleCode: import("./contracts.js").RoleCode;
      availableRoleCodes: import("./contracts.js").RoleCode[];
      mustChangePassword: boolean;
    }
  | {
      ok: false;
      code: import("./contracts.js").SessionFailureCode | "ROLE_NOT_ACTIVE";
    };

export class AuthenticationService {
  constructor(
    private readonly dependencies: {
      unitOfWork: AuthUnitOfWork;
      passwordHasher: PasswordHasher;
      keyHasher: AuthKeyHasher;
      tokenCodec: SessionTokenCodec;
      dummyPasswordHash: string;
    },
  ) {}

  async login(input: {
    loginName: string;
    password: string;
    sourceIp: string | null;
    userAgent: string;
    now: Date;
    correlationId: string;
  }): Promise<LoginResult> {
    const normalizedCandidate = input.loginName.trim().toLowerCase();
    let loginName: string | null = null;
    try {
      loginName = parseLoginName(input.loginName);
    } catch {
      // Invalid and unknown login names use the same response and rate-limit path.
    }
    const loginKey = this.dependencies.keyHasher.hashLoginName(normalizedCandidate);
    const ipKey = input.sourceIp
      ? this.dependencies.keyHasher.hashSourceIp(input.sourceIp)
      : null;

    return this.dependencies.unitOfWork.run(async (repositories) => {
      const loginLimit = await repositories.rateLimits.findForUpdate(
        "LOGIN_NAME",
        loginKey,
      );
      const ipLimit = ipKey
        ? await repositories.rateLimits.findForUpdate("SOURCE_IP", ipKey)
        : null;
      const rateLimited = [loginLimit, ipLimit].some(
        (record) => record?.lockedUntil && record.lockedUntil > input.now,
      );

      const foundPerson = loginName
        ? await repositories.people.findByLoginName(loginName)
        : null;
      const person = foundPerson
        ? await repositories.people.findByIdForUpdate(foundPerson.id)
        : null;
      const passwordHash = person?.passwordHash ?? this.dependencies.dummyPasswordHash;
      const passwordMatches = rateLimited
        ? false
        : await this.dependencies.passwordHasher.verify(passwordHash, input.password);
      const personTemporarilyLocked = person?.lockedUntil
        ? person.lockedUntil > input.now
        : false;
      const accountAvailable =
        person?.accountStatus === "ACTIVE" &&
        !personTemporarilyLocked;

      if (!passwordMatches || !accountAvailable || rateLimited) {
        if (!rateLimited) {
          await repositories.rateLimits.registerFailure({
            dimension: "LOGIN_NAME",
            keyHash: loginKey,
            now: input.now,
            failureLimit: LOGIN_FAILURE_LIMIT,
            windowMs: LOGIN_TEMPORARY_LOCK_MS,
          });
          if (ipKey) {
            await repositories.rateLimits.registerFailure({
              dimension: "SOURCE_IP",
              keyHash: ipKey,
              now: input.now,
              failureLimit: LOGIN_FAILURE_LIMIT,
              windowMs: LOGIN_TEMPORARY_LOCK_MS,
            });
          }
          if (person && !personTemporarilyLocked) {
            const protection = advancePersonFailure(person, input.now);
            await repositories.people.updateLoginProtection({
              personId: person.id,
              ...protection,
            });
            if (
              protection.lockedUntil &&
              (!person.lockedUntil || person.lockedUntil <= input.now)
            ) {
              await repositories.audit.append({
                actorPersonId: null,
                actorIdentifierMasked: `login:${loginKey.slice(0, 12)}`,
                actionCode: "ACCOUNT_TEMPORARILY_LOCKED",
                result: "SUCCESS",
                entityType: "PERSON",
                entityId: person.id,
                summary: "账号因连续登录失败被临时锁定",
                changedFields: ["failed_login_count", "locked_until"],
                correlationId: input.correlationId,
                ipAddress: input.sourceIp,
                userAgent: input.userAgent,
              });
            }
          }
        }
        await repositories.audit.append({
          actorPersonId: null,
          actorIdentifierMasked: `login:${loginKey.slice(0, 12)}`,
          actionCode: "LOGIN_FAILED",
          result: "FAILURE",
          entityType: "AUTHENTICATION",
          summary: "登录失败",
          failureCode: "AUTHENTICATION_FAILED",
          correlationId: input.correlationId,
          ipAddress: input.sourceIp,
          userAgent: input.userAgent,
        });
        return { ok: false, code: AUTHENTICATION_PUBLIC_FAILURE_CODE };
      }

      await repositories.rateLimits.clear("LOGIN_NAME", loginKey);
      await repositories.people.recordLoginSuccess(person.id, input.now);
      const roleSelection = selectInitialRole(
        await repositories.roles.listActiveRoleCodes(person.id),
      );
      const activeRoleCode =
        roleSelection.kind === "SELECTED" ? roleSelection.roleCode : null;
      const token = this.dependencies.tokenCodec.generate();
      const session = await repositories.sessions.create({
        personId: person.id,
        tokenHash: token.tokenHash,
        activeRoleCode,
        expiresAt: new Date(input.now.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
        createdAt: input.now,
      });
      await repositories.sessions.revokeOldestExcess(
        person.id,
        MAX_ACTIVE_SESSIONS,
        input.now,
      );
      await repositories.audit.append({
        actorPersonId: null,
        actorIdentifierMasked: `login:${loginKey.slice(0, 12)}`,
        sessionId: session.id,
        actionCode: "LOGIN_SUCCEEDED",
        result: "SUCCESS",
        entityType: "SESSION",
        entityId: session.id,
        summary: "登录成功",
        correlationId: input.correlationId,
        ipAddress: input.sourceIp,
        userAgent: input.userAgent,
      });
      return {
        ok: true,
        sessionToken: token.rawToken,
        sessionId: session.id,
        personId: person.id,
        mustChangePassword: person.mustChangePassword,
        roleSelection,
      };
    });
  }

  async validateSession(
    rawToken: string,
    now: Date,
  ): Promise<AuthoritativeSessionResult> {
    const tokenHash = this.dependencies.tokenCodec.hash(rawToken);
    return this.dependencies.unitOfWork.run(async (repositories) => {
      const session = await repositories.sessions.findByTokenHash(tokenHash);
      if (!session) {
        return { authenticated: false, code: "SESSION_REVOKED" };
      }
      const person = await repositories.people.findById(session.personId);
      if (!person) {
        return { authenticated: false, code: "ACCOUNT_NOT_ACTIVE" };
      }
      const decision = evaluateSession(
        {
          accountStatus: person.accountStatus,
          lockedUntil: person.lockedUntil,
          expiresAt: session.expiresAt,
          lastSeenAt: session.lastSeenAt,
          revokedAt: session.revokedAt,
        },
        now,
      );
      if (!decision.valid) return { authenticated: false, code: decision.code };

      const availableRoleCodes = await repositories.roles.listActiveRoleCodes(
        person.id,
      );
      const activeRoleCode =
        session.activeRoleCode && availableRoleCodes.includes(session.activeRoleCode)
          ? session.activeRoleCode
          : null;
      if (activeRoleCode !== session.activeRoleCode) {
        await repositories.sessions.setActiveRole(session.id, activeRoleCode);
      }
      await repositories.sessions.touch(session.id, now);
      return {
        authenticated: true,
        sessionId: session.id,
        personId: person.id,
        activeRoleCode,
        availableRoleCodes,
        mustChangePassword: person.mustChangePassword,
      };
    });
  }

  async logout(input: {
    rawToken: string;
    now: Date;
    correlationId: string;
  }): Promise<void> {
    const tokenHash = this.dependencies.tokenCodec.hash(input.rawToken);
    await this.dependencies.unitOfWork.run(async (repositories) => {
      const session = await repositories.sessions.findByTokenHash(tokenHash);
      if (!session || session.revokedAt) return;
      await repositories.sessions.revokeById(session.id, input.now);
      await repositories.audit.append({
        actorPersonId: session.activeRoleCode ? session.personId : null,
        actorRoleCode: session.activeRoleCode,
        sessionId: session.id,
        actionCode: "LOGOUT",
        result: "SUCCESS",
        entityType: "SESSION",
        entityId: session.id,
        summary: "当前会话已退出",
        correlationId: input.correlationId,
      });
    });
  }

  async switchRole(input: {
    rawToken: string;
    roleCode: import("./contracts.js").RoleCode;
    now: Date;
    correlationId: string;
  }): Promise<RoleSwitchResult> {
    const tokenHash = this.dependencies.tokenCodec.hash(input.rawToken);
    return this.dependencies.unitOfWork.run(async (repositories) => {
      const session = await repositories.sessions.findByTokenHash(tokenHash);
      if (!session) return { ok: false, code: "SESSION_REVOKED" };
      const person = await repositories.people.findById(session.personId);
      if (!person) return { ok: false, code: "ACCOUNT_NOT_ACTIVE" };
      const decision = evaluateSession(
        {
          accountStatus: person.accountStatus,
          lockedUntil: person.lockedUntil,
          expiresAt: session.expiresAt,
          lastSeenAt: session.lastSeenAt,
          revokedAt: session.revokedAt,
        },
        input.now,
      );
      if (!decision.valid) return { ok: false, code: decision.code };
      const availableRoleCodes = await repositories.roles.listActiveRoleCodes(
        person.id,
      );
      if (!availableRoleCodes.includes(input.roleCode)) {
        return { ok: false, code: "ROLE_NOT_ACTIVE" };
      }
      await repositories.sessions.setActiveRole(session.id, input.roleCode);
      await repositories.sessions.touch(session.id, input.now);
      await repositories.audit.append({
        actorPersonId: person.id,
        actorRoleCode: input.roleCode,
        sessionId: session.id,
        actionCode: "ROLE_SWITCHED",
        result: "SUCCESS",
        entityType: "SESSION",
        entityId: session.id,
        summary: "当前角色已切换",
        changedFields: ["active_role_code"],
        correlationId: input.correlationId,
      });
      return {
        ok: true,
        sessionId: session.id,
        personId: person.id,
        activeRoleCode: input.roleCode,
        availableRoleCodes,
        mustChangePassword: person.mustChangePassword,
      };
    });
  }
}

function advancePersonFailure(
  person: PersonAuthRecord,
  now: Date,
): {
  failedLoginCount: number;
  failedLoginWindowStartedAt: Date;
  lockedUntil: Date | null;
} {
  const windowExpired =
    !person.failedLoginWindowStartedAt ||
    now.getTime() - person.failedLoginWindowStartedAt.getTime() >=
      LOGIN_TEMPORARY_LOCK_MS;
  const failedLoginCount = windowExpired ? 1 : person.failedLoginCount + 1;
  return {
    failedLoginCount,
    failedLoginWindowStartedAt: windowExpired
      ? now
      : person.failedLoginWindowStartedAt!,
    lockedUntil:
      failedLoginCount >= LOGIN_FAILURE_LIMIT
        ? new Date(now.getTime() + LOGIN_TEMPORARY_LOCK_MS)
        : null,
  };
}
