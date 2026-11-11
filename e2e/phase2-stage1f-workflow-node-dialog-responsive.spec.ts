import { expect, test, type Browser, type Page } from "@playwright/test";

import { E2E_PASSWORD, E2E_PROJECT_IDS, E2E_WORKFLOW_STAGE_ID } from "./fixture";

test.setTimeout(90_000);

test("node dialog uses role-specific tabs and remains usable at 375px", async ({ browser }) => {
  const keyPage = await pageFor(browser, "e2e-key-sub-i", { width: 375, height: 812 });
  await keyPage.goto(`/workspace/projects/${E2E_PROJECT_IDS[0]}/execution`);
  const nodeTrigger = keyPage.getByRole("link", { name: "完成准备，未开始" });
  await nodeTrigger.focus();
  await keyPage.keyboard.press("Enter");
  const keyDialog = keyPage.getByRole("dialog");
  await expect(keyDialog.getByRole("heading", { name: "完成准备" })).toBeVisible();
  await expect(keyDialog.getByText("适用性", { exact: true })).toBeVisible();
  await expect(keyDialog.getByText("附件要求", { exact: true })).toBeVisible();
  await expect(keyDialog.getByText("直接前置", { exact: true })).toBeVisible();
  await expect(keyDialog.getByText("责任角色", { exact: true })).toBeVisible();
  await expect(keyDialog.getByRole("navigation", { name: "节点详情页签" }).getByRole("link")).toHaveText(["填报", "进展记录", "问题记录"]);
  await expect(keyDialog.getByText("节点概览", { exact: true })).toHaveCount(0);
  await expect(keyDialog.getByText("启动阶段 · 准备工作流", { exact: true })).toHaveCount(0);
  const keyBounds = await keyDialog.boundingBox();
  expect(keyBounds).not.toBeNull();
  expect(keyBounds!.x).toBeGreaterThanOrEqual(0);
  expect(keyBounds!.x + keyBounds!.width).toBeLessThanOrEqual(375);
  await expect(keyPage.locator("body")).toHaveCSS("overflow", "hidden");
  await keyPage.keyboard.press("Escape");
  await expect(keyDialog).toHaveCount(0);
  await expect(nodeTrigger).toBeFocused();
  await expect(keyPage.locator("body")).not.toHaveCSS("overflow", "hidden");
  await keyPage.keyboard.press("Enter");
  await expect(keyDialog).toBeVisible();
  await keyDialog.getByLabel("进展摘要").fill("尚未提交的虚构内容");
  keyPage.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("当前填报内容尚未提交");
    await dialog.accept();
  });
  await keyDialog.getByRole("navigation", { name: "填报类型" }).getByText("问题", { exact: true }).click();
  await expect(keyPage).toHaveURL(/reportType=issue/u);
  await keyPage.context().close();

  for (const loginName of ["e2e-pmo", "e2e-dean"] as const) {
    const page = await pageFor(browser, loginName, { width: 1280, height: 900 });
    await page.goto(nodeUrl("completion"));
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("navigation", { name: "节点详情页签" }).getByRole("link")).toHaveText(["进展记录", "问题记录"]);
    await expect(dialog.getByText("填报", { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("navigation", { name: "节点详情页签" }).getByText("进展记录", { exact: true })).toHaveAttribute("aria-current", "page");
    await page.context().close();
  }
});

async function pageFor(browser: Browser, loginName: string, viewport: { width: number; height: number }): Promise<Page> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("登录名").fill(loginName);
  await page.getByLabel("密码").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/workspace\/projects$/u);
  return page;
}

function nodeUrl(tab: string) {
  return `/workspace/projects/${E2E_PROJECT_IDS[0]}/execution?node=${E2E_WORKFLOW_STAGE_ID}&tab=${tab}`;
}
