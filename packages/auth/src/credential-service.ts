import {
  ACTIVATION_TOKEN_TTL_MS,
  LOGIN_FAILURE_LIMIT,
  LOGIN_TEMPORARY_LOCK_MS,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from "./account-policy.js";
import type { CredentialTokenPurpose, RoleCode } from "./contracts.js";
import type { AuthKeyHasher, SessionTokenCodec } from "./authentication-service.js";
import { evaluatePasswordCandidate, type PasswordPolicyFailureCode } from "./password-policy.js";
import type { PasswordHasher } from "./password-hasher.js";
import type { AuthRepositories, AuthUnitOfWork, PersonAuthRecord } from "./repository-contracts.js";
import { evaluateSession } from "./session-policy.js";

export const PASSWORD_HISTORY_LIMIT = 5;

export type CredentialFailureCode =
  | "CREDENTIAL_INVALID"
  | "CURRENT_PASSWORD_INVALID"
  | PasswordPolicyFailureCode;

export class CredentialServiceError extends Error {
  constructor(readonly code: CredentialFailureCode) {
    super(code);
    this.name = "CredentialServiceError";
  }
}

export class CredentialService {
  constructor(
    private readonly dependencies: {
      unitOfWork: AuthUnitOfWork;
      passwordHasher: PasswordHasher;
      keyHasher: AuthKeyHasher;
      tokenCodec: SessionTokenCodec;
    },
  ) {}

  async issue(input: {
    actorPersonId: string;
    actorRoleCode: RoleCode;
    targetPersonId: string;
    purpose: CredentialTokenPurpose;
    now: Date;
    correlationId: string;
  }): Promise<{ token: string; expiresAt: Date }> {
    return this.dependencies.unitOfWork.run(async (repositories) => {
      const person = await repositories.people.findByIdForUpdate(input.targetPersonId);
      if (!person || !canIssue(person, input.purpose)) {
        throw new CredentialServiceError("CREDENTIAL_INVALID");
      }
      const token = this.dependencies.tokenCodec.generate();
      const ttl = input.purpose === "ACTIVATION"
        ? ACTIVATION_TOKEN_TTL_MS
        : PASSWORD_RESET_TOKEN_TTL_MS;
      const expiresAt = new Date(input.now.getTime() + ttl);
      await repositories.credentials.revokeOpen(person.id, input.purpose, input.now);
      const record = await repositories.credentials.create({
        personId: person.id,
        purpose: input.purpose,
        tokenHash: token.tokenHash,
        expiresAt,
        createdAt: input.now,
      });
      await repositories.audit.append({
        actorPersonId: input.actorPersonId,
        actorRoleCode: input.actorRoleCode,
        actionCode: `${input.purpose}_TOKEN_ISSUED`,
        result: "SUCCESS",
        entityType: "AUTH_CREDENTIAL_TOKEN",
        entityId: record.id,
        summary: "一次性凭证已签发",
        correlationId: input.correlationId,
      });
      return { token: token.rawToken, expiresAt };
    });
  }

  async consume(input: {
    token: string;
    purpose: CredentialTokenPurpose;
    newPassword: string;
    sourceIp: string | null;
    userAgent: string;
    now: Date;
    correlationId: string;
  }): Promise<void> {
    const tokenHash = this.dependencies.tokenCodec.hash(input.token);
    const ipKey = input.sourceIp
      ? this.dependencies.keyHasher.hashCredentialSourceIp(input.sourceIp)
      : null;
    const result = await this.dependencies.unitOfWork.run(async (repositories) => {
      const rateLimit = ipKey
        ? await repositories.rateLimits.findForUpdate("SOURCE_IP", ipKey)
        : null;
      if (rateLimit?.lockedUntil && rateLimit.lockedUntil > input.now) {
        await this.recordCredentialFailure(repositories, input, ipKey, false);
        return "INVALID" as const;
      }
      const credential = await repositories.credentials.findByHashForUpdate(tokenHash);
      const person = credential
        ? await repositories.people.findByIdForUpdate(credential.personId)
        : null;
      if (
        !credential ||
        !person ||
        !credentialIsUsable(credential, person, input.purpose, input.now)
      ) {
        await this.recordCredentialFailure(repositories, input, ipKey, true);
        return "INVALID" as const;
      }

      await this.assertPasswordAllowed(person, input.newPassword, repositories);
      const newHash = await this.dependencies.passwordHasher.hash(input.newPassword);
      if (person.passwordHash) {
        await repositories.passwordHistory.add(person.id, person.passwordHash, input.now);
        await repositories.passwordHistory.keepMostRecent(person.id, PASSWORD_HISTORY_LIMIT);
      }
      await repositories.people.updatePassword({
        personId: person.id,
        passwordHash: newHash,
        mustChangePassword: false,
        passwordChangedAt: input.now,
      });
      if (input.purpose === "ACTIVATION") {
        await repositories.people.updateStatus(person.id, "ACTIVE");
      }
      await repositories.credentials.markConsumed(credential.id, input.now);
      await repositories.sessions.revokeForPerson(person.id, input.now);
      await repositories.audit.append({
        actorPersonId: null,
        actionCode: input.purpose === "ACTIVATION" ? "ACCOUNT_ACTIVATED" : "PASSWORD_RESET",
        result: "SUCCESS",
        entityType: "PERSON",
        entityId: person.id,
        summary: input.purpose === "ACTIVATION" ? "账号已激活" : "密码已重置",
        changedFields: ["password_hash", "password_changed_at", "must_change_password"],
        correlationId: input.correlationId,
        ipAddress: input.sourceIp,
        userAgent: input.userAgent,
      });
      return "SUCCESS" as const;
    });
    if (result === "INVALID") {
      throw new CredentialServiceError("CREDENTIAL_INVALID");
    }
  }

  async changePassword(input: {
    rawSessionToken: string;
    currentPassword: string;
    newPassword: string;
    now: Date;
    correlationId: string;
  }): Promise<void> {
    const sessionHash = this.dependencies.tokenCodec.hash(input.rawSessionToken);
    await this.dependencies.unitOfWork.run(async (repositories) => {
      const found = await repositories.sessions.findByTokenHash(sessionHash);
      const session = found
        ? await repositories.sessions.findByIdForUpdate(found.id)
        : null;
      const person = session
        ? await repositories.people.findByIdForUpdate(session.personId)
        : null;
      if (!session || !person || !evaluateSession({
        accountStatus: person.accountStatus,
        lockedUntil: person.lockedUntil,
        expiresAt: session.expiresAt,
        lastSeenAt: session.lastSeenAt,
        revokedAt: session.revokedAt,
      }, input.now).valid || !person.passwordHash) {
        throw new CredentialServiceError("CREDENTIAL_INVALID");
      }
      if (!(await this.dependencies.passwordHasher.verify(person.passwordHash, input.currentPassword))) {
        throw new CredentialServiceError("CURRENT_PASSWORD_INVALID");
      }
      await this.assertPasswordAllowed(person, input.newPassword, repositories);
      const newHash = await this.dependencies.passwordHasher.hash(input.newPassword);
      await repositories.passwordHistory.add(person.id, person.passwordHash, input.now);
      await repositories.passwordHistory.keepMostRecent(person.id, PASSWORD_HISTORY_LIMIT);
      await repositories.people.updatePassword({
        personId: person.id,
        passwordHash: newHash,
        mustChangePassword: false,
        passwordChangedAt: input.now,
      });
      await repositories.sessions.revokeForPerson(person.id, input.now, session.id);
      await repositories.audit.append({
        actorPersonId: session.activeRoleCode ? person.id : null,
        actorRoleCode: session.activeRoleCode,
        sessionId: session.id,
        actionCode: "PASSWORD_CHANGED",
        result: "SUCCESS",
        entityType: "PERSON",
        entityId: person.id,
        summary: "密码已修改",
        changedFields: ["password_hash", "password_changed_at", "must_change_password"],
        correlationId: input.correlationId,
      });
    });
  }

  private async assertPasswordAllowed(
    person: PersonAuthRecord,
    password: string,
    repositories: AuthRepositories,
  ): Promise<void> {
    const hashes = [
      ...(person.passwordHash ? [person.passwordHash] : []),
      ...(await repositories.passwordHistory.listRecentHashes(person.id, PASSWORD_HISTORY_LIMIT)),
    ];
    const matchesCurrentOrRecentPassword = (
      await Promise.all(hashes.map((hash) => this.dependencies.passwordHasher.verify(hash, password)))
    ).some(Boolean);
    const decision = evaluatePasswordCandidate({
      loginName: person.loginName,
      password,
      matchesCurrentOrRecentPassword,
    });
    if (!decision.ok) throw new CredentialServiceError(decision.code);
  }

  private async recordCredentialFailure(
    repositories: AuthRepositories,
    input: {
      sourceIp: string | null;
      userAgent: string;
      now: Date;
      correlationId: string;
    },
    ipKey: string | null,
    registerRateLimit: boolean,
  ): Promise<void> {
    if (registerRateLimit && ipKey) {
      await repositories.rateLimits.registerFailure({
        dimension: "SOURCE_IP",
        keyHash: ipKey,
        now: input.now,
        failureLimit: LOGIN_FAILURE_LIMIT,
        windowMs: LOGIN_TEMPORARY_LOCK_MS,
      });
    }
    await repositories.audit.append({
      actorPersonId: null,
      actionCode: "CREDENTIAL_CONSUME_FAILED",
      result: "FAILURE",
      entityType: "AUTH_CREDENTIAL_TOKEN",
      summary: "一次性凭证校验失败",
      failureCode: "CREDENTIAL_INVALID",
      correlationId: input.correlationId,
      ipAddress: input.sourceIp,
      userAgent: input.userAgent,
    });
  }
}

function canIssue(person: PersonAuthRecord, purpose: CredentialTokenPurpose): boolean {
  if (person.accountStatus === "DISABLED") return false;
  return purpose === "ACTIVATION"
    ? person.accountStatus === "INVITED" && person.passwordHash === null
    : person.passwordHash !== null;
}

function credentialIsUsable(
  credential: NonNullable<Awaited<ReturnType<AuthRepositories["credentials"]["findByHashForUpdate"]>>>,
  person: PersonAuthRecord,
  purpose: CredentialTokenPurpose,
  now: Date,
): boolean {
  if (person.accountStatus === "DISABLED") return false;
  if (credential.purpose !== purpose || credential.consumedAt || credential.revokedAt) return false;
  if (credential.expiresAt <= now) return false;
  return purpose !== "ACTIVATION" || person.accountStatus === "INVITED";
}
