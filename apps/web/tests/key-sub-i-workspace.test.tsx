import type { ProjectExecutionOverview } from "@researchflow/collaboration";
import type { ProjectApplicationListItem } from "@researchflow/project-application";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { KeySubIWorkspace } from "@/components/workspace/key-sub-i-workspace";

describe("KeySubIWorkspace", () => {
  it("renders one page heading, truthful summaries and a collapsed accessible history region", () => {
    const html = renderToStaticMarkup(
      <KeySubIWorkspace
        search=""
        currentProjects={[overview()]}
        applications={[application()]}
        completedCount={1}
        archivedCount={2}
        historyView={null}
        historyProjects={[]}
        historySearchMatchCount={0}
      />,
    );

    expect((html.match(/<h1/g) ?? [])).toHaveLength(1);
    expect(html).toContain("我的项目");
    expect(html).not.toContain("当前用户：");
    expect(html).toContain("搜索项目编号、申请编号、项目名称或负责人");
    expect(html).toContain("＋ 项目申请");
    expect(html).toContain("APP-0009");
    expect(html).toContain("DEMO-009");
    expect(html).toContain("2 个未关闭问题 · 存在阻塞");
    expect(html).toContain("已完成 0 / 1 个适用节点");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain(">project-internal-id<");
  });
});

function overview(): ProjectExecutionOverview {
  return {
    projectId: "project-internal-id", projectCode: "DEMO-009", projectName: "虚构神经项目", projectStatus: "ACTIVE", swimlaneName: "虚构项目泳道", canEditSwimlane: true,
    basicInformation: { applicationCode: "APP-0009", projectSummary: null, applicantDisplayName: "虚构申请人", primaryKeySubIDisplayName: "虚构负责人", otherKeySubIDisplayNames: [], leadOrganizationName: null, sponsorName: null, diseaseAreaDisplayName: null, researchTypeDisplayName: null, plannedEndDate: null, fundingRecordAmountCny: null, establishedByDisplayName: null, establishedAt: null, completedAt: null, archivedAt: null },
    stages: [{ stageId: "stage-1", stageCode: "S1", stageName: "执行阶段", applicability: "REQUIRED", plannedStartDate: null, plannedEndDate: null, workflows: [{ workflowStageId: "node-1", rowVersion: 0, workflowCode: "W1", workflowName: "虚构工作流", taskName: "虚构任务", taskDescription: "虚构说明", applicability: "REQUIRED", attachmentRequirement: "NONE", plannedStartDate: null, plannedEndDate: null, ownerRoles: ["KEY_SUB_I"], executionStatus: "ACTIVE", openIssueCount: 2, issueRiskLevel: "BLOCKED", predecessorWorkflowStageIds: [] }] }],
  };
}

function application(): ProjectApplicationListItem {
  return { projectId: "application-internal-id", applicationCode: "APP-0010", projectCode: null, projectName: "虚构未建档申请", status: "DRAFT", rowVersion: 1, applicationVersionId: "version-1", applicationVersionNo: 1, reviewId: null, reviewSubmissionNo: null, applicantPersonId: "person-1", applicantDisplayName: "虚构申请人", primaryOwnerDisplayName: "虚构负责人", submittedAt: null, updatedAt: "2026-08-31T00:00:00.000Z" };
}
