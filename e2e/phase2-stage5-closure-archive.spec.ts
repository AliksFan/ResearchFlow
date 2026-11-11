import { expect, test, type Browser, type Page } from "@playwright/test";

import { E2E_PASSWORD, E2E_PROJECT_IDS, E2E_WORKFLOW_STAGE_ID, getE2eClient } from "./fixture";

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

test("Key Sub-I and PMO complete blocked closure, immutable resubmission, archive, and restore", async ({ browser }) => {
  const projectId = E2E_PROJECT_IDS[0];
  const issueTitle = "虚构阶段五结题阻塞问题";
  const keyPage = await pageFor(browser, "e2e-key-sub-i");
  const closure = await openClosurePanel(keyPage, projectId);
  await expect(closure.getByText("初始硬门禁已通过", { exact: true })).toBeVisible();
  await closure.getByLabel("结题总结").fill("虚构项目已完成全部必需节点与治理收口");
  await closure.getByLabel("未完成可选节点及遗留事项说明").fill("无");
  await closure.getByText("已明确确认未完成与遗留事项声明").click();
  await closure.getByLabel("资料归档与合规自查").fill("已完成虚构项目级材料归档与合规自查");
  await closure.getByText("主 Key Sub-I确认以上内容真实").click();
  const attachment = closure.getByRole("group", { name: "结题附件（选填）" });
  await attachment.getByText("我确认附件只含项目级资料").click();
  await attachment.locator('input[type="file"]').setInputFiles({
    name: "虚构结题材料.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% virtual project closure fixture\n1 0 obj\n<<>>\nendobj\n%%EOF\n"),
  });
  await expect(attachment.getByText(/已准备 1 个附件/u)).toBeVisible({ timeout: 30_000 });
  await closure.getByRole("button", { name: "提交结题申请" }).click();
  await expect(closure.getByText("结题或归档状态已更新。")).toBeVisible({ timeout: 30_000 });
  await expect(closure.getByText("项目状态：结题中")).toBeVisible();

  const issues = await openIssueReport(keyPage, projectId);
  await issues.getByLabel("标题").fill(issueTitle);
  await issues.getByLabel("问题说明").fill("虚构结题复核期间发现项目级材料索引问题");
  await issues.getByRole("button", { name: "提交问题" }).click();
  await expect(keyPage.getByText("问题记录已更新。")).toBeVisible();
  const blockedClosure = await openClosurePanel(keyPage, projectId);
  await expect(blockedClosure.getByText(/CLOSURE_BLOCKED/u)).toBeVisible();
  await keyPage.context().close();

  const pmoPage = await pageFor(browser, "e2e-pmo");
  let issueDialog = await openIssuePanel(pmoPage, projectId);
  let issueCard = issueDialog.locator("article").filter({ hasText: issueTitle });
  await issueCard.getByText("无效关闭", { exact: true }).click();
  await issueCard.getByLabel("项目成员可见结论").fill("虚构材料索引问题经核对无需处理");
  await issueCard.getByRole("button", { name: "确认提交" }).click();
  await expect(pmoPage.getByText("问题记录已更新。")).toBeVisible();
  let pmoClosure = await openClosurePanel(pmoPage, projectId);
  await expect(pmoClosure.getByText(/CLOSURE_PENDING_PMO_REVIEW/u)).toBeVisible();
  await pmoClosure.getByLabel("退回原因").fill("请补充虚构项目材料索引复核说明");
  await pmoClosure.getByRole("button", { name: "确认退回补充" }).click();
  await expect(pmoClosure.getByText("结题或归档状态已更新。")).toBeVisible({ timeout: 30_000 });
  await pmoPage.context().close();

  const resubmitPage = await pageFor(browser, "e2e-key-sub-i");
  const resubmitClosure = await openClosurePanel(resubmitPage, projectId);
  await expect(resubmitClosure.getByText("因 PMO退回需补充", { exact: true })).toBeVisible();
  await expect(resubmitClosure.getByText("请补充虚构项目材料索引复核说明", { exact: false })).toBeVisible();
  await resubmitPage.goto("/workspace/notifications");
  const supplementMessage = resubmitPage.getByRole("button", { name: /结题材料需补充.*待处理/u });
  await expect(supplementMessage).toBeVisible();
  await supplementMessage.click();
  await resubmitPage.waitForURL((url) =>
    url.pathname === `/workspace/projects/${projectId}/execution` && url.searchParams.get("panel") === "closure",
  );
  await expect(resubmitPage.getByRole("dialog", { name: "项目结题与归档" }).getByText("请补充虚构项目材料索引复核说明", { exact: false })).toBeVisible();
  await resubmitPage.goto("/workspace/notifications?view=pending");
  await expect(resubmitPage.getByRole("button", { name: /结题材料需补充.*待处理/u })).toBeVisible();
  const otherProjectKeyPage = await pageFor(browser, "e2e-second-key-sub-i");
  await otherProjectKeyPage.goto(`/workspace/projects/${projectId}/execution`);
  await expect(otherProjectKeyPage.getByRole("heading", { name: "页面不存在" })).toBeVisible();
  await expect(otherProjectKeyPage.getByText("请补充虚构项目材料索引复核说明", { exact: false })).toHaveCount(0);
  await otherProjectKeyPage.context().close();
  await openClosurePanel(resubmitPage, projectId);
  await resubmitClosure.getByLabel("结题总结").fill("虚构项目已完成全部必需节点并补充材料索引复核");
  await resubmitClosure.getByLabel("未完成可选节点及遗留事项说明").fill("无");
  await resubmitClosure.getByText("已明确确认未完成与遗留事项声明").click();
  await resubmitClosure.getByLabel("资料归档与合规自查").fill("已复核虚构项目材料索引和归档完整性");
  await resubmitClosure.getByText("主 Key Sub-I确认以上内容真实").click();
  await resubmitClosure.getByRole("button", { name: "补充并重新提交结题申请" }).click();
  await expect(resubmitClosure.getByText("结题或归档状态已更新。")).toBeVisible({ timeout: 30_000 });
  await expect(resubmitClosure.getByText(/材料版本 2/u)).toBeVisible();
  await resubmitPage.context().close();

  const secondPmoPage = await pageFor(browser, "e2e-second-pmo");
  await secondPmoPage.goto("/workspace/notifications");
  await expect(secondPmoPage.getByText("结题待办已由其他 PMO处理", { exact: true })).toBeVisible();
  await expect(secondPmoPage.getByText("信息", { exact: true }).first()).toBeVisible();
  await secondPmoPage.context().close();

  const approvePage = await pageFor(browser, "e2e-pmo");
  pmoClosure = await openClosurePanel(approvePage, projectId);
  await pmoClosure.getByLabel("审核意见").fill("虚构项目结题材料与治理记录已复核通过");
  await pmoClosure.getByRole("button", { name: "确认通过结题" }).click();
  await expect(pmoClosure.getByText("结题或归档状态已更新。")).toBeVisible({ timeout: 30_000 });
  await expect(pmoClosure.getByText("项目状态：已完成")).toBeVisible();
  await expect(approvePage.getByRole("button", { name: "提交问题" })).toHaveCount(0);
  await expect(approvePage.getByRole("button", { name: "提交进展" })).toHaveCount(0);

  await pmoClosure.getByLabel("项目成员可见原因").fill("虚构项目材料已完成归档");
  await pmoClosure.getByRole("button", { name: "确认归档" }).click();
  await expect(pmoClosure.getByText("结题或归档状态已更新。")).toBeVisible({ timeout: 30_000 });
  await expect(pmoClosure.getByText("项目状态：已归档 · 只读")).toBeVisible();
  await pmoClosure.getByLabel("项目成员可见原因").fill("虚构项目需要恢复只读查阅");
  await pmoClosure.getByRole("button", { name: "确认取消归档" }).click();
  await expect(pmoClosure.getByText("结题或归档状态已更新。")).toBeVisible({ timeout: 30_000 });
  await expect(pmoClosure.getByText("项目状态：已完成")).toBeVisible();

  const client = getE2eClient();
  await expect(client.projectCompletionSubmissionVersion.findMany({ where: { projectId }, orderBy: { versionNo: "asc" }, select: { versionNo: true } }))
    .resolves.toEqual([{ versionNo: 1 }, { versionNo: 2 }]);
  await expect(client.businessAttachment.count({ where: { projectId, parentType: "PROJECT_COMPLETION_SUBMISSION_VERSION" } })).resolves.toBe(1);
  await expect(client.projectArchiveActivity.findMany({ where: { projectId }, orderBy: { occurredAt: "asc" }, select: { action: true } }))
    .resolves.toEqual([{ action: "ARCHIVED" }, { action: "RESTORED" }]);
  await expect(client.project.findUniqueOrThrow({ where: { id: projectId }, select: { status: true } })).resolves.toEqual({ status: "COMPLETED" });
  await client.$disconnect();
  await approvePage.context().close();

  const deanPage = await pageFor(browser, "e2e-dean");
  await deanPage.goto(`/workspace/projects/${projectId}/execution`);
  await expect(deanPage.getByText("已完成", { exact: true }).first()).toBeVisible();
  await expect(deanPage.getByRole("button", { name: "确认提交" })).toHaveCount(0);
  await deanPage.context().close();
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

async function openClosurePanel(page: Page, projectId: string) {
  await page.goto(`/workspace/projects/${projectId}/execution?panel=closure`);
  const dialog = page.getByRole("dialog", { name: "项目结题与归档" });
  await expect(dialog.getByRole("heading", { name: "项目结题与归档" })).toBeVisible();
  return dialog;
}

async function openIssuePanel(page: Page, projectId: string) {
  await page.goto(`/workspace/projects/${projectId}/execution?node=${E2E_WORKFLOW_STAGE_ID}&tab=issues`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "项目问题与决定落实" })).toBeVisible();
  return dialog;
}

async function openIssueReport(page: Page, projectId: string) {
  await page.goto(`/workspace/projects/${projectId}/execution?node=${E2E_WORKFLOW_STAGE_ID}&tab=report&reportType=issue`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("navigation", { name: "填报类型" }).getByText("问题", { exact: true })).toHaveAttribute("aria-current", "page");
  await expect(dialog.getByText("创建真实项目问题")).toBeVisible();
  return dialog;
}
