import { describe, expect, it } from "vitest";

import { notificationHref } from "@/app/workspace/notifications/navigation";

describe("notification navigation", () => {
  it("routes applicant and PMO application messages to their role-specific detail", () => {
    expect(notificationHref({ kind: "PROJECT_APPLICATION", projectId: "project-1", perspective: "APPLICANT" })).toBe("/workspace/applications/project-1");
    expect(notificationHref({ kind: "PROJECT_APPLICATION", projectId: "project-1", perspective: "PMO_REVIEW" })).toBe("/workspace/pmo/project-applications/project-1");
  });

  it("routes issue messages to the issue tab and anchors the exact issue", () => {
    const reference = { kind: "PROJECT_EXECUTION" as const, projectId: "project-1", projectWorkflowStageId: "node-1", tab: "issues" as const, issueId: "issue-1" };
    expect(notificationHref(reference)).toBe("/workspace/projects/project-1/execution?node=node-1&tab=issues&issue=issue-1#issue-issue-1");
  });

  it("routes completion messages into progress records and anchors the request", () => {
    expect(notificationHref({ kind: "PROJECT_EXECUTION", projectId: "project-1", projectWorkflowStageId: "node-1", tab: "progress", completionRequestId: "completion-1" }))
      .toBe("/workspace/projects/project-1/execution?node=node-1&tab=progress&completion=completion-1#completion-completion-1");
  });
});
