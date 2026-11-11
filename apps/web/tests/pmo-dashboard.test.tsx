import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PmoDashboard, type PmoDashboardPageModel } from "@/components/workspace/pmo-dashboard";
import { parsePmoDashboardQuery } from "@/components/workspace/pmo-project-summary";

describe("PmoDashboard", () => {
  it("renders one heading, six accessible cards and the fixed desktop/mobile field order", () => {
    const html = renderToStaticMarkup(<PmoDashboard model={model()} query={parsePmoDashboardQuery({})} />);

    expect((html.match(/<h1/g) ?? [])).toHaveLength(1);
    expect(html).toContain("lg:grid-cols-6");
    for (const label of ["全部", "项目申请", "待 PMO 处理", "待院长决策", "院长已决策待落实", "待确认与结题"]) expect(html).toContain(label);
    expect(html).toContain("搜索项目名称、编号或负责人");
    expect(html).toContain("虚构项目总览验收");
    expect(html).toContain("DEMO-200");
    expect(html).toContain("虚构主负责人");
    expect(html).toContain("执行阶段");
    expect(html).toContain("1 项阻塞");
    expect(html).toContain("PMO 处理中 · 1 项");
    expect(html).toContain("虚构待审核申请");
    expect(html).toContain("APP-201");
    expect(html).toContain("审核申请");
    expect(html).toContain("focus=applications");
    expect(html).not.toContain("项目申请审核");
  });
});

function model(): PmoDashboardPageModel {
  return {
    snapshotAt: "2026-09-01T01:00:00.000Z",
    generatedAt: "2026-09-01T01:00:01.000Z",
    counts: { allItems: 2, applicationItems: 1, pendingPmoProjects: 1, pendingDeanProjects: 0, implementationProjects: 0, confirmationClosureProjects: 0 },
    filteredTotal: 2,
    page: 1,
    pageSize: 50,
    items: [{
      itemType: "FORMAL_PROJECT",
      projectId: "00000000-0000-4000-8000-000000000200",
      projectCode: "DEMO-200",
      applicationCode: "APP-200",
      projectName: "虚构项目总览验收",
      projectStatus: "ACTIVE",
      leadOrganizationName: "虚构研究中心",
      primaryKeySubIDisplayName: "虚构主负责人",
      otherKeySubIDisplayNames: ["虚构协作负责人"],
      stageSummary: { currentStageId: "stage-1", currentStageName: "执行阶段", currentStageSortOrder: 1, completedStageCount: 0, applicableStageCount: 1 },
      exceptionSummary: { openIssueCount: 1, highestIssueRisk: "BLOCKED", closureBlocked: false, closureGateReasonCount: 0 },
      actionSummaries: [{ category: "PMO", taskCount: 1, oldestStartedAt: "2026-08-30T01:00:00.000Z", overdue: true, target: { kind: "ISSUE", workflowStageId: "node-1", issueId: "issue-1" } }],
    }, {
      itemType: "PROJECT_APPLICATION",
      projectId: "00000000-0000-4000-8000-000000000201",
      applicationCode: "APP-201",
      projectName: "虚构待审核申请",
      applicationStatus: "PENDING_ESTABLISHMENT_REVIEW",
      applicantDisplayName: "虚构申请人",
      primaryOwnerDisplayName: "虚构拟任负责人",
      submittedAt: "2026-08-31T01:00:00.000Z",
      updatedAt: "2026-08-31T01:00:00.000Z",
    }],
  };
}
