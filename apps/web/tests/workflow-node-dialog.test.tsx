import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkflowNodeDialog } from "@/components/collaboration/workflow-node-dialog";

const node = {
  workflowStageId: "40000000-0000-4000-8000-000000000001",
  rowVersion: 1,
  workflowCode: "GOVERNANCE",
  workflowName: "项目治理",
  taskName: "完成虚构启动材料",
  taskDescription: "仅使用虚构项目级资料",
  applicability: "REQUIRED" as const,
  attachmentRequirement: "OPTIONAL" as const,
  plannedStartDate: null,
  plannedEndDate: null,
  ownerRoles: ["KEY_SUB_I" as const],
  executionStatus: "ACTIVE" as const,
  openIssueCount: 0,
  issueRiskLevel: "NONE" as const,
  predecessorWorkflowStageIds: ["predecessor"],
};

describe("WorkflowNodeDialog", () => {
  it("shows the compact node metadata and Key Sub-I tabs", () => {
    const html = renderToStaticMarkup(<WorkflowNodeDialog actorRole="KEY_SUB_I" node={node} predecessorLabels={["前置准备"]} tab="report" content={<p>填报内容</p>} />);
    expect(html).toContain("完成虚构启动材料");
    expect(html).toContain("适用性");
    expect(html).toContain("附件要求");
    expect(html).toContain("前置准备");
    expect(html).toContain("Key Sub-I");
    expect(html).toContain("填报");
    expect(html).toContain("进展记录");
    expect(html).toContain("问题记录");
    expect(html).not.toContain("节点概览");
    expect(html).not.toContain("项目治理 ·");
  });

  it.each(["PMO", "DEAN"] as const)("keeps %s on the two read and action tabs", (actorRole) => {
    const html = renderToStaticMarkup(<WorkflowNodeDialog actorRole={actorRole} node={node} predecessorLabels={[]} tab="progress" content={<p>记录</p>} />);
    expect(html).not.toContain(">填报<");
    expect(html).toContain("进展记录");
    expect(html).toContain("问题记录");
  });
});
