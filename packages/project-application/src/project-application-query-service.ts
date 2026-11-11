import type { ProjectApplicationActor } from "./contracts.js";
import {
  ProjectApplicationError,
  type ProjectApplicationGateway,
} from "./repository-contracts.js";

export class ProjectApplicationQueryService {
  constructor(private readonly gateway: ProjectApplicationGateway) {}

  listMyProjectWorkspace(actor: ProjectApplicationActor) {
    requireRole(actor, "KEY_SUB_I");
    return this.gateway.listMyApplications(actor);
  }

  getMyApplicationDetail(actor: ProjectApplicationActor, projectId: string) {
    requireRole(actor, "KEY_SUB_I");
    return this.gateway.getMyApplicationDetail(actor, projectId);
  }

  listPmoReviewQueue(actor: ProjectApplicationActor) {
    requireRole(actor, "PMO");
    return this.gateway.listPmoReviewQueue(actor);
  }

  getPmoApplicationDetail(actor: ProjectApplicationActor, projectId: string) {
    requireRole(actor, "PMO");
    return this.gateway.getPmoApplicationDetail(actor, projectId);
  }
}

function requireRole(actor: ProjectApplicationActor, roleCode: "KEY_SUB_I" | "PMO"): void {
  if (actor.roleCode !== roleCode) {
    throw new ProjectApplicationError("PROJECT_APPLICATION_FORBIDDEN");
  }
}
