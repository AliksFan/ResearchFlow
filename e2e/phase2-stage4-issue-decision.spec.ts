import { expect, test, type Browser, type Page } from "@playwright/test";

import { E2E_PASSWORD, E2E_PROJECT_IDS, E2E_WORKFLOW_STAGE_ID, getE2eClient } from "./fixture";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test("Key Sub-I, PMO, and Dean complete a no-review issue decision round", async ({ browser }) => {
  const title = "虚构阶段四资源协调问题";
  const keyPage = await pageFor(browser, "e2e-key-sub-i");
  const issueSection = await openIssueReport(keyPage);
  await issueSection.getByLabel("标题").fill(title);
  await issueSection.getByLabel("问题说明").fill("虚构项目节点需要跨部门资源协调");
  await issueSection.getByLabel("期望支持").fill("请 PMO升级院长形成资源决定");
  await issueSection.getByLabel("当前灯态").selectOption("BLOCKED");
  const issueAttachment = issueSection.getByRole("group", { name: "附件（选填）" });
  await issueAttachment.getByText("我确认附件只包含虚拟或正式项目级资料").click();
  await issueAttachment.locator('input[type="file"]').setInputFiles({
    name: "虚构问题材料.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% virtual issue fixture\n1 0 obj\n<<>>\nendobj\n%%EOF\n"),
  });
  await expect(issueAttachment.getByRole("status")).toContainText("已准备 1 个附件");
  await issueSection.getByRole("button", { name: "提交问题" }).click();
  await expect(keyPage.getByText("问题记录已更新。")).toBeVisible();
  await expect(issueSection.getByText(title, { exact: true })).toBeVisible();
  await keyPage.context().close();

  const pmoPage = await pageFor(browser, "e2e-pmo");
  let issueDialog = await openIssueDialog(pmoPage);
  await expect(issueDialog.getByText("创建真实项目问题")).toHaveCount(0);
  let issueCard = issueDialog.locator("article").filter({ hasText: title });
  const [issueDownload] = await Promise.all([
    pmoPage.waitForEvent("download"),
    issueCard.getByRole("link", { name: /虚构问题材料.pdf/u }).click(),
  ]);
  expect(issueDownload.suggestedFilename()).toBe("虚构问题材料.pdf");
  await issueCard.getByText("升级院长决定").click();
  await issueCard.getByLabel("PMO判断").fill("虚构资源需要院长协调");
  await issueCard.getByLabel("PMO建议").fill("批准虚构资源支持");
  await issueCard.getByLabel("请院长决定的问题").fill("是否同意提供虚构资源支持");
  await issueCard.getByRole("button", { name: "确认提交" }).click();
  await expect(pmoPage.getByText("问题记录已更新。")).toBeVisible();
  await pmoPage.context().close();

  const deanPage = await pageFor(browser, "e2e-dean");
  issueDialog = await openIssueDialog(deanPage);
  issueCard = issueDialog.locator("article").filter({ hasText: title });
  await issueCard.getByText("记录院长正式决定").click();
  await issueCard.getByLabel("是否需要院长复核").selectOption("0");
  await issueCard.getByRole("button", { name: "确认提交" }).click();
  await expect(deanPage.getByText("问题记录已更新。")).toBeVisible();
  await deanPage.context().close();

  const implementationPage = await pageFor(browser, "e2e-pmo");
  issueDialog = await openIssueDialog(implementationPage);
  issueCard = issueDialog.locator("article").filter({ hasText: title });
  await issueCard.getByText("提交本轮落实结果").click();
  await issueCard.getByLabel("项目成员可见落实结果").fill("虚构项目节点可以继续执行");
  await issueCard.getByRole("button", { name: "确认提交" }).click();
  await expect(implementationPage.getByText("问题记录已更新。")).toBeVisible();
  await implementationPage.context().close();

  const confirmationPage = await pageFor(browser, "e2e-key-sub-i");
  issueDialog = await openIssueDialog(confirmationPage);
  issueCard = issueDialog.locator("article").filter({ hasText: title });
  await issueCard.getByText("原提报人确认解决结果").click();
  await issueCard.getByLabel("确认说明").fill("确认虚构资源问题已解决");
  await issueCard.getByRole("button", { name: "确认提交" }).click();
  await expect(confirmationPage.getByText("问题记录已更新。")).toBeVisible();

  const client = getE2eClient();
  await expect(client.issue.findFirstOrThrow({ where: { title }, select: { resolvedAt: true, resolutionMethod: true, handlingStates: { where: { exitedAt: null }, select: { stateCode: true } } } }))
    .resolves.toMatchObject({ resolvedAt: expect.any(Date), resolutionMethod: "REPORTER_CONFIRMED", handlingStates: [{ stateCode: "RESOLVED" }] });
  await client.$disconnect();
  await confirmationPage.context().close();

  const historyPage = await pageFor(browser, "e2e-pmo");
  issueDialog = await openIssueDialog(historyPage);
  await expect(issueDialog.getByText(title, { exact: true })).toBeHidden();
  await issueDialog.getByText("显示已解决/关闭问题（1）", { exact: true }).click();
  await expect(issueDialog.getByText(title, { exact: true })).toBeVisible();
  await historyPage.context().close();
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

async function openIssueDialog(page: Page) {
  await page.goto(`/workspace/projects/${E2E_PROJECT_IDS[0]}/execution?node=${E2E_WORKFLOW_STAGE_ID}&tab=issues`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "项目问题与决定落实" })).toBeVisible();
  return dialog;
}

async function openIssueReport(page: Page) {
  await page.goto(`/workspace/projects/${E2E_PROJECT_IDS[0]}/execution?node=${E2E_WORKFLOW_STAGE_ID}&tab=report&reportType=issue`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("navigation", { name: "填报类型" }).getByText("问题", { exact: true })).toHaveAttribute("aria-current", "page");
  await expect(dialog.getByText("创建真实项目问题")).toBeVisible();
  return dialog;
}
