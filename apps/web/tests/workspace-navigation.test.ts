import { describe, expect, it } from "vitest";

import {
  defaultWorkspaceHref,
  workspaceNavigation,
} from "../src/components/workspace/workspace-navigation";

describe("workspaceNavigation", () => {
  it.each([
    ["PMO", "/workspace/projects"],
    ["DEAN", "/workspace/projects"],
    ["KEY_SUB_I", "/workspace/projects"],
  ] as const)("sends %s to the approved default page", (role, href) => {
    expect(defaultWorkspaceHref(role)).toBe(href);
  });

  it("keeps PMO project work separate from management configuration", () => {
    expect(workspaceNavigation("PMO")).toEqual([
      {
        label: "项目管理",
        href: "/workspace/projects",
        items: [{ label: "项目总览", href: "/workspace/projects" }],
      },
      {
        label: "管理配置",
        href: "/workspace/pmo/lifecycle-templates",
        items: [
          { label: "工作流方案", href: "/workspace/pmo/lifecycle-templates" },
          { label: "协作时限", href: "/workspace/pmo/collaboration-time-limits" },
          { label: "字典管理", href: "/workspace/pmo/dictionaries" },
          { label: "账号与角色", href: "/admin/access" },
        ],
      },
    ]);
  });

  it("does not expose PMO configuration to the dean", () => {
    expect(workspaceNavigation("DEAN")).toEqual([
      {
        label: "项目总览",
        href: "/workspace/projects",
        items: [{ label: "项目总览", href: "/workspace/projects" }],
      },
    ]);
  });

  it("uses one My Projects area for Key Sub-I and keeps applications as drill-down pages", () => {
    expect(workspaceNavigation("KEY_SUB_I")).toEqual([
      {
        label: "我的项目",
        href: "/workspace/projects",
        items: [{ label: "我的项目", href: "/workspace/projects" }],
      },
    ]);
  });
});
