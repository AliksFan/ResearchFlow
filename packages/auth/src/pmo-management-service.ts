import {
  ACTIVATION_TOKEN_TTL_MS,
  PASSWORD_RESET_TOKEN_TTL_MS,
  transitionAccountStatus,
} from "./account-policy.js";
import type { AccountStatusOperation } from "./account-administration-service.js";
import type { CredentialTokenPurpose, RoleCode } from "./contracts.js";
import type { SessionTokenCodec } from "./authentication-service.js";
import { parseLoginName } from "./login-policy.js";
import type {
  AuthRepositories,
  AuthUnitOfWork,
  ManagedPersonRecord,
  PersonAuthRecord,
  RoleAssignmentRecord,
  RoleEligibilityRecord,
} from "./repository-contracts.js";
import { evaluateSession } from "./session-policy.js";

export class PmoManagementError extends Error {
  constructor(readonly code:
    | "UNAUTHORIZED"
    | "INVALID_INPUT"
    | "LAST_AVAILABLE_PMO"
    | "NOT_FOUND"
    | "PRIMARY_KEY_SUB_I_HANDOVER_REQUIRED"
    | "PROJECT_NOT_ASSIGNABLE"
    | "LOGIN_NAME_INVALID"
    | "LOGIN_NAME_DUPLICATE"
    | "DISPLAY_NAME_INVALID"
  ) {
    super(code);
    this.name = "PmoManagementError";
  }
}

export interface PmoManagementSnapshot {
  people: ManagedPersonRecord[];
  assignments: RoleAssignmentRecord[];
  projects: Array<{ id: string; projectCode: string | null; projectName: string }>;
  eligibilities: RoleEligibilityRecord[];
}

export class PmoManagementService {
  constructor(private readonly dependencies: {
    unitOfWork: AuthUnitOfWork;
    tokenCodec: SessionTokenCodec;
  }) {}

  list(rawSessionToken: string, now: Date): Promise<PmoManagementSnapshot> {
    return this.runAsPmo(rawSessionToken, now, async (repositories) => {
      const people = await repositories.people.listForManagement();
      const assignments = await repositories.roles.listForManagement();
      const projects = await repositories.roles.listAssignableProjects();
      const eligibilities = await (repositories.roles.listEligibilityForManagement?.() ?? []);
      return { people, assignments, projects, eligibilities };
    });
  }

  grantKeySubIEligibility(input: {
    rawSessionToken: string;
    targetPersonId: string;
    reason: string;
    now: Date;
    correlationId: string;
  }): Promise<RoleEligibilityRecord> {
    return this.runAsPmo(input.rawSessionToken, input.now, async (repositories, actor) => {
      const reason = input.reason.trim();
      if (!reason || !repositories.roles.createEligibility) throw new PmoManagementError("INVALID_INPUT");
      const person = await repositories.people.findByIdForUpdate(input.targetPersonId);
      if (!person || person.accountStatus !== "ACTIVE") throw new PmoManagementError("INVALID_INPUT");
      const eligibility = await repositories.roles.createEligibility({
        personId: person.id,
        grantedByPersonId: actor.actorPersonId,
        reason,
        grantedAt: input.now,
      });
      await repositories.audit.append({
        ...actor,
        actionCode: "KEY_SUB_I_ELIGIBILITY_GRANTED",
        result: "SUCCESS",
        entityType: "ROLE_ELIGIBILITY",
        entityId: eligibility.id,
        summary: "Key Sub-I 申请资格已生效",
        changedFields: ["role_code", "status"],
        correlationId: input.correlationId,
      });
      return eligibility;
    });
  }

  endKeySubIEligibility(input: {
    rawSessionToken: string;
    eligibilityId: string;
    now: Date;
    correlationId: string;
  }): Promise<void> {
    return this.runAsPmo(input.rawSessionToken, input.now, async (repositories, actor) => {
      if (!repositories.roles.findEligibilityByIdForUpdate || !repositories.roles.endEligibility) {
        throw new PmoManagementError("INVALID_INPUT");
      }
      const eligibility = await repositories.roles.findEligibilityByIdForUpdate(input.eligibilityId);
      if (!eligibility) throw new PmoManagementError("NOT_FOUND");
      if (eligibility.status !== "ACTIVE") throw new PmoManagementError("INVALID_INPUT");
      await repositories.roles.endEligibility(eligibility.id, actor.actorPersonId, input.now);
      await repositories.audit.append({
        ...actor,
        actionCode: "KEY_SUB_I_ELIGIBILITY_ENDED",
        result: "SUCCESS",
        entityType: "ROLE_ELIGIBILITY",
        entityId: eligibility.id,
        summary: "Key Sub-I 申请资格已结束",
        changedFields: ["status", "ended_at"],
        correlationId: input.correlationId,
      });
    });
  }

  createInvitedAccount(input: {
    rawSessionToken: string;
    loginName: string;
    displayName: string;
    now: Date;
    correlationId: string;
  }): Promise<PersonAuthRecord> {
    return this.runAsPmo(input.rawSessionToken, input.now, async (repositories, actor) => {
      let loginName: string;
      try {
        loginName = parseLoginName(input.loginName);
      } catch {
        throw new PmoManagementError("LOGIN_NAME_INVALID");
      }
      const displayName = input.displayName.trim();
      if (displayName.length < 1 || displayName.length > 100) {
        throw new PmoManagementError("DISPLAY_NAME_INVALID");
      }
      if (await repositories.people.findByLoginName(loginName)) {
        throw new PmoManagementError("LOGIN_NAME_DUPLICATE");
      }
      let person: PersonAuthRecord;
      try {
        person = await repositories.people.create({
          loginName,
          displayName,
          passwordHash: null,
          accountStatus: "INVITED",
          mustChangePassword: true,
        });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "LOGIN_NAME_DUPLICATE") {
          throw new PmoManagementError("LOGIN_NAME_DUPLICATE");
        }
        throw error;
      }
      await repositories.audit.append({
        ...actor,
        actionCode: "ACCOUNT_CREATED",
        result: "SUCCESS",
        entityType: "PERSON",
        entityId: person.id,
        summary: "邀请账号已创建",
        changedFields: ["login_name", "display_name", "account_status"],
        correlationId: input.correlationId,
      });
      return person;
    });
  }

  issueCredential(input: {
    rawSessionToken: string;
    targetPersonId: string;
    purpose: CredentialTokenPurpose;
    now: Date;
    correlationId: string;
  }): Promise<{ token: string; expiresAt: Date }> {
    return this.runAsPmo(input.rawSessionToken, input.now, async (repositories, actor) => {
      const person = await repositories.people.findByIdForUpdate(input.targetPersonId);
      const valid = person && person.accountStatus !== "DISABLED" && (
        input.purpose === "ACTIVATION"
          ? person.accountStatus === "INVITED" && person.passwordHash === null
          : person.passwordHash !== null
      );
      if (!valid || !person) throw new PmoManagementError("INVALID_INPUT");
      const generated = this.dependencies.tokenCodec.generate();
      const expiresAt = new Date(input.now.getTime() + (
        input.purpose === "ACTIVATION"
          ? ACTIVATION_TOKEN_TTL_MS
          : PASSWORD_RESET_TOKEN_TTL_MS
      ));
      await repositories.credentials.revokeOpen(person.id, input.purpose, input.now);
      const record = await repositories.credentials.create({
        personId: person.id,
        purpose: input.purpose,
        tokenHash: generated.tokenHash,
        expiresAt,
        createdAt: input.now,
      });
      await repositories.audit.append({
        ...actor,
        actionCode: `${input.purpose}_TOKEN_ISSUED`,
        result: "SUCCESS",
        entityType: "AUTH_CREDENTIAL_TOKEN",
        entityId: record.id,
        summary: "一次性凭证已签发",
        correlationId: input.correlationId,
      });
      return { token: generated.rawToken, expiresAt };
    });
  }

  changeAccountStatus(input: {
    rawSessionToken: string;
    targetPersonId: string;
    operation: AccountStatusOperation;
    now: Date;
    correlationId: string;
  }): Promise<void> {
    return this.runAsPmo(input.rawSessionToken, input.now, async (repositories, actor) => {
      const removesAvailability = input.operation === "MANUAL_LOCK" || input.operation === "DISABLE";
      const availablePmos = removesAvailability
        ? await repositories.roles.countAvailablePmosForUpdate(input.now)
        : null;
      const person = await repositories.people.findByIdForUpdate(input.targetPersonId);
      if (!person) throw new PmoManagementError("NOT_FOUND");
      if (
        removesAvailability &&
        await repositories.roles.personHasActiveGlobalPmo(person.id) &&
        availablePmos !== null && availablePmos <= 1
      ) throw new PmoManagementError("LAST_AVAILABLE_PMO");
      if (
        input.operation === "DISABLE" &&
        await repositories.roles.personHasActivePrimaryKeySubIForUpdate(person.id)
      ) throw new PmoManagementError("PRIMARY_KEY_SUB_I_HANDOVER_REQUIRED");
      const transition = transitionAccountStatus(
        person.accountStatus,
        input.operation,
        person.passwordHash !== null,
      );
      if (!transition.allowed) throw new PmoManagementError("INVALID_INPUT");
      await repositories.people.updateStatus(person.id, transition.status);
      if (removesAvailability) await repositories.sessions.revokeForPerson(person.id, input.now);
      if (input.operation === "DISABLE") {
        await repositories.credentials.revokeOpen(person.id, "ACTIVATION", input.now);
        await repositories.credentials.revokeOpen(person.id, "PASSWORD_RESET", input.now);
      }
      await repositories.audit.append({
        ...actor,
        actionCode: `ACCOUNT_${input.operation}`,
        result: "SUCCESS",
        entityType: "PERSON",
        entityId: person.id,
        summary: "账号状态已更新",
        changedFields: ["account_status"],
        correlationId: input.correlationId,
      });
    });
  }

  grantRole(input: {
    rawSessionToken: string;
    targetPersonId: string;
    roleCode: RoleCode;
    projectId: string | null;
    now: Date;
    correlationId: string;
  }): Promise<RoleAssignmentRecord> {
    return this.runAsPmo(input.rawSessionToken, input.now, async (repositories, actor) => {
      const globalRole = input.roleCode === "PMO" || input.roleCode === "DEAN";
      if ((globalRole && input.projectId !== null) || (!globalRole && input.projectId === null)) {
        throw new PmoManagementError("INVALID_INPUT");
      }
      if (!await repositories.people.findByIdForUpdate(input.targetPersonId)) {
        throw new PmoManagementError("NOT_FOUND");
      }
      if (
        input.projectId &&
        !await repositories.roles.projectIsAssignableForUpdate(input.projectId)
      ) throw new PmoManagementError("PROJECT_NOT_ASSIGNABLE");
      const assignment = await repositories.roles.create({
        personId: input.targetPersonId,
        roleCode: input.roleCode,
        projectId: input.projectId,
        assignmentStatus: "ACTIVE",
        isPrimary: false,
        grantSource: "PMO_ACTION",
        grantedByPersonId: actor.actorPersonId,
        proposedAt: input.now,
        activatedAt: input.now,
      });
      await repositories.audit.append({
        ...actor,
        actionCode: "ROLE_ASSIGNMENT_GRANTED",
        result: "SUCCESS",
        entityType: "ROLE_ASSIGNMENT",
        entityId: assignment.id,
        summary: "角色授权已生效",
        changedFields: ["role_code", "project_id", "assignment_status"],
        correlationId: input.correlationId,
      });
      return assignment;
    });
  }

  endRole(input: {
    rawSessionToken: string;
    assignmentId: string;
    now: Date;
    correlationId: string;
  }): Promise<void> {
    return this.runAsPmo(input.rawSessionToken, input.now, async (repositories, actor) => {
      const availablePmos = await repositories.roles.countAvailablePmosForUpdate(input.now);
      const assignment = await repositories.roles.findByIdForUpdate(input.assignmentId);
      if (!assignment) throw new PmoManagementError("NOT_FOUND");
      if (
        assignment.assignmentStatus === "ACTIVE" &&
        assignment.roleCode === "PMO" &&
        assignment.projectId === null &&
        availablePmos <= 1
      ) throw new PmoManagementError("LAST_AVAILABLE_PMO");
      if (
        assignment.assignmentStatus === "ACTIVE" &&
        assignment.roleCode === "KEY_SUB_I" &&
        assignment.isPrimary
      ) throw new PmoManagementError("PRIMARY_KEY_SUB_I_HANDOVER_REQUIRED");
      await repositories.roles.end(assignment.id, input.now);
      await repositories.audit.append({
        ...actor,
        actionCode: "ROLE_ASSIGNMENT_ENDED",
        result: "SUCCESS",
        entityType: "ROLE_ASSIGNMENT",
        entityId: assignment.id,
        summary: "角色授权已结束",
        changedFields: ["assignment_status", "ended_at"],
        correlationId: input.correlationId,
      });
    });
  }

  private runAsPmo<T>(
    rawSessionToken: string,
    now: Date,
    operation: (
      repositories: AuthRepositories,
      actor: { actorPersonId: string; actorRoleCode: "PMO"; sessionId: string },
    ) => Promise<T>,
  ): Promise<T> {
    const tokenHash = this.dependencies.tokenCodec.hash(rawSessionToken);
    return this.dependencies.unitOfWork.run(async (repositories) => {
      const session = await repositories.sessions.findByTokenHash(tokenHash);
      const person = session ? await repositories.people.findById(session.personId) : null;
      if (!session || !person || session.activeRoleCode !== "PMO") {
        throw new PmoManagementError("UNAUTHORIZED");
      }
      const validSession = evaluateSession({
        accountStatus: person.accountStatus,
        lockedUntil: person.lockedUntil,
        expiresAt: session.expiresAt,
        lastSeenAt: session.lastSeenAt,
        revokedAt: session.revokedAt,
      }, now).valid;
      if (
        !validSession ||
        person.mustChangePassword ||
        !await repositories.roles.hasActiveRole({
          personId: person.id,
          roleCode: "PMO",
          projectId: null,
        })
      ) throw new PmoManagementError("UNAUTHORIZED");
      await repositories.sessions.touch(session.id, now);
      return operation(repositories, {
        actorPersonId: person.id,
        actorRoleCode: "PMO",
        sessionId: session.id,
      });
    });
  }
}
