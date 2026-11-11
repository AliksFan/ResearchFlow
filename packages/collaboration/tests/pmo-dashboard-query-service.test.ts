import { describe, expect, it, vi } from "vitest";

import {
  CollaborationError,
  PmoDashboardQueryService,
  type CollaborationActor,
  type PmoDashboardQuery,
  type PmoDashboardRepository,
} from "../src/index.js";

const actor: CollaborationActor = {
  personId: "00000000-0000-4000-8000-000000000001",
  roleCode: "PMO",
  sessionId: "00000000-0000-4000-8000-000000000002",
};

const query: PmoDashboardQuery = {
  focus: "all",
  applicationView: "active",
  q: "",
  hideFinished: false,
  sort: "action",
  order: "desc",
  page: 1,
  pageSize: 50,
};

describe("PmoDashboardQueryService", () => {
  it("rejects non-PMO actors before calling the repository", async () => {
    const repository = { queryProjects: vi.fn() } as unknown as PmoDashboardRepository;
    const service = new PmoDashboardQueryService(repository);

    expect(() => service.getProjectDashboard({ ...actor, roleCode: "DEAN" }, query)).toThrowError(expect.objectContaining<Partial<CollaborationError>>({
      code: "COLLABORATION_FORBIDDEN",
    }));
    expect(repository.queryProjects).not.toHaveBeenCalled();
  });

  it("passes the validated fixed-size query to the repository", async () => {
    const result = {
      snapshotAt: "2026-09-01T01:00:00.000Z",
      counts: { allItems: 0, applicationItems: 0, pendingPmoProjects: 0, pendingDeanProjects: 0, implementationProjects: 0, confirmationClosureProjects: 0 },
      filteredTotal: 0,
      page: 1,
      pageSize: 50 as const,
      items: [],
    };
    const repository: PmoDashboardRepository = { queryProjects: vi.fn().mockResolvedValue(result) };
    const service = new PmoDashboardQueryService(repository);

    await expect(service.getProjectDashboard(actor, query)).resolves.toEqual(result);
    expect(repository.queryProjects).toHaveBeenCalledWith(actor, query);
  });
});
