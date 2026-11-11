import { randomUUID } from "node:crypto";

import {
  AuthRepositoryError,
  type AccountStatus,
  type AssignmentStatus,
  type AuthRepositories,
  type AuthUnitOfWork,
  type CredentialTokenPurpose,
  type PersonAuthRecord,
  type RateLimitDimension,
  type RoleCode,
} from "@researchflow/auth";

import type { Prisma } from "../generated/client.js";
import type { ApplicationPrismaClient } from "./client.js";

const personAuthSelect = {
  id: true,
  loginName: true,
  displayName: true,
  passwordHash: true,
  accountStatus: true,
  mustChangePassword: true,
  failedLoginCount: true,
  failedLoginWindowStartedAt: true,
  lockedUntil: true,
  passwordChangedAt: true,
} as const satisfies Prisma.PersonSelect;

function mapPerson(record: {
  id: string;
  loginName: string;
  displayName: string;
  passwordHash: string | null;
  accountStatus: string;
  mustChangePassword: boolean;
  failedLoginCount: number;
  failedLoginWindowStartedAt: Date | null;
  lockedUntil: Date | null;
  passwordChangedAt: Date | null;
}): PersonAuthRecord {
  return { ...record, accountStatus: record.accountStatus as AccountStatus };
}

export function createAuthRepositories(
  transaction: Prisma.TransactionClient,
): AuthRepositories {
  return {
    people: {
      async findByLoginName(loginName) {
        const person = await transaction.person.findUnique({
          where: { loginName },
          select: personAuthSelect,
        });
        return person ? mapPerson(person) : null;
      },
      async findById(personId) {
        const person = await transaction.person.findUnique({
          where: { id: personId },
          select: personAuthSelect,
        });
        return person ? mapPerson(person) : null;
      },
      async findByIdForUpdate(personId) {
        const rows = await transaction.$queryRaw<PersonAuthRecord[]>`
          SELECT
            "id", "login_name" AS "loginName", "display_name" AS "displayName",
            "password_hash" AS "passwordHash", "account_status" AS "accountStatus",
            "must_change_password" AS "mustChangePassword",
            "failed_login_count" AS "failedLoginCount",
            "failed_login_window_started_at" AS "failedLoginWindowStartedAt",
            "locked_until" AS "lockedUntil", "password_changed_at" AS "passwordChangedAt"
          FROM "person"
          WHERE "id" = ${personId}::uuid
          FOR UPDATE
        `;
        return rows[0] ?? null;
      },
      async listForManagement() {
        const people = await transaction.person.findMany({
          orderBy: [{ loginName: "asc" }, { id: "asc" }],
          select: {
            id: true,
            loginName: true,
            displayName: true,
            accountStatus: true,
            mustChangePassword: true,
            passwordHash: true,
          },
        });
        return people.map(({ passwordHash, accountStatus, ...person }) => ({
          ...person,
          accountStatus: accountStatus as AccountStatus,
          passwordSet: passwordHash !== null,
        }));
      },
      async create(input) {
        try {
          const person = await transaction.person.create({
            data: input,
            select: personAuthSelect,
          });
          return mapPerson(person);
        } catch (error) {
          if (isPrismaUniqueConstraint(error)) throw new AuthRepositoryError("LOGIN_NAME_DUPLICATE");
          throw error;
        }
      },
      async updateStatus(personId, accountStatus) {
        await transaction.person.update({
          where: { id: personId },
          data: { accountStatus },
          select: { id: true },
        });
      },
      async updatePassword(input) {
        await transaction.person.update({
          where: { id: input.personId },
          data: {
            passwordHash: input.passwordHash,
            mustChangePassword: input.mustChangePassword,
            passwordChangedAt: input.passwordChangedAt,
          },
          select: { id: true },
        });
      },
      async updateLoginProtection(input) {
        await transaction.person.update({
          where: { id: input.personId },
          data: {
            failedLoginCount: input.failedLoginCount,
            failedLoginWindowStartedAt: input.failedLoginWindowStartedAt,
            lockedUntil: input.lockedUntil,
          },
          select: { id: true },
        });
      },
      async recordLoginSuccess(personId, now) {
        await transaction.person.update({
          where: { id: personId },
          data: {
            failedLoginCount: 0,
            failedLoginWindowStartedAt: null,
            lockedUntil: null,
            lastLoginAt: now,
          },
          select: { id: true },
        });
      },
    },
    credentials: {
      async revokeOpen(personId, purpose, revokedAt) {
        await transaction.authCredentialToken.updateMany({
          where: { personId, purpose, consumedAt: null, revokedAt: null },
          data: { revokedAt },
        });
      },
      async create(input) {
        return transaction.authCredentialToken.create({ data: input });
      },
      async findByHashForUpdate(tokenHash) {
        const rows = await transaction.$queryRaw<
          Array<{
            id: string;
            personId: string;
            purpose: CredentialTokenPurpose;
            tokenHash: string;
            expiresAt: Date;
            consumedAt: Date | null;
            revokedAt: Date | null;
          }>
        >`
          SELECT "id", "person_id" AS "personId", "purpose",
                 "token_hash" AS "tokenHash", "expires_at" AS "expiresAt",
                 "consumed_at" AS "consumedAt", "revoked_at" AS "revokedAt"
          FROM "auth_credential_token"
          WHERE "token_hash" = ${tokenHash}
          FOR UPDATE
        `;
        return rows[0] ?? null;
      },
      async markConsumed(tokenId, consumedAt) {
        await transaction.authCredentialToken.update({
          where: { id: tokenId },
          data: { consumedAt },
          select: { id: true },
        });
      },
    },
    passwordHistory: {
      async listRecentHashes(personId, limit) {
        const rows = await transaction.passwordHistory.findMany({
          where: { personId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: limit,
          select: { passwordHash: true },
        });
        return rows.map(({ passwordHash }) => passwordHash);
      },
      async add(personId, passwordHash, createdAt) {
        await transaction.passwordHistory.create({
          data: { personId, passwordHash, createdAt },
          select: { id: true },
        });
      },
      async keepMostRecent(personId, limit) {
        const obsolete = await transaction.passwordHistory.findMany({
          where: { personId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: limit,
          select: { id: true },
        });
        if (obsolete.length > 0) {
          await transaction.passwordHistory.deleteMany({
            where: { id: { in: obsolete.map(({ id }) => id) } },
          });
        }
      },
    },
    rateLimits: {
      async findForUpdate(dimension, keyHash) {
        const rows = await transaction.$queryRaw<
          Array<{
            id: string;
            dimension: RateLimitDimension;
            keyHash: string;
            failureCount: number;
            windowStartedAt: Date | null;
            lockedUntil: Date | null;
          }>
        >`
          SELECT "id", "dimension", "key_hash" AS "keyHash",
                 "failure_count" AS "failureCount",
                 "window_started_at" AS "windowStartedAt", "locked_until" AS "lockedUntil"
          FROM "auth_rate_limit"
          WHERE "dimension" = ${dimension}::"AuthRateLimitDimension"
            AND "key_hash" = ${keyHash}
          FOR UPDATE
        `;
        return rows[0] ?? null;
      },
      async registerFailure(input) {
        const rows = await transaction.$queryRaw<
          Array<{
            id: string;
            dimension: RateLimitDimension;
            keyHash: string;
            failureCount: number;
            windowStartedAt: Date | null;
            lockedUntil: Date | null;
          }>
        >`
          INSERT INTO "auth_rate_limit" (
            "id", "dimension", "key_hash", "failure_count",
            "window_started_at", "locked_until", "created_at", "updated_at"
          ) VALUES (
            ${randomUUID()}::uuid, ${input.dimension}::"AuthRateLimitDimension",
            ${input.keyHash}, 1, ${input.now}::timestamptz, NULL,
            ${input.now}::timestamptz, ${input.now}::timestamptz
          )
          ON CONFLICT ("dimension", "key_hash") DO UPDATE SET
            "failure_count" = CASE
              WHEN "auth_rate_limit"."window_started_at" IS NULL
                OR "auth_rate_limit"."window_started_at" <= ${input.now}::timestamptz - (${input.windowMs} * interval '1 millisecond')
                OR ("auth_rate_limit"."locked_until" IS NOT NULL AND "auth_rate_limit"."locked_until" <= ${input.now}::timestamptz)
              THEN 1
              ELSE "auth_rate_limit"."failure_count" + 1
            END,
            "window_started_at" = CASE
              WHEN "auth_rate_limit"."window_started_at" IS NULL
                OR "auth_rate_limit"."window_started_at" <= ${input.now}::timestamptz - (${input.windowMs} * interval '1 millisecond')
                OR ("auth_rate_limit"."locked_until" IS NOT NULL AND "auth_rate_limit"."locked_until" <= ${input.now}::timestamptz)
              THEN ${input.now}::timestamptz
              ELSE "auth_rate_limit"."window_started_at"
            END,
            "locked_until" = CASE
              WHEN NOT (
                "auth_rate_limit"."window_started_at" IS NULL
                OR "auth_rate_limit"."window_started_at" <= ${input.now}::timestamptz - (${input.windowMs} * interval '1 millisecond')
                OR ("auth_rate_limit"."locked_until" IS NOT NULL AND "auth_rate_limit"."locked_until" <= ${input.now}::timestamptz)
              ) AND "auth_rate_limit"."failure_count" + 1 >= ${input.failureLimit}
              THEN ${input.now}::timestamptz + (${input.windowMs} * interval '1 millisecond')
              ELSE NULL
            END,
            "updated_at" = ${input.now}::timestamptz
          RETURNING "id", "dimension", "key_hash" AS "keyHash",
                    "failure_count" AS "failureCount",
                    "window_started_at" AS "windowStartedAt",
                    "locked_until" AS "lockedUntil"
        `;
        return rows[0];
      },
      async clear(dimension, keyHash) {
        await transaction.authRateLimit.deleteMany({ where: { dimension, keyHash } });
      },
    },
    sessions: {
      async create(input) {
        return transaction.session.create({ data: input });
      },
      async findByTokenHash(tokenHash) {
        return transaction.session.findUnique({ where: { tokenHash } });
      },
      async findByIdForUpdate(sessionId) {
        const rows = await transaction.$queryRaw<
          Array<{
            id: string;
            personId: string;
            tokenHash: string;
            activeRoleCode: RoleCode | null;
            expiresAt: Date;
            revokedAt: Date | null;
            createdAt: Date;
            lastSeenAt: Date;
          }>
        >`
          SELECT "id", "person_id" AS "personId", "token_hash" AS "tokenHash",
                 "active_role_code" AS "activeRoleCode", "expires_at" AS "expiresAt",
                 "revoked_at" AS "revokedAt", "created_at" AS "createdAt",
                 "last_seen_at" AS "lastSeenAt"
          FROM "session"
          WHERE "id" = ${sessionId}::uuid
          FOR UPDATE
        `;
        return rows[0] ?? null;
      },
      async countActive(personId, now) {
        return transaction.session.count({
          where: { personId, revokedAt: null, expiresAt: { gt: now } },
        });
      },
      async revokeOldestExcess(personId, keep, revokedAt) {
        const obsolete = await transaction.session.findMany({
          where: { personId, revokedAt: null, expiresAt: { gt: revokedAt } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: keep,
          select: { id: true },
        });
        if (obsolete.length > 0) {
          await transaction.session.updateMany({
            where: { id: { in: obsolete.map(({ id }) => id) }, revokedAt: null },
            data: { revokedAt },
          });
        }
      },
      async revokeForPerson(personId, revokedAt, exceptSessionId) {
        await transaction.session.updateMany({
          where: {
            personId,
            revokedAt: null,
            ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
          },
          data: { revokedAt },
        });
      },
      async revokeById(sessionId, revokedAt) {
        await transaction.session.updateMany({
          where: { id: sessionId, revokedAt: null },
          data: { revokedAt },
        });
      },
      async touch(sessionId, lastSeenAt) {
        await transaction.session.update({
          where: { id: sessionId },
          data: { lastSeenAt },
          select: { id: true },
        });
      },
      async setActiveRole(sessionId, activeRoleCode) {
        await transaction.session.update({
          where: { id: sessionId },
          data: { activeRoleCode },
          select: { id: true },
        });
      },
    },
    roles: {
      async listActiveRoleCodes(personId) {
        const rows = await transaction.$queryRaw<Array<{ roleCode: RoleCode }>>`
          SELECT DISTINCT source."roleCode"
          FROM (
            SELECT "role_code"::text AS "roleCode"
            FROM "role_assignment"
            WHERE "person_id" = ${personId}::uuid
              AND "assignment_status" = 'ACTIVE'
            UNION
            SELECT "role_code"::text AS "roleCode"
            FROM "role_eligibility"
            WHERE "person_id" = ${personId}::uuid
              AND "status" = 'ACTIVE'
          ) source
          ORDER BY source."roleCode"
        `;
        return rows.map(({ roleCode }) => roleCode);
      },
      async hasActiveRole(input) {
        if (
          input.projectId === undefined &&
          input.roleCode === "KEY_SUB_I" &&
          (await transaction.roleEligibility.count({
            where: {
              personId: input.personId,
              roleCode: "KEY_SUB_I",
              status: "ACTIVE",
            },
          })) > 0
        ) {
          return true;
        }
        return (
          (await transaction.roleAssignment.count({
            where: {
              personId: input.personId,
              roleCode: input.roleCode,
              assignmentStatus: "ACTIVE",
              ...(input.projectId === undefined
                ? {}
                : { projectId: input.projectId }),
            },
          })) > 0
        );
      },
      async hasProjectAccess(input) {
        if (input.roleCode === "PMO" || input.roleCode === "DEAN") {
          const projectExists = await transaction.project.count({
            where: { id: input.projectId },
          });
          if (projectExists === 0) return false;
          return (
            (await transaction.roleAssignment.count({
              where: {
                personId: input.personId,
                roleCode: input.roleCode,
                projectId: null,
                assignmentStatus: "ACTIVE",
              },
            })) > 0
          );
        }
        return (
          (await transaction.roleAssignment.count({
            where: {
              personId: input.personId,
              roleCode: input.roleCode,
              projectId: input.projectId,
              assignmentStatus: "ACTIVE",
            },
          })) > 0
        );
      },
      async listVisibleProjectIds(personId, roleCode) {
        if (roleCode === "PMO" || roleCode === "DEAN") {
          const hasGlobalRole = await transaction.roleAssignment.count({
            where: {
              personId,
              roleCode,
              projectId: null,
              assignmentStatus: "ACTIVE",
            },
          });
          if (hasGlobalRole === 0) return [];
          const projects = await transaction.project.findMany({ select: { id: true } });
          return projects.map(({ id }) => id);
        }
        const assignments = await transaction.roleAssignment.findMany({
          where: {
            personId,
            roleCode,
            assignmentStatus: "ACTIVE",
            projectId: { not: null },
          },
          select: { projectId: true },
        });
        return assignments.flatMap(({ projectId }) => (projectId ? [projectId] : []));
      },
      async listForManagement() {
        const assignments = await transaction.roleAssignment.findMany({
          orderBy: [{ proposedAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            personId: true,
            roleCode: true,
            projectId: true,
            assignmentStatus: true,
            isPrimary: true,
          },
        });
        return assignments.map((assignment) => ({
          ...assignment,
          roleCode: assignment.roleCode as RoleCode,
          assignmentStatus: assignment.assignmentStatus as AssignmentStatus,
        }));
      },
      async listAssignableProjects() {
        return transaction.project.findMany({
          where: { status: { not: "ARCHIVED" } },
          orderBy: [{ projectCode: "asc" }, { projectName: "asc" }, { id: "asc" }],
          select: { id: true, projectCode: true, projectName: true },
        });
      },
      async countAvailablePmosForUpdate(now) {
        const rows = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT ra."id"
          FROM "role_assignment" ra
          JOIN "person" p ON p."id" = ra."person_id"
          WHERE ra."role_code" = 'PMO'
            AND ra."project_id" IS NULL
            AND ra."assignment_status" = 'ACTIVE'
            AND p."account_status" = 'ACTIVE'
            AND (p."locked_until" IS NULL OR p."locked_until" <= ${now})
          ORDER BY ra."id"
          FOR UPDATE OF ra, p
        `;
        return rows.length;
      },
      async personHasActiveGlobalPmo(personId) {
        return (
          (await transaction.roleAssignment.count({
            where: {
              personId,
              roleCode: "PMO",
              projectId: null,
              assignmentStatus: "ACTIVE",
            },
          })) > 0
        );
      },
      async personHasActivePrimaryKeySubIForUpdate(personId) {
        const rows = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "role_assignment"
          WHERE "person_id" = ${personId}::uuid
            AND "role_code" = 'KEY_SUB_I'
            AND "assignment_status" = 'ACTIVE'
            AND "is_primary" = true
          ORDER BY "id"
          FOR UPDATE
        `;
        return rows.length > 0;
      },
      async projectIsAssignableForUpdate(projectId) {
        const rows = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "project"
          WHERE "id" = ${projectId}::uuid
            AND "status" <> 'ARCHIVED'
          FOR UPDATE
        `;
        return rows.length > 0;
      },
      async create(input) {
        const assignment = await transaction.roleAssignment.create({
          data: input,
          select: {
            id: true,
            personId: true,
            roleCode: true,
            projectId: true,
            assignmentStatus: true,
            isPrimary: true,
          },
        });
        return {
          ...assignment,
          roleCode: assignment.roleCode as RoleCode,
          assignmentStatus: assignment.assignmentStatus as AssignmentStatus,
        };
      },
      async findByIdForUpdate(assignmentId) {
        const rows = await transaction.$queryRaw<
          Array<{
            id: string;
            personId: string;
            roleCode: RoleCode;
            projectId: string | null;
            assignmentStatus: AssignmentStatus;
            isPrimary: boolean;
          }>
        >`
          SELECT "id", "person_id" AS "personId", "role_code" AS "roleCode",
                 "project_id" AS "projectId", "assignment_status" AS "assignmentStatus",
                 "is_primary" AS "isPrimary"
          FROM "role_assignment"
          WHERE "id" = ${assignmentId}::uuid
          FOR UPDATE
        `;
        return rows[0] ?? null;
      },
      async findSystemBootstrapPmoForUpdate() {
        const rows = await transaction.$queryRaw<
          Array<{
            id: string;
            personId: string;
            roleCode: RoleCode;
            projectId: string | null;
            assignmentStatus: AssignmentStatus;
            isPrimary: boolean;
          }>
        >`
          SELECT "id", "person_id" AS "personId", "role_code" AS "roleCode",
                 "project_id" AS "projectId", "assignment_status" AS "assignmentStatus",
                 "is_primary" AS "isPrimary"
          FROM "role_assignment"
          WHERE "grant_source" = 'SYSTEM_BOOTSTRAP'
          FOR UPDATE
        `;
        return rows[0] ?? null;
      },
      async end(assignmentId, endedAt) {
        await transaction.roleAssignment.update({
          where: { id: assignmentId },
          data: { assignmentStatus: "ENDED", endedAt },
          select: { id: true },
        });
      },
      async listEligibilityForManagement() {
        const rows = await transaction.roleEligibility.findMany({
          orderBy: [{ grantedAt: "desc" }, { id: "desc" }],
          select: { id: true, personId: true, roleCode: true, status: true, reason: true },
        });
        return rows.map((row) => ({
          ...row,
          roleCode: "KEY_SUB_I" as const,
          status: row.status as "ACTIVE" | "ENDED",
        }));
      },
      async createEligibility(input) {
        const row = await transaction.roleEligibility.create({
          data: {
            personId: input.personId,
            roleCode: "KEY_SUB_I",
            status: "ACTIVE",
            grantedByPersonId: input.grantedByPersonId,
            grantedAt: input.grantedAt,
            reason: input.reason,
          },
          select: { id: true, personId: true, roleCode: true, status: true, reason: true },
        });
        return { ...row, roleCode: "KEY_SUB_I", status: row.status as "ACTIVE" | "ENDED" };
      },
      async findEligibilityByIdForUpdate(eligibilityId) {
        const rows = await transaction.$queryRaw<Array<{
          id: string;
          personId: string;
          roleCode: "KEY_SUB_I";
          status: "ACTIVE" | "ENDED";
          reason: string;
        }>>`
          SELECT "id", "person_id" AS "personId", "role_code"::text AS "roleCode",
                 "status"::text AS "status", "reason"
          FROM "role_eligibility"
          WHERE "id" = ${eligibilityId}::uuid
          FOR UPDATE
        `;
        return rows[0] ?? null;
      },
      async endEligibility(eligibilityId, endedByPersonId, endedAt) {
        await transaction.roleEligibility.update({
          where: { id: eligibilityId },
          data: { status: "ENDED", endedByPersonId, endedAt },
          select: { id: true },
        });
      },
    },
    audit: {
      async append(event) {
        await transaction.auditLog.create({
          data: {
            actorPersonId: event.actorPersonId,
            actorIdentifierMasked: event.actorIdentifierMasked,
            actorRoleCode: event.actorRoleCode,
            sessionId: event.sessionId,
            actionCode: event.actionCode,
            result: event.result,
            entityType: event.entityType,
            entityId: event.entityId,
            summary: event.summary,
            changedFields: event.changedFields ?? [],
            failureCode: event.failureCode,
            correlationId: event.correlationId,
            ipAddress: event.ipAddress,
            userAgent: event.userAgent,
          },
          select: { id: true },
        });
      },
    },
  };
}

function isPrismaUniqueConstraint(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export class PrismaAuthUnitOfWork implements AuthUnitOfWork {
  constructor(private readonly client: ApplicationPrismaClient) {}

  run<T>(operation: (repositories: AuthRepositories) => Promise<T>): Promise<T> {
    return this.client.$transaction((transaction) =>
      operation(createAuthRepositories(transaction)),
    );
  }
}
