import { expect, test, type Page } from "@playwright/test";

import { E2E_PASSWORD } from "./fixture";

test("PMO management pages expose only active dictionaries and omit project-list links", async ({ page }) => {
  await login(page);

  await page.goto("/workspace/pmo/dictionaries?dictionary=UNKNOWN_DICTIONARY");
  await expect(page.getByRole("heading", { name: "字典管理" })).toBeVisible();
  await expect(page.getByRole("link", { name: "疾病方向" })).toBeVisible();
  await expect(page.getByRole("link", { name: "研究类型" })).toBeVisible();
  await expect(page.getByRole("link", { name: "项目优先级" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "问题类型" })).toBeVisible();
  await expect(page.getByText(/合同状态|伦理状态|注册状态|经费状态|外部联系人分类/u)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "返回项目列表" })).toHaveCount(0);

  for (const path of [
    "/workspace/pmo/lifecycle-templates",
    "/workspace/pmo/collaboration-time-limits",
    "/admin/access",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "返回项目列表" })).toHaveCount(0);
  }
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("登录名").fill("e2e-pmo");
  await page.getByLabel("密码").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/workspace\/projects$/u);
}
