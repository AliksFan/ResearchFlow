import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/auth-actions", () => ({
  changeManagedAccountStatusAction: vi.fn(),
  createAccountAction: vi.fn(),
  endRoleAction: vi.fn(),
  endKeySubIEligibilityAction: vi.fn(),
  grantKeySubIEligibilityAction: vi.fn(),
  grantRoleAction: vi.fn(),
  issueCredentialAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { PmoManagementPanel } from "../src/components/auth/pmo-management-panel";

describe("PmoManagementPanel", () => {
  it("uses a searchable account list and management entry instead of stacked operation forms", () => {
    const html = renderToStaticMarkup(<PmoManagementPanel snapshot={{
      people: [{
        id: "00000000-0000-4000-8000-000000000002",
        loginName: "virtual-key-sub-i",
        displayName: "虚拟主负责人",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        passwordSet: true,
      }],
      assignments: [{
        id: "80000000-0000-4000-8000-000000000002",
        personId: "00000000-0000-4000-8000-000000000002",
        roleCode: "KEY_SUB_I",
        projectId: "20000000-0000-4000-8000-000000000001",
        assignmentStatus: "ACTIVE",
        isPrimary: true,
      }],
      projects: [],
      eligibilities: [],
    }} />);

    expect(html).toContain("虚拟主负责人");
    expect(html).toContain("账号状态");
    expect(html).toContain("有效角色");
    expect(html).toContain("管理");
    expect(html).not.toContain("创建受邀账号");
    expect(html).not.toContain("结束授权");
  });
});
