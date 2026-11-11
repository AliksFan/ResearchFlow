import { expect, test, type Page } from "@playwright/test";

import { E2E_PASSWORD } from "./fixture.js";

test("PMO deletes an unreferenced option while reserved OTHER stays last and locked", async ({ page }) => {
  await login(page);
  await page.goto("/workspace/pmo/dictionaries?dictionary=RESEARCH_TYPE");

  const rows = page.locator("tbody tr");
  const otherRow = rows.filter({ hasText: "OTHER" });
  await expect(otherRow.locator('input[name^="displayName:"]')).toHaveValue("其它");
  await expect(otherRow).toContainText("系统保留，不可删除");
  await expect(otherRow.locator('input[name^="displayName:"]')).toBeDisabled();
  await expect(otherRow.locator('input[name^="sortOrder:"]')).toBeDisabled();
  await expect(otherRow.locator('input[name^="enabled:"]')).toBeDisabled();
  await expect(rows.last()).toContainText("OTHER");

  const optionName = "虚构待删除研究类型";
  await page.getByPlaceholder("显示名称").fill(optionName);
  await page.getByRole("button", { name: "新增选项" }).click();
  await page.waitForURL(/saved=created/u);

  const createdRow = page.locator(`//input[@value="${optionName}"]/ancestor::tr`);
  await expect(createdRow).toBeVisible();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain(optionName);
    await dialog.accept();
  });
  await createdRow.getByRole("button", { name: `删除${optionName}` }).click();
  await page.waitForURL(/saved=deleted/u);
  await expect(page.getByText("选项已删除并记录审计。")).toBeVisible();
  await expect(page.locator(`//input[@value="${optionName}"]`)).toHaveCount(0);
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("登录名").fill("e2e-pmo");
  await page.getByLabel("密码").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/workspace$/u);
}
