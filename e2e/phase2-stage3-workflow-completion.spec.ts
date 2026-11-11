import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  E2E_PASSWORD,
  E2E_PERSON_IDS,
  E2E_PROJECT_IDS,
  E2E_SUCCESSOR_WORKFLOW_STAGE_ID,
  E2E_WORKFLOW_STAGE_ID,
  getE2eClient,
} from "./fixture";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test("PMO rejects an invalid template graph and publishes the unchanged valid draft", async ({ browser }) => {
  const page = await pageFor(browser, "e2e-pmo");
  await page.goto("/workspace/pmo/lifecycle-templates");
  await expect(page.getByRole("heading", { name: "工作流方案" })).toBeVisible();
  await page.getByRole("button", { name: "编辑方案" }).click();
  await expect(page.getByText("工作流方案已创建。")).toBeVisible();

  let draft = page.locator("article").first();
  await draft.getByRole("button", { name: /完成准备 REQUIRED/u }).click();
  const nodeDialog = page.getByRole("dialog");
  await nodeDialog.getByText("完成核验", { exact: true }).click();
  await nodeDialog.getByRole("button", { name: "关闭" }).click();
  await draft.getByRole("button", { name: "保存并发布" }).click();
  await expect(page.getByText("依赖关系形成环路，无法发布。")).toBeVisible();

  draft = page.locator("article").first();
  await draft.getByRole("button", { name: "保存并发布" }).click();
  await expect(page.getByText("工作流方案《虚拟 E2E 项目生命周期》已发布，可用于新申请。")).toBeVisible();
  await expect(page.locator("article").first().getByText("已发布", { exact: true })).toBeVisible();
  const client = getE2eClient();
  await expect(client.lifecycleTemplateVersion.count({ where: { lifecycleTemplateId: "e8000000-0000-4000-8000-000000000001", status: "PUBLISHED" } })).resolves.toBe(2);
  await client.$disconnect();
  await page.context().close();
});

test("PMO removes draft nodes, stages, and workflows with dependency cleanup", async ({ browser }) => {
  const page = await pageFor(browser, "e2e-pmo");
  await page.goto("/workspace/pmo/lifecycle-templates");
  await page.locator("article").first().getByRole("button", { name: "编辑方案" }).click();
  await expect(page.getByText("工作流方案已创建。")).toBeVisible();

  const draft = page.locator("article").first();
  await draft.getByRole("button", { name: /完成准备 REQUIRED/u }).click();
  await page.getByRole("dialog").getByRole("button", { name: "删除节点" }).click();
  await expect(draft.getByRole("button", { name: /完成准备 REQUIRED/u })).toHaveCount(0);
  await draft.getByRole("button", { name: "保存方案" }).click();
  await expect(page.getByText("工作流方案已保存。")).toBeVisible();

  const client = getE2eClient();
  const persistedDraft = await client.lifecycleTemplateVersion.findFirstOrThrow({
    where: { lifecycleTemplateId: "e8000000-0000-4000-8000-000000000001", status: "DRAFT" },
    orderBy: { versionNo: "desc" },
    include: { workflowStageTemplates: { include: { successorDependencies: true } } },
  });
  expect(persistedDraft.workflowStageTemplates).toHaveLength(1);
  expect(persistedDraft.workflowStageTemplates[0]?.successorDependencies).toHaveLength(0);

  await draft.getByRole("button", { name: "启动阶段", exact: true }).click();
  const confirmation = page.waitForEvent("dialog").then(async (dialog) => {
    expect(dialog.message()).toContain("同时删除 1 个节点");
    await dialog.accept();
  });
  await page.getByRole("dialog").getByRole("button", { name: "删除阶段" }).click();
  await confirmation;
  await expect(draft.getByRole("button", { name: "启动阶段", exact: true })).toHaveCount(0);

  await draft.getByRole("button", { name: "核验工作流", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "删除工作流" }).click();
  await expect(draft.getByRole("button", { name: "核验工作流", exact: true })).toHaveCount(0);
  const saveButton = draft.getByRole("button", { name: "保存方案" });
  await expect(saveButton).toBeEnabled();
  await Promise.all([
    page.waitForEvent("framenavigated"),
    saveButton.click(),
  ]);
  await expect(page.getByText("工作流方案已保存。")).toBeVisible();

  const finalDraft = await client.lifecycleTemplateVersion.findFirstOrThrow({
    where: { lifecycleTemplateId: "e8000000-0000-4000-8000-000000000001", status: "DRAFT" },
    orderBy: { versionNo: "desc" },
    include: {
      stageTemplates: true,
      workflowTemplates: true,
      workflowStageTemplates: true,
      workflowStageDependencies: true,
    },
  });
  expect(finalDraft.stageTemplates).toHaveLength(0);
  expect(finalDraft.workflowTemplates.map(({ workflowName }) => workflowName)).toEqual(["准备工作流"]);
  expect(finalDraft.workflowStageTemplates).toHaveLength(0);
  expect(finalDraft.workflowStageDependencies).toHaveLength(0);
  await client.$disconnect();
  await page.context().close();
});

test("Key Sub-I submits dependent completion requests and PMO formally approves them", async ({ browser }) => {
  const keyPage = await pageFor(browser, "e2e-key-sub-i");
  let completionSection = await openCompletionReport(keyPage, E2E_SUCCESSOR_WORKFLOW_STAGE_ID);

  const successor = completionSection.locator("details").filter({ hasText: "申请完成：核验工作流 · 完成核验" });
  await expect(successor).toHaveAttribute("open", "");
  await successor.getByLabel("完成摘要").fill("虚构后继节点完成");
  await successor.getByLabel("完成依据").fill("虚构后继节点核验依据");
  await successor.locator('input[name="attachments"]').setInputFiles({
    name: "虚构节点完成依据.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% virtual workflow completion fixture\n1 0 obj\n<<>>\nendobj\n%%EOF\n"),
  });
  await successor.getByText("我确认附件只包含虚拟或正式项目级资料").click();
  await successor.getByRole("button", { name: "提交完成申请" }).click();
  await expect(keyPage.getByText("节点完成申请已更新。")).toBeVisible({ timeout: 30_000 });
  await keyPage.waitForURL((url) => url.searchParams.get("completionSaved") === "submitted");
  await keyPage.waitForLoadState("networkidle");
  await expect(completionSection.locator("article").filter({ hasText: "虚构后继节点完成" })).toContainText("等待前置");

  completionSection = await openCompletionReport(keyPage, E2E_WORKFLOW_STAGE_ID);
  const predecessor = completionSection.locator("details").filter({ hasText: "申请完成：准备工作流 · 完成准备" });
  await expect(predecessor).toHaveAttribute("open", "");
  await predecessor.getByLabel("完成摘要").fill("虚构前置节点完成");
  await predecessor.getByLabel("完成依据").fill("虚构前置节点完成依据");
  await predecessor.getByRole("button", { name: "提交完成申请" }).click();
  await expect(keyPage.getByText("节点完成申请已更新。")).toBeVisible({ timeout: 30_000 });
  await keyPage.context().close();

  const pmoPage = await pageFor(browser, "e2e-pmo");
  let pmoDialog = await openCompletionDialog(pmoPage, E2E_SUCCESSOR_WORKFLOW_STAGE_ID);
  const successorRequest = pmoDialog.locator("article").filter({ hasText: "虚构后继节点完成" });
  await expect(successorRequest.getByRole("button", { name: "正式批准" })).toBeDisabled();
  await expect(successorRequest.getByRole("link", { name: /虚构节点完成依据.pdf/u })).toBeVisible();
  pmoDialog = await openCompletionDialog(pmoPage, E2E_WORKFLOW_STAGE_ID);
  const predecessorRequest = pmoDialog.locator("article").filter({ hasText: "虚构前置节点完成" });
  await predecessorRequest.getByPlaceholder("审核意见").fill("同意虚构前置节点完成");
  await predecessorRequest.getByRole("button", { name: "正式批准" }).click();
  await expect(pmoPage.getByText("节点完成申请已更新。")).toBeVisible();
  pmoDialog = await openCompletionDialog(pmoPage, E2E_SUCCESSOR_WORKFLOW_STAGE_ID);
  const activatedSuccessor = pmoDialog.locator("article").filter({ hasText: "虚构后继节点完成" });
  await expect(activatedSuccessor).toContainText("待 PMO审核");
  await activatedSuccessor.getByPlaceholder("审核意见").fill("同意虚构后继节点完成");
  await activatedSuccessor.getByRole("button", { name: "正式批准" }).click();
  await expect(pmoPage.getByText("节点完成申请已更新。")).toBeVisible();

  const client = getE2eClient();
  await expect(client.projectWorkflowStage.findMany({
    where: { id: { in: [E2E_WORKFLOW_STAGE_ID, E2E_SUCCESSOR_WORKFLOW_STAGE_ID] } },
    orderBy: { id: "asc" },
    select: { executionStatus: true },
  })).resolves.toEqual([{ executionStatus: "COMPLETED" }, { executionStatus: "COMPLETED" }]);
  await expect(client.notification.count({ where: {
    recipientPersonId: E2E_PERSON_IDS.secondPmo,
    eventCode: "WORKFLOW_COMPLETION_REVIEW_RESULT",
    messageKind: "INFORMATIONAL",
  } })).resolves.toBeGreaterThan(0);
  await client.$disconnect();
  await pmoPage.context().close();
});

test("Dean reads formal completion and the source-marked time-limit table without write controls", async ({ browser }) => {
  const page = await pageFor(browser, "e2e-dean");
  let dialog = await openCompletionDialog(page, E2E_WORKFLOW_STAGE_ID);
  await expect(dialog.getByText("虚构前置节点完成", { exact: true })).toBeVisible();
  await expect(dialog.getByText("正式绿色", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "正式批准" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "提交完成申请" })).toHaveCount(0);
  dialog = await openCompletionDialog(page, E2E_SUCCESSOR_WORKFLOW_STAGE_ID);
  await expect(dialog.getByText("虚构后继节点完成", { exact: true })).toBeVisible();
  await expect(dialog.getByText("正式绿色", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("link", { name: /虚构节点完成依据.pdf/u })).toBeVisible();
  await page.goto(`/workspace/projects/${E2E_PROJECT_IDS[0]}/execution?panel=time-limits`);
  await expect(page.getByRole("dialog", { name: "项目协作时限" }).getByRole("row", { name: /节点完成 PMO 审核/u })).toContainText("项目单独设置");
  await page.context().close();
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

async function openCompletionDialog(page: Page, nodeId: string) {
  await page.goto(`/workspace/projects/${E2E_PROJECT_IDS[0]}/execution?node=${nodeId}&tab=progress`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("navigation", { name: "节点详情页签" }).getByText("进展记录", { exact: true })).toHaveAttribute("aria-current", "page");
  return dialog;
}

async function openCompletionReport(page: Page, nodeId: string) {
  await page.goto(`/workspace/projects/${E2E_PROJECT_IDS[0]}/execution?node=${nodeId}&tab=report&reportType=completion`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "节点完成申请" })).toBeVisible();
  await expect(dialog.getByRole("navigation", { name: "填报类型" }).getByText("完成申请", { exact: true })).toHaveAttribute("aria-current", "page");
  return dialog;
}
