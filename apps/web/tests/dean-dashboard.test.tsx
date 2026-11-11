import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DeanDashboard, type DeanDashboardPageModel } from "@/components/workspace/dean-dashboard";
import { parseDeanDashboardQuery } from "@/components/workspace/dean-project-summary";

describe("DeanDashboard", () => {
  it("renders the five approved cards and dean-specific action labels", () => {
    const html = renderToStaticMarkup(<DeanDashboard model={model()} query={parseDeanDashboardQuery({})} />);

    expect((html.match(/<h1/g) ?? [])).toHaveLength(1);
    expect(html).toContain("lg:grid-cols-5");
    for (const label of ["全部项目", "待我决策", "PMO 落实中", "待我确认落实", "待负责人反馈"]) expect(html).toContain(label);
    expect(html).toContain("搜索项目名称、编号或负责人");
    expect(html).toContain("虚构院长项目总览");
    expect(html).toContain("待我决策 · 1 项");
    expect(html).not.toContain("项目申请");
    expect(html).not.toContain("待 PMO 处理");
  });
});

function model(): DeanDashboardPageModel {
  return {
    snapshotAt: "2026-09-01T01:00:00.000Z",
    generatedAt: "2026-09-01T01:00:01.000Z",
    counts: { allProjects: 1, decisionProjects: 1, implementationProjects: 0, confirmationProjects: 0, reporterFeedbackProjects: 0 },
    filteredTotal: 1,
    page: 1,
    pageSize: 50,
    items: [{
      projectId: "00000000-0000-4000-8000-000000000200",
      projectCode: "DEMO-200",
      applicationCode: "APP-200",
      projectName: "虚构院长项目总览",
      projectStatus: "ACTIVE",
      leadOrganizationName: "虚构研究中心",
      primaryKeySubIDisplayName: "虚构主负责人",
      otherKeySubIDisplayNames: [],
      stageSummary: { currentStageId: "stage-1", currentStageName: "执行阶段", currentStageSortOrder: 1, completedStageCount: 0, applicableStageCount: 1 },
      exceptionSummary: { openIssueCount: 1, highestIssueRisk: "BLOCKED", closureBlocked: false, closureGateReasonCount: 0 },
      actionSummaries: [{ category: "DEAN_DECISION", taskCount: 1, oldestStartedAt: "2026-08-30T01:00:00.000Z", overdue: true, actionableByCurrentDean: true, target: { kind: "ISSUE", workflowStageId: "node-1", issueId: "issue-1" } }],
    }],
  };
}
