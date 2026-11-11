import { describe, expect, it } from "vitest";

import { actionHref, applicationDetailHref, dashboardHref, formatActionLabel, parsePmoDashboardQuery, sortHref } from "@/components/workspace/pmo-project-summary";

describe("PMO dashboard URL and summary rules", () => {
  it("falls back from invalid URL values to the fixed defaults", () => {
    expect(parsePmoDashboardQuery({ focus: "unknown", sort: "sql", order: "sideways", page: "0", q: "  Ａ项目  " })).toEqual({
      focus: "all",
      applicationView: "active",
      q: "A项目",
      hideFinished: false,
      sort: "action",
      order: "desc",
      page: 1,
      pageSize: 50,
    });
  });

  it("falls back the sort and order pair together when either value is invalid", () => {
    expect(parsePmoDashboardQuery({ sort: "project", order: "sideways" })).toMatchObject({ sort: "action", order: "desc" });
    expect(parsePmoDashboardQuery({ sort: "project", order: "asc" })).toMatchObject({ sort: "project", order: "asc" });
  });

  it("preserves filters while resetting page for a new sort", () => {
    const query = parsePmoDashboardQuery({ focus: "pmo", q: "项目", hideFinished: "1", page: "3" });
    expect(sortHref(query, "project")).toBe("/workspace/projects?focus=pmo&sort=project&order=asc&q=%E9%A1%B9%E7%9B%AE&hideFinished=1");
    expect(dashboardHref(query, { focus: "dean", page: 1 })).toContain("focus=dean");
  });

  it("builds structured deep links and never parses labels", () => {
    expect(actionHref("project-id", {
      category: "PMO",
      taskCount: 1,
      oldestStartedAt: "2026-08-31T00:00:00.000Z",
      overdue: false,
      target: { kind: "ISSUE", workflowStageId: "node-id", issueId: "issue-id" },
    }, "/workspace/projects?focus=pmo")).toContain("node=node-id&tab=issues&issue=issue-id");
    expect(actionHref("project-id", {
      category: "PMO",
      taskCount: 1,
      oldestStartedAt: "2026-08-31T00:00:00.000Z",
      overdue: false,
      target: { kind: "WORKFLOW_COMPLETION", workflowStageId: "node-id" },
    }, "/workspace/projects?focus=pmo")).toContain("node=node-id&tab=progress");
    expect(applicationDetailHref("application-id", "/workspace/projects?focus=applications&applicationView=in_review")).toContain("returnTo=%2Fworkspace%2Fprojects%3Ffocus%3Dapplications");
  });

  it("formats missing responsibility time without substituting project update time", () => {
    expect(formatActionLabel({ category: "PMO", taskCount: 2, oldestStartedAt: null, overdue: false, target: { kind: "CLOSURE" } }, "2026-09-01T00:00:00.000Z")).toContain("时间未记录");
  });
});
