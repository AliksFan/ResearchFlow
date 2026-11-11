import type {
  AuthorizationDenialCode,
  RoleAction,
  RoleCode,
} from "./contracts.js";
import type { SessionTokenCodec } from "./authentication-service.js";
import { getRoleActionDecision } from "./authorization-policy.js";
import type { AuthRepositories, AuthUnitOfWork } from "./repository-contracts.js";
import { evaluateSession } from "./session-policy.js";

export type AuthorizationServiceResult =
  | {
      allowed: true;
      personId: string;
      sessionId: string;
      roleCode: RoleCode;
      visibleProjectIds: string[];
    }
  | { allowed: false; code: AuthorizationDenialCode };

export class AuthorizationService {
  constructor(
    private readonly dependencies: {
      unitOfWork: AuthUnitOfWork;
      tokenCodec: SessionTokenCodec;
    },
  ) {}

  async authorize(input: {
    rawSessionToken: string;
    action: RoleAction;
    projectId?: string;
    contextualPermissionSatisfied?: boolean;
    now: Date;
    correlationId: string;
  }): Promise<AuthorizationServiceResult> {
    const tokenHash = this.dependencies.tokenCodec.hash(input.rawSessionToken);
    return this.dependencies.unitOfWork.run(async (repositories) => {
      const session = await repositories.sessions.findByTokenHash(tokenHash);
      if (!session) return { allowed: false, code: "UNAUTHENTICATED" };
      const person = await repositories.people.findById(session.personId);
      if (!person) return { allowed: false, code: "ACCOUNT_NOT_ACTIVE" };
      const sessionDecision = evaluateSession({
        accountStatus: person.accountStatus,
        lockedUntil: person.lockedUntil,
        expiresAt: session.expiresAt,
        lastSeenAt: session.lastSeenAt,
        revokedAt: session.revokedAt,
      }, input.now);
      if (!sessionDecision.valid) {
        return {
          allowed: false,
          code: sessionDecision.code === "ACCOUNT_NOT_ACTIVE"
            ? "ACCOUNT_NOT_ACTIVE"
            : "SESSION_INVALID",
        };
      }
      const roleCode = session.activeRoleCode;
      if (!roleCode || !(await repositories.roles.hasActiveRole({
        personId: person.id,
        roleCode,
      }))) {
        await repositories.sessions.setActiveRole(session.id, null);
        return this.deny(repositories, session.id, person.id, roleCode, "ROLE_NOT_ACTIVE", input);
      }
      await repositories.sessions.touch(session.id, input.now);
      if (person.mustChangePassword) {
        return this.deny(repositories, session.id, person.id, roleCode, "ACTION_FORBIDDEN", input);
      }
      const decision = getRoleActionDecision(roleCode, input.action);
      if (decision === "DENY") {
        return this.deny(repositories, session.id, person.id, roleCode, "ACTION_FORBIDDEN", input);
      }
      const visibleProjectIds = input.projectId
        ? [input.projectId]
        : await repositories.roles.listVisibleProjectIds(person.id, roleCode);
      if (input.projectId && !await repositories.roles.hasProjectAccess({
        personId: person.id,
        roleCode,
        projectId: input.projectId,
      })) return this.deny(
        repositories,
        session.id,
        person.id,
        roleCode,
        "PROJECT_OUT_OF_SCOPE",
        input,
      );
      if (decision === "CONDITIONAL" && !input.contextualPermissionSatisfied) {
        return this.deny(repositories, session.id, person.id, roleCode, "FIELD_OR_STATE_FORBIDDEN", input);
      }
      return {
        allowed: true,
        personId: person.id,
        sessionId: session.id,
        roleCode,
        visibleProjectIds,
      };
    });
  }

  private async deny(
    repositories: AuthRepositories,
    sessionId: string,
    personId: string,
    roleCode: RoleCode | null,
    code: AuthorizationDenialCode,
    input: { action: RoleAction; now: Date; correlationId: string },
  ): Promise<AuthorizationServiceResult> {
    await repositories.audit.append({
      actorPersonId: roleCode ? personId : null,
      actorRoleCode: roleCode,
      sessionId,
      actionCode: "AUTHORIZATION_DENIED",
      result: "FAILURE",
      entityType: "AUTHORIZATION",
      summary: "服务端授权拒绝",
      failureCode: code,
      correlationId: input.correlationId,
    });
    return { allowed: false, code };
  }
}
