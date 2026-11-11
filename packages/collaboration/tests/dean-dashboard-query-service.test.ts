import { describe, expect, it, vi } from "vitest";

import {
  CollaborationError,
  DeanDashboardQueryService,
  type CollaborationActor,
  type DeanDashboardQuery,
  type DeanDashboardRepository,
} from "../src/index.js";

const actor: CollaborationActor = {
  personId: "00000000-0000-4000-8000-000000000001",
  roleCode: "DEAN",
  sessionId: "00000000-0000-4000-8000-000000000002",
};

const query: DeanDashboardQuery = {
  focus: "all",
  q: "",
  hideFinished: false,
  sort: "action",
  order: "desc",
  page: 1,
  pageSize: 50,
};

describe("DeanDashboardQueryService", () => {
  it("rejects non-dean actors before calling the repository", () => {
    const repository = { queryProjects: vi.fn() } as unknown as DeanDashboardRepository;
    const service = new DeanDashboardQueryService(repository);

    expect(() => service.getProjectDashboard({ ...actor, roleCode: "PMO" }, query)).toThrowError(expect.objectContaining<Partial<CollaborationError>>({
      code: "COLLABORATION_FORBIDDEN",
    }));
    expect(repository.queryProjects).not.toHaveBeenCalled();
  });

  it("passes a valid fixed-size query to the repository", async () => {
    const result = {
      snapshotAt: "2026-09-01T01:00:00.000Z",
      counts: { allProjects: 0, decisionProjects: 0, implementationProjects: 0, confirmationProjects: 0, reporterFeedbackProjects: 0 },
      filteredTotal: 0,
      page: 1,
      pageSize: 50 as const,
      items: [],
    };
    const repository: DeanDashboardRepository = { queryProjects: vi.fn().mockResolvedValue(result) };
    const service = new DeanDashboardQueryService(repository);

    await expect(service.getProjectDashboard(actor, query)).resolves.toEqual(result);
    expect(repository.queryProjects).toHaveBeenCalledWith(actor, query);
  });
});
