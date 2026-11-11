import { evaluatePasswordCandidate } from "./password-policy.js";
import type { PasswordHasher } from "./password-hasher.js";
import type { AuthUnitOfWork } from "./repository-contracts.js";

export class DefaultPmoBootstrapService {
  constructor(
    private readonly unitOfWork: AuthUnitOfWork,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async run(input: {
    initialPassword: string;
    correlationId: string;
    now: Date;
  }): Promise<void> {
    const passwordDecision = evaluatePasswordCandidate({
      loginName: "pmo",
      password: input.initialPassword,
    });
    if (!passwordDecision.ok) {
      throw new Error("INVALID_INITIAL_PMO_PASSWORD");
    }

    const candidateHash = await this.passwordHasher.hash(input.initialPassword);
    await this.unitOfWork.run(async (repositories) => {
      let person = await repositories.people.findByLoginName("pmo");
      let changed = false;
      if (!person) {
        person = await repositories.people.create({
          loginName: "pmo",
          displayName: "PMO",
          passwordHash: candidateHash,
          accountStatus: "ACTIVE",
          mustChangePassword: true,
        });
        changed = true;
      }

      const bootstrap =
        await repositories.roles.findSystemBootstrapPmoForUpdate();
      if (!bootstrap) {
        await repositories.roles.create({
          personId: person.id,
          roleCode: "PMO",
          projectId: null,
          assignmentStatus: "ACTIVE",
          isPrimary: false,
          grantSource: "SYSTEM_BOOTSTRAP",
          grantedByPersonId: null,
          proposedAt: input.now,
          activatedAt: input.now,
        });
        changed = true;
      } else if (bootstrap.personId !== person.id) {
        throw new Error("SYSTEM_BOOTSTRAP_PMO_CONFLICT");
      }

      if (changed) {
        await repositories.audit.append({
          actorPersonId: null,
          actorIdentifierMasked: "system-bootstrap",
          actionCode: "DEFAULT_PMO_BOOTSTRAPPED",
          result: "SUCCESS",
          entityType: "PERSON",
          entityId: person.id,
          summary: "默认 PMO 账号与系统授权已初始化",
          changedFields: ["login_name", "password_hash", "role_assignment"],
          correlationId: input.correlationId,
        });
      }
    });
  }
}
