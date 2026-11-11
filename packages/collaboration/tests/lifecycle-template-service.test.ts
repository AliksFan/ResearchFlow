import { describe, expect, it, vi } from "vitest";

import {
  CollaborationError,
  LifecycleTemplateService,
  type LifecycleTemplateRepository,
} from "../src/index.js";

const pmo = { personId: "pmo", sessionId: "session", roleCode: "PMO" } as const;
const dean = { personId: "dean", sessionId: "session", roleCode: "DEAN" } as const;

function repository(): LifecycleTemplateRepository {
  return {
    listVersions: vi.fn(async () => []),
    createSolution: vi.fn(async () => "draft-v1"),
    createDraftFromPublished: vi.fn(async () => "draft-v2"),
    saveDraft: vi.fn(async () => undefined),
    publishDraft: vi.fn(async () => undefined),
    deleteVersion: vi.fn(async () => undefined),
  };
}

describe("LifecycleTemplateService", () => {
  it("normalizes a PMO supplied solution name", async () => {
    const gateway = repository();
    await expect(new LifecycleTemplateService(gateway).createSolution(pmo, "  虚构方案Ａ  ")).resolves.toBe("draft-v1");
    expect(gateway.createSolution).toHaveBeenCalledWith(pmo, "虚构方案A");
  });

  it("allows only PMO to create, edit, and publish template versions", async () => {
    const service = new LifecycleTemplateService(repository());
    await expect(service.createDraftFromPublished(pmo, "published-v1")).resolves.toBe("draft-v2");
    await expect(service.createDraftFromPublished(dean, "published-v1"))
      .rejects.toEqual(new CollaborationError("COLLABORATION_FORBIDDEN"));
  });

  it("accepts one workflow with nodes in different stages", async () => {
    const gateway = repository();
    await new LifecycleTemplateService(gateway).saveDraft(pmo, {
      templateVersionId: "draft-v2",
      templateName: "虚构方案",
      expectedFingerprint: "fingerprint-1",
      stages: [
        { id: "stage-1", code: "S1", name: "阶段一", sortOrder: 1, applicability: "REQUIRED" },
        { id: "stage-2", code: "S2", name: "阶段二", sortOrder: 2, applicability: "REQUIRED" },
      ],
      workflows: [
        { id: "workflow-1", code: "FLOW", name: "跨阶段流程", description: "虚拟流程", requiredByDefault: true, enabled: true },
      ],
      nodes: [
        { id: "node-1", workflowId: "workflow-1", stageId: "stage-1", task: "节点一", ownerRole: "KEY_SUB_I", sortOrder: 1, applicability: "REQUIRED", attachmentRequirement: "NONE", predecessorIds: [] },
        { id: "node-2", workflowId: "workflow-1", stageId: "stage-2", task: "节点二", ownerRole: "KEY_SUB_I", sortOrder: 2, applicability: "REQUIRED", attachmentRequirement: "NONE", predecessorIds: ["node-1"] },
      ],
    });
    expect(gateway.saveDraft).toHaveBeenCalledOnce();
  });

  it("allows an incomplete scheme draft to be saved but not published", async () => {
    const service = new LifecycleTemplateService(repository());
    const input = { templateVersionId: "draft-v1", templateName: "虚构空白方案", expectedFingerprint: "fingerprint-1", stages: [], workflows: [], nodes: [] };
    await expect(service.saveDraft(pmo, input)).resolves.toBeUndefined();
    await expect(service.publishDraft(pmo, input)).rejects.toMatchObject({ code: "LIFECYCLE_TEMPLATE_INVALID_INPUT" });
  });

  it("rejects a node outside the submitted stage and workflow matrix", async () => {
    await expect(new LifecycleTemplateService(repository()).saveDraft(pmo, {
      templateVersionId: "draft-v2",
      templateName: "虚构方案",
      expectedFingerprint: "fingerprint-1",
      stages: [{ id: "stage-1", code: "S1", name: "阶段一", sortOrder: 1, applicability: "REQUIRED" }],
      workflows: [{ id: "workflow-1", code: "FLOW", name: "流程", description: "虚拟流程", requiredByDefault: true, enabled: true }],
      nodes: [{ id: "node-1", workflowId: "missing", stageId: "stage-1", task: "节点", ownerRole: "KEY_SUB_I", sortOrder: 1, applicability: "REQUIRED", attachmentRequirement: "NONE", predecessorIds: [] }],
    })).rejects.toMatchObject({ code: "LIFECYCLE_TEMPLATE_INVALID_INPUT" });
  });

  it("keeps version deletion PMO-only and delegates reference checks", async () => {
    const gateway = repository();
    const service = new LifecycleTemplateService(gateway);
    await service.deleteVersion(pmo, "version-1", "fingerprint-1");
    expect(gateway.deleteVersion).toHaveBeenCalledWith(pmo, "version-1", "fingerprint-1");
    await expect(service.deleteVersion(dean, "version-1", "fingerprint-1"))
      .rejects.toMatchObject({ code: "COLLABORATION_FORBIDDEN" });
  });

  it("validates the complete dependency graph before saving or publishing", async () => {
    const gateway = repository();
    const service = new LifecycleTemplateService(gateway);
    await expect(service.saveDraft(pmo, {
      templateVersionId: "draft-v2",
      templateName: "虚构方案",
      expectedFingerprint: "fingerprint-1",
      stages: [{ id: "stage", code: "S1", name: "阶段", sortOrder: 1, applicability: "REQUIRED" }],
      workflows: [{ id: "workflow", code: "FLOW", name: "流程", description: "虚拟流程", requiredByDefault: true, enabled: true }],
      nodes: [
        { id: "optional", workflowId: "workflow", stageId: "stage", task: "可选", ownerRole: "KEY_SUB_I", sortOrder: 1, applicability: "OPTIONAL", attachmentRequirement: "NONE", predecessorIds: [] },
        { id: "required", workflowId: "workflow", stageId: "stage", task: "必需", ownerRole: "KEY_SUB_I", sortOrder: 2, applicability: "REQUIRED", attachmentRequirement: "REQUIRED", predecessorIds: ["optional"] },
      ],
    })).rejects.toEqual(new CollaborationError("WORKFLOW_DEPENDENCY_REQUIRED_HAS_OPTIONAL_ANCESTOR"));
    expect(gateway.saveDraft).not.toHaveBeenCalled();

    await expect(service.publishDraft(pmo, {
      templateVersionId: "draft-v2",
      templateName: "虚构方案",
      expectedFingerprint: "fingerprint-1",
      stages: [{ id: "stage", code: "S1", name: "阶段", sortOrder: 1, applicability: "REQUIRED" }],
      workflows: [{ id: "workflow", code: "FLOW", name: "流程", description: "虚拟流程", requiredByDefault: true, enabled: true }],
      nodes: [
        { id: "root", workflowId: "workflow", stageId: "stage", task: "根节点", ownerRole: "KEY_SUB_I", sortOrder: 1, applicability: "REQUIRED", attachmentRequirement: "NONE", predecessorIds: [] },
        { id: "leaf", workflowId: "workflow", stageId: "stage", task: "叶节点", ownerRole: "KEY_SUB_I", sortOrder: 2, applicability: "OPTIONAL", attachmentRequirement: "OPTIONAL", predecessorIds: ["root"] },
      ],
    })).resolves.toBeUndefined();
    expect(gateway.publishDraft).toHaveBeenCalledOnce();
  });
});
