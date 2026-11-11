import type { ProjectExecutionListItem, ProjectExecutionOverview } from "@researchflow/collaboration";
import type { ProjectApplicationListItem } from "@researchflow/project-application";
import { describe, expect, it } from "vitest";

import {
  applicationStatusLabel,
  deriveProjectWorkspaceSummary,
  filterApplications,
  filterProjects,
  filterWorkspaceApplications,
  filterWorkspaceProjects,
  projectCounts,
} from "../src/components/workspace/workspace-list-view";

const projects: ProjectExecutionListItem[] = [
  { projectId: "1", projectCode: "DEMO-001", projectName: "虚构卒中项目", projectStatus: "ACTIVE" },
  { projectId: "2", projectCode: "DEMO-002", projectName: "虚构认知项目", projectStatus: "CLOSING" },
  { projectId: "3", projectCode: "DEMO-003", projectName: "虚构康复项目", projectStatus: "COMPLETED" },
  { projectId: "4", projectCode: "DEMO-004", projectName: "虚构协作项目", projectStatus: "ARCHIVED" },
];

const application = (overrides: Partial<ProjectApplicationListItem>): ProjectApplicationListItem => ({
  projectId: "a1",
  applicationCode: "APP-0001",
  projectCode: null,
  projectName: "虚构申请项目",
  status: "DRAFT",
  rowVersion: 1,
  applicationVersionId: "v1",
  applicationVersionNo: 1,
  reviewId: null,
  reviewSubmissionNo: null,
  applicantPersonId: "p1",
  applicantDisplayName: "虚构申请人",
  primaryOwnerDisplayName: "虚构负责人",
  submittedAt: null,
  updatedAt: "2026-08-27T00:00:00.000Z",
  ...overrides,
});

describe("workspace list view", () => {
  it("derives project state cards only from accessible projects", () => {
    expect(projectCounts(projects)).toEqual({ current: 2, completed: 1, archived: 1, total: 4 });
  });

  it("filters project state views and normalized search together", () => {
    expect(filterProjects(projects, "current", " demo-002 ").map(({ projectId }) => projectId)).toEqual(["2"]);
    expect(filterProjects(projects, "archived", "协作").map(({ projectId }) => projectId)).toEqual(["4"]);
  });

  it("filters applications without mixing state grouping with search", () => {
    const items = [
      application({ projectId: "a1", status: "DRAFT" }),
      application({ projectId: "a2", applicationCode: "APP-0002", projectName: "虚构待审项目", status: "PENDING_ESTABLISHMENT_REVIEW", submittedAt: "2026-08-27T01:00:00.000Z" }),
      application({ projectId: "a3", applicationCode: "APP-0003", status: "ACTIVE", projectCode: "DEMO-010" }),
    ];
    expect(filterApplications(items, "in_review", "待审").map(({ projectId }) => projectId)).toEqual(["a2"]);
    expect(filterApplications(items, "finished", "DEMO-010").map(({ projectId }) => projectId)).toEqual(["a3"]);
  });

  it("uses user-facing status labels instead of internal enum values", () => {
    expect(applicationStatusLabel("PENDING_ESTABLISHMENT_REVIEW")).toBe("待 PMO 审核");
    expect(applicationStatusLabel("RETURNED_FOR_REVISION")).toBe("已退回修改");
  });

  it("derives the current stage, issue risk and formally completed applicable nodes", () => {
    const overview = projectOverview();
    expect(deriveProjectWorkspaceSummary(overview)).toMatchObject({
      currentStageLabel: "实施阶段",
      openIssueCount: 3,
      issueRiskLevel: "BLOCKED",
      completedNodeCount: 1,
      applicableNodeCount: 3,
    });
  });

  it("handles closing, all-complete and no-applicable-node summaries without guessing", () => {
    const complete = projectOverview();
    complete.stages[1]!.workflows[0]!.executionStatus = "COMPLETED";
    complete.stages[1]!.workflows[1]!.executionStatus = "COMPLETED";
    expect(deriveProjectWorkspaceSummary({ ...complete, projectStatus: "CLOSING" }).currentStageLabel).toBe("结题处理中");

    const empty = projectOverview();
    empty.stages.forEach((stage) => {
      stage.applicability = "NOT_APPLICABLE";
    });
    expect(deriveProjectWorkspaceSummary(empty)).toMatchObject({
      currentStageLabel: "暂无适用执行节点",
      applicableNodeCount: 0,
    });
  });

  it("searches visible project summaries and keeps only the four unestablished application states", () => {
    const overview = projectOverview();
    expect(filterWorkspaceProjects([overview], "APP-009")).toHaveLength(1);
    expect(filterWorkspaceProjects([overview], "共同负责人乙")).toHaveLength(1);

    const items = [
      application({ status: "DRAFT" }),
      application({ projectId: "a2", status: "RETURNED_FOR_REVISION" }),
      application({ projectId: "a3", status: "PENDING_ESTABLISHMENT_REVIEW" }),
      application({ projectId: "a4", status: "ON_HOLD" }),
      application({ projectId: "a5", status: "ACTIVE" }),
      application({ projectId: "a6", status: "REJECTED" }),
      application({ projectId: "a7", status: "CANCELLED" }),
    ];
    expect(filterWorkspaceApplications(items, "").map(({ projectId }) => projectId)).toEqual(["a1", "a2", "a3", "a4"]);
  });
});

function projectOverview(): ProjectExecutionOverview {
  return {
    projectId: "project-1",
    projectCode: "DEMO-009",
    projectName: "虚构工作区项目",
    projectStatus: "ACTIVE",
    swimlaneName: "虚构项目泳道",
    canEditSwimlane: true,
    basicInformation: {
      applicationCode: "APP-009",
      projectSummary: null,
      applicantDisplayName: "虚构申请人",
      primaryKeySubIDisplayName: "主负责人甲",
      otherKeySubIDisplayNames: ["共同负责人乙", "共同负责人丙"],
      leadOrganizationName: null,
      sponsorName: null,
      diseaseAreaDisplayName: null,
      researchTypeDisplayName: null,
      plannedEndDate: "2027-03-01",
      fundingRecordAmountCny: null,
      establishedByDisplayName: null,
      establishedAt: null,
      completedAt: null,
      archivedAt: null,
    },
    stages: [
      {
        stageId: "stage-1", stageCode: "S1", stageName: "准备阶段", applicability: "REQUIRED", plannedStartDate: null, plannedEndDate: null,
        workflows: [workflow("node-1", "COMPLETED", 0, "NONE")],
      },
      {
        stageId: "stage-2", stageCode: "S2", stageName: "实施阶段", applicability: "REQUIRED", plannedStartDate: null, plannedEndDate: null,
        workflows: [workflow("node-2", "PENDING_COMPLETION_CONFIRMATION", 1, "RISK"), workflow("node-3", "ACTIVE", 2, "BLOCKED"), { ...workflow("node-4", "NOT_STARTED", 0, "NONE"), applicability: "NOT_APPLICABLE" }],
      },
    ],
  };
}

function workflow(workflowStageId: string, executionStatus: ProjectExecutionOverview["stages"][number]["workflows"][number]["executionStatus"], openIssueCount: number, issueRiskLevel: "NONE" | "RISK" | "BLOCKED") {
  return {
    workflowStageId,
    rowVersion: 0,
    workflowCode: workflowStageId,
    workflowName: "虚构工作流",
    taskName: "虚构任务",
    taskDescription: "虚构任务说明",
    applicability: "REQUIRED" as const,
    attachmentRequirement: "NONE" as const,
    plannedStartDate: null,
    plannedEndDate: null,
    ownerRoles: ["KEY_SUB_I" as const],
    executionStatus,
    openIssueCount,
    issueRiskLevel,
    predecessorWorkflowStageIds: [],
  };
}
