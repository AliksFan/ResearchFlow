import type { CollaborationActor } from "./contracts.js";
import { CollaborationError } from "./repository-contracts.js";
import type { DeanDashboardQuery, DeanDashboardRepository } from "./dean-dashboard-contracts.js";

export class DeanDashboardQueryService {
  constructor(private readonly repository: DeanDashboardRepository) {}

  getProjectDashboard(actor: CollaborationActor, query: DeanDashboardQuery) {
    if (actor.roleCode !== "DEAN") throw new CollaborationError("COLLABORATION_FORBIDDEN");
    if (query.pageSize !== 50 || !Number.isInteger(query.page) || query.page < 1) {
      throw new CollaborationError("COLLABORATION_FORBIDDEN");
    }
    return this.repository.queryProjects(actor, query);
  }
}
