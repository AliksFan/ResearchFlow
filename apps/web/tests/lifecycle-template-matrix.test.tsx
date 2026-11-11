import type { LifecycleTemplateVersionRecord } from "@researchflow/collaboration";
import { describe, expect, it } from "vitest";

import {
  removeTemplateNode,
  removeTemplateStage,
  removeTemplateWorkflow,
} from "@/components/collaboration/lifecycle-template-matrix";
import { selectInitialVersionId } from "@/components/collaboration/lifecycle-template-workspace";

describe("lifecycle template draft removal", () => {
  it("removes a node and every dependency that points to it", () => {
    const result = removeTemplateNode(version(), "node-1");
    expect(result.nodes.map(({ id }) => id)).toEqual(["node-2"]);
    expect(result.nodes[0]?.predecessorIds).toEqual([]);
  });

  it("cascades stage nodes and their dependencies", () => {
    const result = removeTemplateStage(version(), "stage-1");
    expect(result.stages.map(({ id }) => id)).toEqual(["stage-2"]);
    expect(result.nodes.map(({ id }) => id)).toEqual(["node-2"]);
    expect(result.nodes[0]?.predecessorIds).toEqual([]);
  });

  it("cascades workflow nodes and their dependencies", () => {
    const result = removeTemplateWorkflow(version(), "workflow-2");
    expect(result.workflows.map(({ id }) => id)).toEqual(["workflow-1"]);
    expect(result.nodes.map(({ id }) => id)).toEqual(["node-1"]);
  });

  it("keeps the just-published version selected instead of another draft", () => {
    const published = { ...version(), id: "published-1", status: "PUBLISHED" as const, displayStatus: "PUBLISHED" as const };
    const draft = { ...version(), id: "draft-1" };
    expect(selectInitialVersionId([draft, published], published.id)).toBe(published.id);
    expect(selectInitialVersionId([draft, published], "missing")).toBe(draft.id);
  });
});

function version(): LifecycleTemplateVersionRecord {
  return {
    id: "version-1",
    lifecycleTemplateId: "template-1",
    templateCode: "VIRTUAL",
    templateName: "虚构方案",
    versionNo: 1,
    status: "DRAFT",
    displayStatus: "UNPUBLISHED",
    nameEditable: true,
    fingerprint: "fingerprint-1",
    stages: [
      { id: "stage-1", code: "S1", name: "阶段一", sortOrder: 1, applicability: "REQUIRED" },
      { id: "stage-2", code: "S2", name: "阶段二", sortOrder: 2, applicability: "REQUIRED" },
    ],
    workflows: [
      { id: "workflow-1", code: "W1", name: "工作流一", description: "", requiredByDefault: true, enabled: true },
      { id: "workflow-2", code: "W2", name: "工作流二", description: "", requiredByDefault: true, enabled: true },
    ],
    nodes: [
      { id: "node-1", workflowId: "workflow-1", stageId: "stage-1", task: "节点一", ownerRole: "KEY_SUB_I", sortOrder: 1, applicability: "REQUIRED", attachmentRequirement: "NONE", predecessorIds: [] },
      { id: "node-2", workflowId: "workflow-2", stageId: "stage-2", task: "节点二", ownerRole: "KEY_SUB_I", sortOrder: 2, applicability: "REQUIRED", attachmentRequirement: "NONE", predecessorIds: ["node-1"] },
    ],
  };
}
