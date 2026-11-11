import type { ProjectExecutionOverview } from "@researchflow/collaboration";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LifecycleSwimlane } from "../src/components/collaboration/lifecycle-swimlane";

describe("LifecycleSwimlane", () => {
  it("renders formal stage and node state with a node-dialog link", () => {
    const overview: ProjectExecutionOverview = {
      projectId: "10000000-0000-4000-8000-000000000001",
      projectCode: "V-DEMO-001",
      projectName: "虚构神经研究项目",
      projectStatus: "ACTIVE",
      swimlaneName: "虚构项目独立泳道",
      canEditSwimlane: true,
      basicInformation: {
        applicationCode: "APP-001", projectSummary: null, applicantDisplayName: "虚构申请人", primaryKeySubIDisplayName: "虚构负责人", otherKeySubIDisplayNames: [], leadOrganizationName: null, sponsorName: null, diseaseAreaDisplayName: null, researchTypeDisplayName: null, plannedEndDate: null, fundingRecordAmountCny: null, establishedByDisplayName: null, establishedAt: null, completedAt: null, archivedAt: null,
      },
      stages: [{
        stageId: "30000000-0000-4000-8000-000000000001",
        stageCode: "STARTUP",
        stageName: "启动阶段",
        applicability: "REQUIRED",
        plannedStartDate: "2026-08-01",
        plannedEndDate: "2026-09-30",
        workflows: [{
          workflowStageId: "40000000-0000-4000-8000-000000000001",
          rowVersion: 1,
          workflowCode: "GOVERNANCE",
          workflowName: "项目治理",
          taskName: "完成虚构启动材料",
          taskDescription: "仅用于项目级测试",
          applicability: "REQUIRED",
          attachmentRequirement: "REQUIRED",
          plannedStartDate: "2026-08-01",
          plannedEndDate: "2026-09-15",
          ownerRoles: ["KEY_SUB_I"],
          executionStatus: "ACTIVE",
          openIssueCount: 2,
          issueRiskLevel: "RISK",
          predecessorWorkflowStageIds: [],
        }],
      }],
    };

    const html = renderToStaticMarkup(<LifecycleSwimlane overview={overview} editable={{
      projectId: overview.projectId,
      projectStatus: "ACTIVE",
      name: overview.swimlaneName,
      expectedRevision: "20000000-0000-4000-8000-000000000001",
      canEdit: true,
      stages: overview.stages.map((stage, sortOrder) => ({ id: stage.stageId, code: stage.stageCode, name: stage.stageName, sortOrder, applicability: stage.applicability, plannedStartDate: stage.plannedStartDate, plannedEndDate: stage.plannedEndDate })),
      workflows: [{ id: "60000000-0000-4000-8000-000000000001", code: "GOVERNANCE", name: "项目治理", description: "虚构说明", sortOrder: 0, enabled: true }],
      nodes: [],
    }} />);
    expect(html).toContain("项目生命周期泳道");
    expect(html).toContain("虚构项目独立泳道");
    expect(html).toContain("修改泳道");
    expect(html).not.toContain("计划 v");
    expect(html).toContain("启动阶段");
    expect(html).toContain("项目治理");
    expect(html).toContain("完成虚构启动材料");
    expect(html).toContain("存在风险");
    expect(html).toContain("node=40000000-0000-4000-8000-000000000001");
    expect(html).not.toContain("tab=overview");
  });
});
