import { describe, expect, it, vi } from "vitest";

import {
  ProjectApplicationService,
  type ProjectApplicationGateway,
  type ProjectApplicationSnapshot,
} from "../src/index.js";

const snapshot: ProjectApplicationSnapshot = {
  projectId: "project-1",
  applicationCode: "APP-0001",
  projectCode: null,
  projectName: "虚构项目",
  status: "DRAFT",
  rowVersion: 0,
  applicationVersionId: "version-1",
  applicationVersionNo: 1,
  reviewId: null,
  reviewSubmissionNo: null,
};

describe("ProjectApplicationService", () => {
  it("delegates a valid first draft save", async () => {
    const gateway = createGateway();
    const service = new ProjectApplicationService(gateway);
    await expect(service.createDraft({
      actor: keySubIActor(),
      commandId: "command-1",
      projectName: "虚构项目",
    })).resolves.toEqual(snapshot);
    expect(gateway.createDraft).toHaveBeenCalledOnce();
  });

  it("rejects non-Key Sub-I draft creation before persistence", async () => {
    const gateway = createGateway();
    const service = new ProjectApplicationService(gateway);
    await expect(service.createDraft({
      actor: pmoActor(),
      commandId: "command-1",
      projectName: "虚构项目",
    })).rejects.toMatchObject({ code: "PROJECT_APPLICATION_FORBIDDEN" });
    expect(gateway.createDraft).not.toHaveBeenCalled();
  });

  it("requires reasons for PMO return, hold, and rejection", async () => {
    const service = new ProjectApplicationService(createGateway());
    const input = {
      actor: pmoActor(),
      commandId: "command-2",
      projectId: "project-1",
      applicationVersionId: "version-1",
      expectedRowVersion: 2,
      reviewId: "review-1",
      comment: "   ",
    };
    for (const operation of [
      service.returnForRevision.bind(service),
      service.putOnHold.bind(service),
      service.rejectApplication.bind(service),
    ]) {
      await expect(operation(input)).rejects.toMatchObject({
        code: "PROJECT_APPLICATION_VALIDATION_FAILED",
      });
    }
  });

  it("never accepts patient-level text during draft save", async () => {
    const gateway = createGateway();
    const service = new ProjectApplicationService(gateway);
    await expect(service.createDraft({
      actor: keySubIActor(),
      commandId: "command-3",
      projectName: "患者姓名：不应保存",
    })).rejects.toMatchObject({
      code: "PROJECT_APPLICATION_PATIENT_DATA_PROHIBITED",
    });
    expect(gateway.createDraft).not.toHaveBeenCalled();
  });
});

function keySubIActor() {
  return { personId: "person-key", roleCode: "KEY_SUB_I" as const, sessionId: "session-key" };
}

function pmoActor() {
  return { personId: "person-pmo", roleCode: "PMO" as const, sessionId: "session-pmo" };
}

function createGateway(): ProjectApplicationGateway {
  return {
    createDraft: vi.fn().mockResolvedValue(snapshot),
    saveDraft: vi.fn().mockResolvedValue(snapshot),
    saveSwimlane: vi.fn().mockResolvedValue(snapshot),
    submitApplication: vi.fn().mockResolvedValue(snapshot),
    withdrawApplication: vi.fn().mockResolvedValue(snapshot),
    returnForRevision: vi.fn().mockResolvedValue(snapshot),
    putOnHold: vi.fn().mockResolvedValue(snapshot),
    resumeReview: vi.fn().mockResolvedValue(snapshot),
    rejectApplication: vi.fn().mockResolvedValue(snapshot),
    approveAndEstablish: vi.fn().mockResolvedValue(snapshot),
    listMyApplications: vi.fn().mockResolvedValue([]),
    getMyApplicationDetail: vi.fn().mockResolvedValue(null),
    listPmoReviewQueue: vi.fn().mockResolvedValue([]),
    getPmoApplicationDetail: vi.fn().mockResolvedValue(null),
    getFormOptions: vi.fn().mockResolvedValue({
      people: [], directions: [], researchTypes: [], priorities: [], lifecycleTemplates: [],
    }),
  };
}
