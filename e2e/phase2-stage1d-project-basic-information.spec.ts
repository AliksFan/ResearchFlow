import { expect, test, type Page } from "@playwright/test";

import { E2E_PASSWORD, E2E_PROJECT_IDS } from "./fixture";

const projectUrl = `/workspace/projects/${E2E_PROJECT_IDS[0]}/execution`;

test("project basic information follows Key Sub-I and PMO cross-review while Dean stays read-only", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "e2e-key-sub-i");
  await page.goto(projectUrl);
  const information = page.getByRole("heading", { name: "项目基础信息" }).locator("xpath=ancestor::section[1]");
  await expect(information.getByText("项目进展记录口径，不作为财务结余或账务结论。")).toBeVisible();
  await expect(information.getByText(/合同状态|伦理状态|注册状态|经费状态/u)).toHaveCount(0);
  const establishment = information.getByText("建档记录").locator("..");
  await expect(establishment).not.toHaveAttribute("open", "");
  await establishment.getByText("建档记录").click();
  await expect(information.getByText("申请编号")).toBeVisible();

  await information.getByRole("link", { name: "修改基础信息" }).click();
  await page.getByLabel("项目名称").fill("虚构浏览器验收项目");
  await page.getByLabel("项目简介").fill("虚构项目级浏览器验收简介");
  await page.locator('select[name="diseaseAreaOptionId"]').selectOption({ label: "其它" });
  await page.getByLabel("研究方向（选择其他时填写）").fill("虚构其它研究方向");
  await page.getByLabel("变更原因").fill("验证主负责人发起后由 PMO 审核");
  await page.getByRole("button", { name: "提交变更" }).click();
  await expect(page.getByRole("status")).toContainText("基础信息变更已提交");

  await logout(page);
  await login(page, "e2e-pmo");
  await page.goto(projectUrl);
  await expect(page.getByText("审核变更 · 待 PMO 审核")).toBeVisible();
  await page.getByRole("button", { name: "确认并应用" }).click();
  await expect(page.getByRole("status")).toContainText("基础信息变更已确认并生效");
  await expect(page.getByRole("heading", { name: "虚构浏览器验收项目" })).toBeVisible();
  await expect(page.getByText("其它：虚构其它研究方向", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "修改基础信息" }).click();
  await page.getByLabel("申办方（可清空）").fill("虚构浏览器验收申办方");
  await page.getByLabel("变更原因").fill("验证 PMO 发起后由主负责人确认");
  await page.getByRole("button", { name: "提交变更" }).click();
  await expect(page.getByText("查看变更 · 待主 Key Sub-I 确认")).toBeVisible();

  await logout(page);
  await login(page, "e2e-key-sub-i");
  await page.goto(projectUrl);
  await expect(page.getByText("确认变更 · 待主 Key Sub-I 确认")).toBeVisible();
  await page.getByRole("button", { name: "确认并应用" }).click();
  await expect(page.getByText("虚构浏览器验收申办方", { exact: true })).toBeVisible();

  await logout(page);
  await login(page, "e2e-dean");
  await page.goto(projectUrl);
  await expect(page.getByText("虚构浏览器验收申办方", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "修改基础信息" })).toHaveCount(0);
  await expect(page.getByText(/审核变更|确认变更/u)).toHaveCount(0);
  await expect(page.getByText("变更记录（2）")).toBeVisible();
});

async function login(page: Page, loginName: string) {
  await page.goto("/login");
  await page.getByLabel("登录名").fill(loginName);
  await page.getByLabel("密码").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/workspace\/projects$/u, { timeout: 45_000 });
}

async function logout(page: Page) {
  await page.context().clearCookies();
}
