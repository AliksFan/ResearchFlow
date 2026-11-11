import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/workspace/project-closure-actions", () => ({
  approveProjectClosure: vi.fn(), archiveProject: vi.fn(), resubmitProjectClosure: vi.fn(),
  restoreArchivedProject: vi.fn(), returnProjectClosure: vi.fn(), submitProjectClosure: vi.fn(),
  withdrawProjectClosure: vi.fn(),
}));

import { ProjectClosurePanel } from "../src/components/collaboration/project-closure-panel";

describe("ProjectClosurePanel", () => {
  it("shows explicit initial blockers without creating or enabling a submission", () => {
    const html = renderToStaticMarkup(<ProjectClosurePanel embedded actorRole="KEY_SUB_I" state={{
      projectId: "10000000-0000-4000-8000-000000000001",
      projectStatus: "ACTIVE",
      projectRowVersion: 4,
      isPrimaryKeySubI: true,
      requests: [],
    }} readiness={{
      projectId: "10000000-0000-4000-8000-000000000001",
      projectRowVersion: 4,
      incompleteRequiredWorkflowStageIds: ["node-1"],
      openIssueIds: ["issue-1"],
      readyForMaterials: false,
    }} gateLabels={{ "node-1": "启动阶段 · 项目治理", "issue-1": "V-ISSUE-001 · 虚构问题" }} />);

    expect(html).toContain("还缺少 2 项");
    expect(html).toContain("必需节点未完成：启动阶段 · 项目治理");
    expect(html).toContain("存在未关闭问题：V-ISSUE-001 · 虚构问题");
    expect(html).toContain("下一步：填写结题材料");
    expect(html).toContain("disabled");
    expect(html).not.toContain("提交结题申请");
  });
});
