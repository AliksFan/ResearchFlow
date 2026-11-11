import type { RoleCode } from "@researchflow/auth";

export interface WorkspaceNavigationItem {
  label: string;
  href: string;
}

export interface WorkspaceNavigationArea extends WorkspaceNavigationItem {
  items: WorkspaceNavigationItem[];
}

export type WorkspaceRole = Extract<RoleCode, "PMO" | "DEAN" | "KEY_SUB_I">;

const NAVIGATION: Record<WorkspaceRole, WorkspaceNavigationArea[]> = {
  PMO: [
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
  ],
  DEAN: [
    {
      label: "项目总览",
      href: "/workspace/projects",
      items: [{ label: "项目总览", href: "/workspace/projects" }],
    },
  ],
  KEY_SUB_I: [
    {
      label: "我的项目",
      href: "/workspace/projects",
      items: [{ label: "我的项目", href: "/workspace/projects" }],
    },
  ],
};

export function isWorkspaceRole(role: RoleCode): role is WorkspaceRole {
  return role === "PMO" || role === "DEAN" || role === "KEY_SUB_I";
}

export function defaultWorkspaceHref(role: WorkspaceRole): string {
  return NAVIGATION[role][0]!.href;
}

export function workspaceNavigation(role: WorkspaceRole): WorkspaceNavigationArea[] {
  return NAVIGATION[role];
}

export function isNavigationHrefActive(pathname: string, href: string): boolean {
  if (href === "/workspace/projects") {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  if (href === "/workspace/applications") {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
