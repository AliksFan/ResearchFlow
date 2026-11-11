import {
  COLLABORATION_RESPONSIBILITY_TYPES,
  type CollaborationActor,
  type CollaborationResponsibilityType,
  type CollaborationTimeLimit,
  type EffectiveCollaborationTimeLimit,
  type GlobalTimeLimitChange,
  type ProjectTimeLimitChange,
} from "./contracts.js";
import {
  CollaborationError,
  type CollaborationRepository,
} from "./repository-contracts.js";

export class CollaborationService {
  constructor(private readonly repository: CollaborationRepository) {}

  listProjects(actor: CollaborationActor) {
    requireCoreRole(actor);
    return this.repository.listAccessibleProjects(actor);
  }

  getOverview(actor: CollaborationActor, projectId: string) {
    requireCoreRole(actor);
    return this.repository.getExecutionOverview(actor, projectId);
  }

  async listTimeLimits(actor: CollaborationActor, projectId: string) {
    requireCoreRole(actor);
    const settings = await this.repository.listTimeLimits(actor, projectId);
    return resolveEffectiveTimeLimits(settings, projectId);
  }

  listGlobalTimeLimits(actor: CollaborationActor) {
    if (actor.roleCode !== "PMO") {
      throw new CollaborationError("COLLABORATION_FORBIDDEN");
    }
    return this.repository.listGlobalTimeLimits(actor);
  }

  async saveGlobalTimeLimits(
    actor: CollaborationActor,
    input: { changes: GlobalTimeLimitChange[] },
  ): Promise<void> {
    if (actor.roleCode !== "PMO") throw new CollaborationError("COLLABORATION_FORBIDDEN");
    const seen = new Set<CollaborationResponsibilityType>();
    for (const change of input.changes) {
      if (seen.has(change.responsibilityType) || !validTimeLimit(change)) {
        throw new CollaborationError("INVALID_TIME_LIMIT");
      }
      seen.add(change.responsibilityType);
    }
    await this.repository.saveGlobalTimeLimits({ actor, changes: input.changes });
  }

  async saveProjectTimeLimits(
    actor: CollaborationActor,
    input: { projectId: string; changes: ProjectTimeLimitChange[] },
  ): Promise<void> {
    if (actor.roleCode !== "PMO") throw new CollaborationError("COLLABORATION_FORBIDDEN");
    if (!input.projectId.trim()) throw new CollaborationError("INVALID_TIME_LIMIT");
    const seen = new Set<CollaborationResponsibilityType>();
    for (const change of input.changes) {
      if (seen.has(change.responsibilityType)) throw new CollaborationError("INVALID_TIME_LIMIT");
      seen.add(change.responsibilityType);
      if (change.mode === "PROJECT_OVERRIDE" && !validTimeLimit(change)) {
        throw new CollaborationError("INVALID_TIME_LIMIT");
      }
    }
    await this.repository.saveProjectTimeLimits({ actor, ...input, projectId: input.projectId.trim() });
  }

  async configureTimeLimit(
    actor: CollaborationActor,
    input: {
      projectId: string | null;
      responsibilityType: CollaborationResponsibilityType;
      timeLimitDays: number;
      reminderIntervalDays: number;
    },
  ) {
    if (actor.roleCode !== "PMO") {
      throw new CollaborationError("COLLABORATION_FORBIDDEN");
    }
    if (
      !Number.isInteger(input.timeLimitDays) ||
      !Number.isInteger(input.reminderIntervalDays) ||
      input.timeLimitDays <= 0 ||
      input.reminderIntervalDays <= 0
    ) {
      throw new CollaborationError("INVALID_TIME_LIMIT");
    }
    return await this.repository.upsertTimeLimit({ actor, ...input });
  }
}

function validTimeLimit(value: { timeLimitDays: number; reminderIntervalDays: number }): boolean {
  return Number.isInteger(value.timeLimitDays) && value.timeLimitDays > 0 &&
    Number.isInteger(value.reminderIntervalDays) && value.reminderIntervalDays > 0;
}

function resolveEffectiveTimeLimits(
  settings: CollaborationTimeLimit[],
  projectId: string,
): EffectiveCollaborationTimeLimit[] {
  const effectiveByType = new Map<CollaborationResponsibilityType, CollaborationTimeLimit>();
  for (const setting of settings) {
    const current = effectiveByType.get(setting.responsibilityType);
    if (!current || setting.projectId === projectId) {
      effectiveByType.set(setting.responsibilityType, setting);
    }
  }
  return COLLABORATION_RESPONSIBILITY_TYPES.flatMap((responsibilityType) => {
    const setting = effectiveByType.get(responsibilityType);
    return setting ? [{
      ...setting,
      source: setting.projectId === projectId ? "PROJECT_OVERRIDE" : "GLOBAL_DEFAULT",
    }] : [];
  });
}

function requireCoreRole(actor: CollaborationActor): void {
  if (!(["PMO", "DEAN", "KEY_SUB_I"] as const).includes(actor.roleCode)) {
    throw new CollaborationError("COLLABORATION_FORBIDDEN");
  }
}
