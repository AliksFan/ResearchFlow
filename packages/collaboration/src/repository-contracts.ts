import type {
  CollaborationActor,
  CollaborationErrorCode,
  CollaborationResponsibilityType,
  CollaborationTimeLimit,
  GlobalTimeLimitChange,
  ProjectExecutionListItem,
  ProjectExecutionOverview,
  ProjectTimeLimitChange,
} from "./contracts.js";
export type { PmoDashboardRepository } from "./pmo-dashboard-contracts.js";
export type { DeanDashboardRepository } from "./dean-dashboard-contracts.js";

export interface CollaborationRepository {
  listAccessibleProjects(actor: CollaborationActor): Promise<ProjectExecutionListItem[]>;
  getExecutionOverview(
    actor: CollaborationActor,
    projectId: string,
  ): Promise<ProjectExecutionOverview | null>;
  listTimeLimits(actor: CollaborationActor, projectId: string): Promise<CollaborationTimeLimit[]>;
  listGlobalTimeLimits(actor: CollaborationActor): Promise<CollaborationTimeLimit[]>;
  saveGlobalTimeLimits(input: {
    actor: CollaborationActor;
    changes: GlobalTimeLimitChange[];
  }): Promise<void>;
  saveProjectTimeLimits(input: {
    actor: CollaborationActor;
    projectId: string;
    changes: ProjectTimeLimitChange[];
  }): Promise<void>;
  upsertTimeLimit(input: {
    actor: CollaborationActor;
    projectId: string | null;
    responsibilityType: CollaborationResponsibilityType;
    timeLimitDays: number;
    reminderIntervalDays: number;
  }): Promise<CollaborationTimeLimit>;
}

export class CollaborationError extends Error {
  constructor(public readonly code: CollaborationErrorCode) {
    super(code);
    this.name = "CollaborationError";
  }
}
