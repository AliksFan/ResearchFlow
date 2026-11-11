import { describe, expect, it } from "vitest";

import { validateApplicationSwimlane, type ApplicationSwimlaneInput } from "../src/index.js";

const valid: ApplicationSwimlaneInput = {
  name: "虚构申请泳道",
  expectedRevision: 0,
  sourceTemplateVersionId: "template-version",
  stages: [{ id: "stage-1", code: "START", name: "启动", sortOrder: 0, applicability: "REQUIRED", plannedStartDate: "2026-09-01", plannedEndDate: "2026-09-30" }],
  workflows: [{ id: "workflow-1", code: "PREPARE", name: "准备", description: "虚构说明", sortOrder: 0, enabled: true }],
  nodes: [{ id: "node-1", stageId: "stage-1", workflowId: "workflow-1", taskName: "完成准备", taskDescription: "仅用于测试", sortOrder: 0, applicability: "REQUIRED", plannedStartDate: "2026-09-01", plannedEndDate: "2026-09-15", updateIntervalDays: null, overdueReminderIntervalDays: 7, attachmentRequirement: "NONE", ownerRoles: ["KEY_SUB_I"], predecessorIds: [] }],
};

describe("application swimlane policy", () => {
  it("accepts a complete project-level graph", () => {
    expect(validateApplicationSwimlane(valid)).toBe(true);
  });

  it("rejects cross references, invalid dates, and dependency cycles", () => {
    expect(validateApplicationSwimlane({ ...valid, nodes: [{ ...valid.nodes[0]!, stageId: "other-stage" }] })).toBe(false);
    expect(validateApplicationSwimlane({ ...valid, stages: [{ ...valid.stages[0]!, plannedStartDate: "2026-10-01", plannedEndDate: "2026-09-30" }] })).toBe(false);
    const second = { ...valid.nodes[0]!, id: "node-2", taskName: "第二节点", predecessorIds: ["node-1"] };
    expect(validateApplicationSwimlane({ ...valid, nodes: [{ ...valid.nodes[0]!, predecessorIds: ["node-2"] }, second] })).toBe(false);
  });

  it("requires a usable node for every applicable stage", () => {
    expect(validateApplicationSwimlane({ ...valid, nodes: [{ ...valid.nodes[0]!, applicability: "NOT_APPLICABLE" }] })).toBe(false);
  });

  it("rejects unknown fields, runtime enum injection, and malformed shapes", () => {
    expect(validateApplicationSwimlane({ ...valid, unexpected: "must not pass" })).toBe(false);
    expect(validateApplicationSwimlane({ ...valid, stages: [{ ...valid.stages[0]!, applicability: "UNKNOWN" }] })).toBe(false);
    expect(validateApplicationSwimlane({ ...valid, nodes: [{ ...valid.nodes[0]!, attachmentRequirement: "UNKNOWN" }] })).toBe(false);
    expect(validateApplicationSwimlane({ ...valid, nodes: null })).toBe(false);
  });
});
