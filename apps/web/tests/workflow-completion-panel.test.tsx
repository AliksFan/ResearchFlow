import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkflowCompletionPanel } from "@/components/collaboration/workflow-completion-panel";

describe("WorkflowCompletionPanel", () => {
  it("shows the current node completion form expanded", () => {
    const html = renderToStaticMarkup(<WorkflowCompletionPanel
      actorRole="KEY_SUB_I"
      projectId="20000000-0000-4000-8000-000000000001"
      nodes={[{
        workflowStageId: "40000000-0000-4000-8000-000000000001",
        label: "准备工作流 · 完成准备",
        executionStatus: "ACTIVE",
        rowVersion: 1,
        attachmentRequirement: "OPTIONAL",
      }]}
      requests={[]}
      showRequests={false}
    />);

    expect(html).toMatch(/<details[^>]*open="[^>]*>[\s\S]*申请完成：准备工作流 · 完成准备/u);
  });
});
