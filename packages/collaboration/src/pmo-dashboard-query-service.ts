import type { CollaborationActor } from "./contracts.js";
import { CollaborationError } from "./repository-contracts.js";
import { PMO_DASHBOARD_APPLICATION_VIEWS, type PmoDashboardQuery, type PmoDashboardRepository } from "./pmo-dashboard-contracts.js";

export class PmoDashboardQueryService {
  constructor(private readonly repository: PmoDashboardRepository) {}

  getProjectDashboard(actor: CollaborationActor, query: PmoDashboardQuery) {
    if (actor.roleCode !== "PMO") throw new CollaborationError("COLLABORATION_FORBIDDEN");
    if (query.pageSize !== 50 || !Number.isInteger(query.page) || query.page < 1 || !PMO_DASHBOARD_APPLICATION_VIEWS.includes(query.applicationView)) {
      throw new CollaborationError("COLLABORATION_FORBIDDEN");
    }
    return this.repository.queryProjects(actor, query);
  }
}
