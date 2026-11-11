import { expect, test, type Browser, type Page } from "@playwright/test";

import { E2E_PASSWORD, E2E_PROJECT_IDS } from "./fixture";

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

test("authorized project roles edit the independent swimlane while read-only roles cannot", async ({ browser }) => {
  const projectUrl = `/workspace/projects/${E2E_PROJECT_IDS[0]}/execution`;
  const pmo = await pageFor(browser, "e2e-pmo");
  await pmo.goto(projectUrl);

  await expect(pmo.getByText("虚拟 E2E 项目泳道", { exact: true })).toBeVisible();
  await expect(pmo.getByText(/计划\s*v\d+/u)).toHaveCount(0);
  await pmo.getByRole("button", { name: "修改泳道" }).click();

  const editor = pmo.getByRole("dialog", { name: "修改项目泳道" });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("columnheader", { name: "工作流 / 阶段" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "启动阶段" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "准备工作流" })).toBeVisible();
  await expect(editor.getByRole("button", { name: /完成准备/u })).toBeVisible();

  const updatedName = "虚拟 E2E 项目独立泳道";
  await editor.getByLabel("泳道名称").fill(updatedName);
  await editor.getByLabel("修改原因（必填）").fill("虚构 E2E 验证项目泳道直接生效");
  await editor.getByRole("button", { name: "提交并生效" }).click();

  const confirmation = pmo.getByRole("alertdialog");
  await expect(confirmation.getByRole("heading", { name: "确认提交并直接生效" })).toBeVisible();
  await expect(confirmation.getByText("泳道名称", { exact: true })).toBeVisible();
  await confirmation.getByRole("button", { name: "确认并生效" }).click();

  await expect(pmo.getByText(updatedName, { exact: true })).toBeVisible({ timeout: 60_000 });
  await pmo.reload();
  await expect(pmo.getByText(updatedName, { exact: true })).toBeVisible();
  await expect(pmo.getByRole("button", { name: "修改泳道" })).toBeVisible();

  const primaryKey = await pageFor(browser, "e2e-key-sub-i");
  await primaryKey.goto(projectUrl);
  await expect(primaryKey.getByText(updatedName, { exact: true })).toBeVisible();
  await expect(primaryKey.getByRole("button", { name: "修改泳道" })).toBeVisible();

  const dean = await pageFor(browser, "e2e-dean");
  await dean.goto(projectUrl);
  await expect(dean.getByText(updatedName, { exact: true })).toBeVisible();
  await expect(dean.getByRole("button", { name: "修改泳道" })).toHaveCount(0);

  const otherProjectKey = await pageFor(browser, "e2e-second-key-sub-i");
  await otherProjectKey.goto(projectUrl);
  await expect(otherProjectKey.getByRole("heading", { name: "页面不存在" })).toBeVisible();

  for (const page of [pmo, primaryKey, dean, otherProjectKey]) await page.context().close();
});

async function pageFor(browser: Browser, loginName: string): Promise<Page> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("登录名").fill(loginName);
  await page.getByLabel("密码").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/workspace(?:\/projects)?$/u, { timeout: 60_000 });
  return page;
}
