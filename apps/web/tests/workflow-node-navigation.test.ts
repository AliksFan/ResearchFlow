import { describe, expect, it } from "vitest";

import { normalizeWorkflowNodeTab, normalizeWorkflowReportType } from "@/components/collaboration/workflow-node-navigation";

describe("workflow node navigation", () => {
  it("uses role-specific defaults and normalizes legacy tabs", () => {
    expect(normalizeWorkflowNodeTab("KEY_SUB_I")).toBe("report");
    expect(normalizeWorkflowNodeTab("PMO")).toBe("progress");
    expect(normalizeWorkflowNodeTab("DEAN", "overview")).toBe("progress");
    expect(normalizeWorkflowNodeTab("KEY_SUB_I", "completion")).toBe("progress");
    expect(normalizeWorkflowNodeTab("PMO", "report")).toBe("progress");
    expect(normalizeWorkflowNodeTab("KEY_SUB_I", "issues")).toBe("issues");
  });

  it("accepts only the three reporting choices", () => {
    expect(normalizeWorkflowReportType("issue")).toBe("issue");
    expect(normalizeWorkflowReportType("completion")).toBe("completion");
    expect(normalizeWorkflowReportType("invalid")).toBe("progress");
  });
});
