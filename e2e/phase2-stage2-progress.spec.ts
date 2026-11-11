import { expect, test, type Browser, type Page } from "@playwright/test";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { E2E_PASSWORD, E2E_PERSON_IDS, E2E_PROJECT_IDS, E2E_WORKFLOW_STAGE_ID, getE2eClient } from "./fixture";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test("Key Sub-I submits progress with optional amount and a controlled attachment", async ({ browser }) => {
  const page = await pageFor(browser, "e2e-key-sub-i");
  const progressSection = await openProgressReport(page);
  await expect(progressSection).toBeVisible();
  await progressSection.getByLabel("进展摘要").fill("虚拟 E2E 普通进展");
  await progressSection.getByLabel("填报依据").fill("虚拟项目计划核对结果");
  await progressSection.getByLabel("预计完成日期（选填）").fill("2026-09-12");
  await progressSection.getByLabel("本次经费使用金额（元）（选填）").fill("1280.50");
  await progressSection.locator('input[name="attachments"]').setInputFiles({
    name: "虚拟项目进展.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% virtual project-level fixture\n1 0 obj\n<<>>\nendobj\n%%EOF\n"),
  });
  await progressSection.getByText("我确认附件只包含虚拟或正式项目级资料").click();
  await progressSection.getByRole("button", { name: "提交项目进展" }).click();

  await expect(page.getByText("项目进展已提交。")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("虚拟 E2E 普通进展")).toBeVisible();
  await expect(page.getByText("¥ 1280.50")).toHaveCount(1);
  await expect(page.getByRole("link", { name: /虚拟项目进展.pdf/u })).toBeVisible();

  const client = getE2eClient();
  await expect(client.workflowUpdate.count({ where: { projectId: E2E_PROJECT_IDS[0] } })).resolves.toBe(1);
  await expect(client.businessAttachment.count({ where: { projectId: E2E_PROJECT_IDS[0] } })).resolves.toBe(1);
  await expect(client.auditLog.count({ where: { projectId: E2E_PROJECT_IDS[0], actionCode: "WORKFLOW_PROGRESS_SUBMITTED" } })).resolves.toBe(1);
  await client.$disconnect();
  await page.context().close();
});

test("Key Sub-I appends an amount correction without rewriting the original progress", async ({ browser }) => {
  const page = await pageFor(browser, "e2e-key-sub-i");
  await openProgressDialog(page);
  await page.getByText("纠错", { exact: true }).click();
  await page.getByLabel("纠错原因").fill("虚拟 E2E 金额录入纠错");
  await page.getByRole("group", { name: "经费使用金额" }).getByRole("combobox").selectOption("SET");
  await page.getByPlaceholder("选择修改为时填写").fill("1300.25");
  await page.getByRole("button", { name: "提交纠错" }).click();

  await expect(page.getByText("进展纠错已追加。")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("¥ 1300.25")).toHaveCount(1);
  const client = getE2eClient();
  await expect(client.workflowUpdateCorrection.count({ where: { projectId: E2E_PROJECT_IDS[0] } })).resolves.toBe(1);
  const original = await client.workflowUpdate.findFirstOrThrow({
    where: { projectId: E2E_PROJECT_IDS[0] },
    select: { budgetAmountCny: true },
  });
  expect(original.budgetAmountCny?.toFixed(2)).toBe("1280.50");
  await client.$disconnect();
  await page.context().close();
});

for (const loginName of ["e2e-pmo", "e2e-dean"] as const) {
  test(`${loginName} reads the same progress and attachment without write controls`, async ({ browser }) => {
    const page = await pageFor(browser, loginName);
    await openProgressDialog(page);
    await expect(page.getByText("虚拟 E2E 普通进展")).toBeVisible();
    await expect(page.getByRole("link", { name: /虚拟项目进展.pdf/u })).toBeVisible();
    await expect(page.getByRole("button", { name: "提交项目进展" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "提交纠错" })).toHaveCount(0);
    if (loginName === "e2e-pmo") {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("link", { name: /虚拟项目进展.pdf/u }).click(),
      ]);
      expect(download.suggestedFilename()).toBe("虚拟项目进展.pdf");
      const client = getE2eClient();
      await expect(client.auditLog.count({
        where: { projectId: E2E_PROJECT_IDS[0], actionCode: "ATTACHMENT_DOWNLOAD_AUTHORIZED" },
      })).resolves.toBe(1);
      await client.$disconnect();
    }
    await page.context().close();
  });
}

test("a revoked Key Sub-I session loses protected attachment download authorization", async ({ browser }) => {
  const page = await pageFor(browser, "e2e-key-sub-i");
  await openProgressDialog(page);
  const href = await page.getByRole("link", { name: /虚拟项目进展.pdf/u }).getAttribute("href");
  expect(href).toBeTruthy();
  const client = getE2eClient();
  await client.session.updateMany({ where: { personId: E2E_PERSON_IDS.key, revokedAt: null }, data: { revokedAt: new Date() } });
  const response = await page.request.get(href!, { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain("/login");
  await client.$disconnect();
  await page.context().close();
});

test("a missing storage object is removed from the readable progress record", async ({ browser }) => {
  const client = getE2eClient();
  const asset = await client.fileAsset.findFirstOrThrow({
    where: { projectId: E2E_PROJECT_IDS[0], status: "AVAILABLE" },
    select: { id: true, storageObjectKey: true },
  });
  const storage = e2eStorageClient();
  await storage.send(new DeleteObjectCommand({
    Bucket: process.env.ATTACHMENT_S3_BUCKET!,
    Key: asset.storageObjectKey,
  }));
  storage.destroy();

  const page = await pageFor(browser, "e2e-pmo");
  const response = await page.request.get(`/workspace/attachments/${asset.id}/download`, { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toContain("STORAGE_OBJECT_MISSING");
  await openProgressDialog(page);
  await expect(page.getByRole("link", { name: /虚拟项目进展.pdf/u })).toHaveCount(0);
  await expect(client.fileAsset.findUniqueOrThrow({ where: { id: asset.id }, select: { status: true } })).resolves.toEqual({ status: "REMOVED" });
  await expect(client.auditLog.count({
    where: { projectId: E2E_PROJECT_IDS[0], actionCode: "ATTACHMENT_STORAGE_OBJECT_MISSING" },
  })).resolves.toBe(1);
  await client.$disconnect();
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

async function openProgressDialog(page: Page) {
  await page.goto(`/workspace/projects/${E2E_PROJECT_IDS[0]}/execution?node=${E2E_WORKFLOW_STAGE_ID}&tab=progress`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("navigation", { name: "节点详情页签" }).getByText("进展记录", { exact: true })).toHaveAttribute("aria-current", "page");
  return dialog;
}

async function openProgressReport(page: Page) {
  await page.goto(`/workspace/projects/${E2E_PROJECT_IDS[0]}/execution?node=${E2E_WORKFLOW_STAGE_ID}&tab=report&reportType=progress`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "项目进展", exact: true })).toBeVisible();
  await expect(dialog.getByRole("navigation", { name: "填报类型" }).getByText("正常填报", { exact: true })).toHaveAttribute("aria-current", "page");
  return dialog;
}

function e2eStorageClient() {
  return new S3Client({
    endpoint: process.env.ATTACHMENT_S3_ENDPOINT,
    region: process.env.ATTACHMENT_S3_REGION,
    credentials: {
      accessKeyId: process.env.ATTACHMENT_S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.ATTACHMENT_S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  });
}
