import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { IssueListItem } from "@researchflow/collaboration";

import { CreateIssueForm, IssuePanel } from "@/components/collaboration/issue-panel";

const projectId = "20000000-0000-4000-8000-000000000001";
const nodeId = "40000000-0000-4000-8000-000000000001";
const issue: IssueListItem = {
  id: "50000000-0000-4000-8000-000000000001",
  projectId,
  projectWorkflowStageId: nodeId,
  issueNo: "ISSUE-001",
  title: "虚构项目问题",
  description: "仅用于界面测试",
  expectedSupport: null,
  currentRiskLevel: "RISK",
  currentState: "RESOLVED",
  rowVersion: 1,
  reportedByPersonId: "person-1",
  reportedRoleCode: "KEY_SUB_I",
  currentDecisionRoundId: null,
  currentDecisionRoundStatus: null,
  pendingReviewTransferId: null,
  attachments: [{ assetId: "asset-issue", fileName: "问题材料.pdf", mediaType: "application/pdf", sizeBytes: 2048, attachedAt: "2026-09-04T00:00:00.000Z" }],
  activities: [{ id: "activity-1", sequenceNo: 1, activityType: "PMO_COORDINATION_UPDATE", performedRoleCode: "PMO", detail: "已协调", visibilityScope: "ISSUE_PARTICIPANTS", createdAt: "2026-09-04T01:00:00.000Z", attachments: [{ assetId: "asset-activity", fileName: "处理记录.docx", mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 4096, attachedAt: "2026-09-04T01:00:00.000Z" }] }],
  sharedSummaries: [],
};

const unresolvedIssue: IssueListItem = {
  ...issue,
  id: "50000000-0000-4000-8000-000000000002",
  issueNo: "ISSUE-002",
  title: "虚构未解决问题",
  currentState: "PMO_INITIAL_REVIEW",
  attachments: [],
  activities: [],
};

const closedInvalidIssue: IssueListItem = {
  ...issue,
  id: "50000000-0000-4000-8000-000000000003",
  issueNo: "ISSUE-003",
  title: "虚构无效关闭问题",
  currentState: "CLOSED_INVALID",
  attachments: [],
  activities: [],
};

const common = {
  projectId,
  nodes: [{ id: nodeId, label: "虚构节点" }],
  issueTypes: [{ id: "type-1", code: "OTHER", name: "其它" }],
  issues: [issue],
  contacts: [{ ref: "person:1", name: "虚构联系人", email: "virtual@example.invalid", source: "SYSTEM_PERSON" as const, category: "Key Sub-I" }],
  writable: true,
  embedded: true,
};

describe("IssuePanel", () => {
  it("removes issue creation and contact management from the PMO issue tab", () => {
    const html = renderToStaticMarkup(<IssuePanel {...common} actor={{ personId: "pmo-1", roleCode: "PMO" }} />);

    expect(html).not.toContain("创建真实项目问题");
    expect(html).not.toContain("PMO问题联系人");
  });

  it("expands issue creation for the Key Sub-I reporting entry", () => {
    const html = renderToStaticMarkup(
      <CreateIssueForm
        projectId={projectId}
        nodes={common.nodes}
        issueTypes={common.issueTypes}
        returnNodeId={nodeId}
      />,
    );

    expect(html).toMatch(/<details[^>]*open=""[^>]*>[\s\S]*创建真实项目问题/u);
  });

  it("does not show an issue creation form to Key Sub-I", () => {
    const html = renderToStaticMarkup(<IssuePanel {...common} actor={{ personId: "person-1", roleCode: "KEY_SUB_I" }} />);

    expect(html).not.toContain("创建真实项目问题");
  });

  it("shows unresolved issues first and keeps terminal issues collapsed", () => {
    const html = renderToStaticMarkup(
      <IssuePanel
        {...common}
        issues={[issue, unresolvedIssue, closedInvalidIssue]}
        actor={{ personId: "pmo-1", roleCode: "PMO" }}
      />,
    );
    const toggleIndex = html.indexOf("显示已解决/关闭问题（2）");

    expect(toggleIndex).toBeGreaterThan(-1);
    expect(html.indexOf("虚构未解决问题")).toBeLessThan(toggleIndex);
    expect(html.indexOf("虚构项目问题")).toBeGreaterThan(toggleIndex);
    expect(html.indexOf("虚构无效关闭问题")).toBeGreaterThan(toggleIndex);
    expect(html.slice(0, toggleIndex)).not.toMatch(/<details[^>]*open=""/u);
  });

  it("expands terminal issues when a message link targets one", () => {
    const html = renderToStaticMarkup(
      <IssuePanel
        {...common}
        focusedIssueId={issue.id}
        actor={{ personId: "pmo-1", roleCode: "PMO" }}
      />,
    );

    expect(html).toMatch(/<details[^>]*open=""[^>]*>[\s\S]*显示已解决\/关闭问题（1）/u);
  });

  it("renders download links for issue and activity attachments", () => {
    const html = renderToStaticMarkup(<IssuePanel {...common} actor={{ personId: "pmo-1", roleCode: "PMO" }} />);

    expect(html).toContain('/workspace/attachments/asset-issue/download');
    expect(html).toContain('/workspace/attachments/asset-activity/download');
    expect(html).toContain("问题材料.pdf");
    expect(html).toContain("处理记录.docx");
  });
});
