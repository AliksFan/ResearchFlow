import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkflowProgressPanel } from "../src/components/collaboration/workflow-progress-panel";

const nodes = [{
  workflowStageId: "40000000-0000-4000-8000-000000000001",
  label: "启动阶段 · 资料准备",
  attachmentRequirement: "OPTIONAL" as const,
}];

const progress = [{
  id: "50000000-0000-4000-8000-000000000001",
  projectId: "20000000-0000-4000-8000-000000000001",
  projectWorkflowStageId: nodes[0]!.workflowStageId,
  submittedByPersonId: "00000000-0000-4000-8000-000000000002",
  progressSummary: "已完成虚拟资料准备",
  basis: "按项目计划核对",
  expectedCompletionDate: "2026-09-01",
  effectiveBudgetAmountCny: "1200.00",
  latestCorrectionSequenceNo: 0,
  submittedAt: "2026-08-24T08:00:00.000Z",
  attachments: [{
    assetId: "60000000-0000-4000-8000-000000000001",
    fileName: "虚拟项目说明.pdf",
    mediaType: "application/pdf",
    sizeBytes: 1024,
  }],
}];

describe("WorkflowProgressPanel", () => {
  it("offers progress, optional amount, controlled attachments and correction only to Key Sub-I", () => {
    const html = renderToStaticMarkup(<WorkflowProgressPanel
      actor={{ personId: progress[0]!.submittedByPersonId, roleCode: "KEY_SUB_I" }}
      projectId={progress[0]!.projectId}
      nodes={nodes}
      progress={progress}
      recordedBudgetTotal="1200.00"
    />);

    expect(html).toContain("提交项目进展");
    expect(html).toContain("本次经费使用金额（元）（选填）");
    expect(html).toContain("项目进展记录口径，非财务数据");
    expect(html).toContain("不包含患者/受试者数据、发票、支付流水或个人账户资料");
    expect(html).toContain("PDF、DOCX、XLSX、JPG、JPEG、PNG");
    expect(html).toContain("单个 20 MB，最多 10 个，合计 100 MB");
    expect(html).toContain("纠错");
    expect(html).toContain("虚拟项目说明.pdf");
  });

  it.each(["PMO", "DEAN"] as const)("keeps %s read-only", (roleCode) => {
    const html = renderToStaticMarkup(<WorkflowProgressPanel
      actor={{ personId: "00000000-0000-4000-8000-000000000003", roleCode }}
      projectId={progress[0]!.projectId}
      nodes={nodes}
      progress={progress}
      recordedBudgetTotal="1200.00"
    />);

    expect(html).toContain("项目进展记录口径，非财务数据");
    expect(html).toContain("虚拟项目说明.pdf");
    expect(html).not.toContain("提交项目进展");
    expect(html).not.toContain("提交纠错");
    expect(html).not.toContain("type=\"file\"");
  });
});
