import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkflowRecordsPanel } from "@/components/collaboration/workflow-records-panel";

const projectId = "20000000-0000-4000-8000-000000000001";
const nodeId = "40000000-0000-4000-8000-000000000001";
const progress = [{ id: "progress-1", projectId, projectWorkflowStageId: nodeId, submittedByPersonId: "person-1", progressSummary: "较早正常填报", basis: "虚构依据", expectedCompletionDate: null, effectiveBudgetAmountCny: null, latestCorrectionSequenceNo: 0, submittedAt: "2026-09-01T00:00:00.000Z", attachments: [] }];
const completion = [
  { id: "completion-pending", projectId, projectWorkflowStageId: nodeId, status: "PENDING_PMO_REVIEW" as const, rowVersion: 0, attachmentRequirement: "NONE" as const, submissionNo: 1, progressSummary: "待审完成申请", basis: "虚构依据", expectedCompletionDate: null, submittedByPersonId: "person-1", submittedAt: "2026-09-02T00:00:00.000Z", lastActivityAt: "2026-09-02T00:00:00.000Z", supplements: [], attachments: [], reviewRound: { id: "round-1", roundNo: 1, status: "ACTIVE" as const, startedAt: "2026-09-02T00:00:00.000Z", dueAt: "2026-09-05T00:00:00.000Z", remainingMilliseconds: 1 } },
  { id: "completion-history", projectId, projectWorkflowStageId: nodeId, status: "APPROVED" as const, rowVersion: 1, attachmentRequirement: "NONE" as const, submissionNo: 1, progressSummary: "较新完成记录", basis: "虚构依据", expectedCompletionDate: null, submittedByPersonId: "person-1", submittedAt: "2026-09-01T00:00:00.000Z", lastActivityAt: "2026-09-03T00:00:00.000Z", supplements: [], attachments: [], reviewRound: null },
];

describe("WorkflowRecordsPanel", () => {
  it("separates pending completion and orders terminal completion with progress history", () => {
    const html = renderToStaticMarkup(<WorkflowRecordsPanel actor={{ personId: "pmo-1", roleCode: "PMO" }} projectId={projectId} nodeLabel="虚构节点" progress={progress} completionRequests={completion} writable />);
    expect(html).toContain("待处理完成申请");
    expect(html).toContain("正式批准");
    expect(html.indexOf("较新完成记录")).toBeLessThan(html.indexOf("较早正常填报"));
  });

  it("sends Key Sub-I pending work back to the completion reporting choice", () => {
    const html = renderToStaticMarkup(<WorkflowRecordsPanel actor={{ personId: "person-1", roleCode: "KEY_SUB_I" }} projectId={projectId} nodeLabel="虚构节点" progress={[]} completionRequests={[completion[0]!]} writable />);
    expect(html).toContain("去填报");
    expect(html).toContain("reportType=completion");
    expect(html).not.toContain("正式批准");
  });
});
