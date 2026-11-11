import { transitionAccountStatus } from "./account-policy.js";
import type { RoleCode } from "./contracts.js";
import type { AuthUnitOfWork } from "./repository-contracts.js";

export type AuthDomainErrorCode =
  | "ACCOUNT_NOT_FOUND"
  | "ROLE_ASSIGNMENT_NOT_FOUND"
  | "INVALID_ACCOUNT_TRANSITION"
  | "LAST_AVAILABLE_PMO"
  | "PRIMARY_KEY_SUB_I_HANDOVER_REQUIRED";

export class AuthDomainError extends Error {
  constructor(readonly code: AuthDomainErrorCode) {
    super(code);
    this.name = "AuthDomainError";
  }
}

export type AccountStatusOperation =
  | "MANUAL_LOCK"
  | "UNLOCK"
  | "DISABLE"
  | "REENABLE";

export class AccountAdministrationService {
  constructor(private readonly unitOfWork: AuthUnitOfWork) {}

  async changeAccountStatus(input: {
    actorPersonId: string;
    actorRoleCode: RoleCode;
    targetPersonId: string;
    operation: AccountStatusOperation;
    correlationId: string;
    now: Date;
  }): Promise<void> {
    await this.unitOfWork.run(async (repositories) => {
      const removesAvailability =
        input.operation === "MANUAL_LOCK" || input.operation === "DISABLE";
      const availablePmoCount = removesAvailability
        ? await repositories.roles.countAvailablePmosForUpdate(input.now)
        : null;
      const person = await repositories.people.findByIdForUpdate(
        input.targetPersonId,
      );
      if (!person) {
        throw new AuthDomainError("ACCOUNT_NOT_FOUND");
      }

      if (
        removesAvailability &&
        (await repositories.roles.personHasActiveGlobalPmo(person.id)) &&
        availablePmoCount !== null &&
        availablePmoCount <= 1
      ) {
        throw new AuthDomainError("LAST_AVAILABLE_PMO");
      }
      if (
        input.operation === "DISABLE" &&
        await repositories.roles.personHasActivePrimaryKeySubIForUpdate(person.id)
      ) {
        throw new AuthDomainError("PRIMARY_KEY_SUB_I_HANDOVER_REQUIRED");
      }

      const transition = transitionAccountStatus(
        person.accountStatus,
        input.operation,
        person.passwordHash !== null,
      );
      if (!transition.allowed) {
        throw new AuthDomainError("INVALID_ACCOUNT_TRANSITION");
      }

      await repositories.people.updateStatus(person.id, transition.status);
      if (removesAvailability) {
        await repositories.sessions.revokeForPerson(person.id, input.now);
      }
      if (input.operation === "DISABLE") {
        await repositories.credentials.revokeOpen(person.id, "ACTIVATION", input.now);
        await repositories.credentials.revokeOpen(person.id, "PASSWORD_RESET", input.now);
      }
      await repositories.audit.append({
        actorPersonId: input.actorPersonId,
        actorRoleCode: input.actorRoleCode,
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

  async endRoleAssignment(input: {
    actorPersonId: string;
    actorRoleCode: RoleCode;
    assignmentId: string;
    correlationId: string;
    now: Date;
  }): Promise<void> {
    await this.unitOfWork.run(async (repositories) => {
      const availablePmoCount =
        await repositories.roles.countAvailablePmosForUpdate(input.now);
      const assignment = await repositories.roles.findByIdForUpdate(
        input.assignmentId,
      );
      if (!assignment) {
        throw new AuthDomainError("ROLE_ASSIGNMENT_NOT_FOUND");
      }
      if (
        assignment.assignmentStatus === "ACTIVE" &&
        assignment.roleCode === "PMO" &&
        assignment.projectId === null &&
        availablePmoCount <= 1
      ) {
        throw new AuthDomainError("LAST_AVAILABLE_PMO");
      }
      if (
        assignment.assignmentStatus === "ACTIVE" &&
        assignment.roleCode === "KEY_SUB_I" &&
        assignment.isPrimary
      ) {
        throw new AuthDomainError("PRIMARY_KEY_SUB_I_HANDOVER_REQUIRED");
      }

      await repositories.roles.end(assignment.id, input.now);
      await repositories.audit.append({
        actorPersonId: input.actorPersonId,
        actorRoleCode: input.actorRoleCode,
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
}
