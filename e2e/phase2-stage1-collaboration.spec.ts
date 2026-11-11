import { expect, test, type Browser, type Page } from "@playwright/test";

import { E2E_PASSWORD, E2E_PERSON_IDS, E2E_PROJECT_IDS, getE2eClient } from "./fixture";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test("PMO sees the real execution overview and persists a time-limit setting", async ({ browser }) => {
  const page = await pageFor(browser, "e2e-pmo");
  await page.goto("/workspace/pmo/collaboration-time-limits");
  await expect(page.getByRole("heading", { name: "全局协作时限" })).toBeVisible();
  const supplementRow = page.getByRole("row", { name: /结题材料补充/u });
  await expect(supplementRow.getByRole("spinbutton").nth(0)).toHaveValue("5");
  await expect(supplementRow.getByRole("spinbutton").nth(1)).toHaveValue("2");
  const implementationRow = page.getByRole("row", { name: /PMO 落实/u });
  await expect(implementationRow.getByRole("spinbutton").nth(0)).toHaveValue("5");
  await expect(implementationRow.getByRole("spinbutton").nth(1)).toHaveValue("2");
  const deanDecisionRow = page.getByRole("row", { name: /院长决定/u });
  await deanDecisionRow.getByRole("spinbutton").nth(0).fill("4");
  await deanDecisionRow.getByRole("spinbutton").nth(1).fill("1");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText("全局协作时限已保存。")).toBeVisible();
  await page.goto("/workspace/projects");
  await expect(page.getByRole("heading", { name: "项目总览" })).toBeVisible();
  await page.getByRole("link", { name: /虚拟 E2E 项目 1/u }).click();
  await page.waitForURL((url) =>
    url.pathname === `/workspace/projects/${E2E_PROJECT_IDS[0]}/execution`,
  );
  await expect(page.getByText("启动阶段", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /完成准备/u })).toBeVisible();
  await expect(page.getByText("当前角色为只读")).toHaveCount(0);
  await page.getByRole("link", { name: "协作时限" }).click();
  const timeLimitDialog = page.getByRole("dialog", { name: "项目协作时限" });
  const projectLimitRow = timeLimitDialog.getByRole("row", { name: /节点完成 PMO 审核/u });
  await expect(projectLimitRow).toContainText("项目单独设置");
  await timeLimitDialog.getByLabel("节点完成 PMO 审核时限（天）").fill("4");
  await timeLimitDialog.getByLabel("节点完成 PMO 审核提醒周期（天）").fill("1");
  await timeLimitDialog.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText("协作时限配置已保存。")).toBeVisible();
  await page.getByRole("link", { name: "协作时限" }).click();
  const savedProjectLimitRow = timeLimitDialog.getByRole("row", { name: /节点完成 PMO 审核/u });
  await expect(savedProjectLimitRow).toContainText("项目单独设置");
  await expect(savedProjectLimitRow.getByRole("spinbutton").nth(0)).toHaveValue("4");
  await expect(savedProjectLimitRow.getByRole("spinbutton").nth(1)).toHaveValue("1");
  await expect(timeLimitDialog.getByRole("columnheader", { name: "范围" })).toHaveCount(0);
  const client = getE2eClient();
  expect(await client.auditLog.count({ where: { projectId: E2E_PROJECT_IDS[0], actionCode: "PROJECT_COLLABORATION_TIME_LIMITS_SAVED" } })).toBe(1);
  await client.$disconnect();
  await page.context().close();
});

for (const [loginName, roleCode] of [["e2e-dean", "DEAN"], ["e2e-key-sub-i", "KEY_SUB_I"]] as const) {
  test(`${roleCode} sees the authorized overview without configuration controls`, async ({ browser }) => {
    const page = await pageFor(browser, loginName);
    await page.goto(`/workspace/projects/${E2E_PROJECT_IDS[0]}/execution`);
    await expect(page.getByText("启动阶段", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "协作时限" }).click();
    const dialog = page.getByRole("dialog", { name: "项目协作时限" });
    await expect(dialog.getByRole("row", { name: /节点完成 PMO 审核/u })).toContainText("项目单独设置");
    await expect(dialog.getByRole("row", { name: /结题 PMO 审核/u })).toContainText("全局默认");
    await expect(dialog.getByRole("button", { name: "保存修改" })).toHaveCount(0);
    await expect(dialog.getByRole("columnheader", { name: "范围" })).toHaveCount(0);
    await expect(dialog.getByText("当前角色只读", { exact: false })).toBeVisible();
    await page.goto("/workspace/pmo/collaboration-time-limits");
    await page.waitForURL(/\/forbidden$/u, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "无法访问当前内容" })).toBeVisible();
    await page.context().close();
  });
}

test("Key Sub-I cross-project access is hidden and an ended grant disappears immediately", async ({ browser }) => {
  const page = await pageFor(browser, "e2e-key-sub-i");
  await page.goto(`/workspace/projects/${E2E_PROJECT_IDS[1]}/execution`);
  await expect(page.getByRole("heading", { name: "页面不存在" })).toBeVisible();

  const client = getE2eClient();
  const assignment = await client.roleAssignment.findFirstOrThrow({ where: { personId: E2E_PERSON_IDS.key, projectId: E2E_PROJECT_IDS[0], roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE" } });
  try {
    await client.roleAssignment.update({ where: { id: assignment.id }, data: { assignmentStatus: "ENDED", isPrimary: false, endedAt: new Date() } });
    await page.goto("/workspace/projects");
    await expect(page.getByText("暂无可访问的当前项目。", { exact: false })).toBeVisible();
  } finally {
    await client.roleAssignment.update({ where: { id: assignment.id }, data: { assignmentStatus: "ACTIVE", isPrimary: true, endedAt: null } });
    await client.$disconnect();
    await page.context().close();
  }
});

async function pageFor(browser: Browser, loginName: string): Promise<Page> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("登录名").fill(loginName);
  await page.getByLabel("密码").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/workspace\/projects$/u);
  return page;
}
