import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import {
  E2E_PASSWORD,
  E2E_PERSON_IDS,
  getE2eClient,
} from "./fixture";

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

test("identity and applicant scope protect the application workspace", async ({ browser }) => {
  const noRole = await pageFor(browser, "e2e-zero-role", /\/no-access$/);
  await noRole.goto("/workspace/applications");
  await expect(noRole).toHaveURL(/\/no-access$/);
  await noRole.context().close();

  const applicant = await pageFor(browser, "e2e-key-sub-i");
  const projectId = await createAndSave(applicant, "虚构范围隔离项目");
  const other = await pageFor(browser, "e2e-second-key-sub-i");
  await other.goto(`/workspace/applications/${projectId}`);
  await expect(other.getByRole("heading", { name: "页面不存在" })).toBeVisible();
  await applicant.context().close();
  await other.context().close();
});

test("an OTHER application value becomes a reviewable dictionary candidate", async ({ browser }) => {
  const applicant = await pageFor(browser, "e2e-key-sub-i");
  await createAndSave(applicant, "虚构其它字典候选项目");
  await applicant.getByLabel("项目方向").selectOption({ label: "其它" });
  await applicant.locator('input[name="directionOtherText"]').fill("虚构神经免疫方向");
  await save(applicant);
  await submit(applicant);

  const pmo = await pageFor(browser, "e2e-pmo");
  await pmo.goto("/workspace/pmo/dictionaries?dictionary=DISEASE_AREA");
  const candidate = pmo.locator("article").filter({ hasText: "虚构神经免疫方向" });
  await expect(candidate).toBeVisible();
  await candidate.getByRole("button", { name: "提升为正式选项" }).click();
  await expect(pmo).toHaveURL(/saved=reviewed/u);
  await expect(pmo.getByText("修改已保存并重新读取服务端状态。")).toBeVisible();
  await expect(candidate).toHaveCount(0);
  await expect(pmo.getByRole("row", { name: /虚构神经免疫方向/u })).toBeVisible();

  await applicant.context().close();
  await pmo.context().close();
});

test("return, resubmit, hold, resume, and atomic establishment work over HTTPS", async ({ browser }) => {
  const applicant = await pageFor(browser, "e2e-key-sub-i");
  const projectId = await createAndSave(applicant, "虚构 HTTPS 原子建档项目", {
    primaryOwner: "虚拟 E2E 拟任负责人",
    additionalOwner: "虚拟 E2E 第二申请人",
  });
  await submit(applicant);

  const otherProposed = await pageFor(browser, "e2e-second-key-sub-i");
  await otherProposed.goto(`/workspace/applications/${projectId}`);
  await expect(otherProposed.getByRole("heading", { name: "页面不存在" })).toBeVisible();

  const pmo = await pageFor(browser, "e2e-pmo");
  await pmo.goto(`/workspace/pmo/project-applications/${projectId}`);
  await expect(pmo.getByText("冻结申请版本 v1")).toBeVisible();
  await expect(pmo.getByText("2026-09-01 至 2026-09-30")).toBeVisible();
  await expect(pmo.getByText("2026-09-02 至 2026-09-20")).toBeVisible();
  await expect(pmo.getByLabel("项目名称")).toHaveCount(0);
  await pmo.getByLabel("退回修改说明（必填）").fill("虚构退回补充要求");
  await performPmoAction(pmo, "退回修改", "return", "RETURNED_FOR_REVISION");

  await applicant.goto(new URL(applicant.url()).pathname);
  await expect(applicant.getByText("RETURNED_FOR_REVISION")).toBeVisible();
  await applicant.getByLabel("项目简介").fill("虚构项目级说明，已按退回要求补充。");
  await submit(applicant);

  await pmo.reload();
  await expect(pmo.getByText("冻结申请版本 v2")).toBeVisible();
  await expect(pmo.getByText("虚构项目级说明，已按退回要求补充。")).toBeVisible();
  await pmo.getByLabel("暂缓审核说明（必填）").fill("虚构治理确认中");
  await performPmoAction(pmo, "暂缓审核", "hold", "ON_HOLD");
  await performPmoAction(
    pmo,
    "恢复审核",
    "resume",
    "PENDING_ESTABLISHMENT_REVIEW",
  );
  await performPmoAction(pmo, "批准并建档", "approve", "ACTIVE");
  await expect(pmo.getByText(/^DEMO-\d{3,}$/u)).toBeVisible();

  await applicant.reload();
  await expect(applicant.getByText("ACTIVE")).toBeVisible();
  const applicantAccess = await applicant.request.get(`/api/projects/${projectId}/access`);
  expect(applicantAccess.status()).toBe(404);

  const primary = await pageFor(browser, "e2e-proposed-primary");
  const primaryAccess = await primary.request.get(`/api/projects/${projectId}/access`);
  expect(primaryAccess.status()).toBe(200);
  const proposedAccess = await otherProposed.request.get(`/api/projects/${projectId}/access`);
  expect(proposedAccess.status()).toBe(404);

  const client = getE2eClient();
  expect(await client.projectPlan.count({ where: { projectId } })).toBe(1);
  expect(await client.roleAssignment.count({
    where: { projectId, roleCode: "KEY_SUB_I", assignmentStatus: "ACTIVE" },
  })).toBe(1);
  expect(await client.notification.count({
    where: {
      projectId,
      eventCode: "PROJECT_APPLICATION_APPROVED",
      recipientPersonId: { in: [E2E_PERSON_IDS.key, E2E_PERSON_IDS.proposedPrimary] },
    },
  })).toBe(2);
  await client.$disconnect();

  for (const width of [320, 375, 390]) {
    await applicant.setViewportSize({ width, height: 844 });
    await expectNoHorizontalOverflow(applicant);
    await pmo.setViewportSize({ width, height: 844 });
    await expectNoHorizontalOverflow(pmo);
  }

  await applicant.context().close();
  await otherProposed.context().close();
  await pmo.context().close();
  await primary.context().close();
});

test("reject and every pre-establishment withdrawal state remain terminal", async ({ browser }) => {
  const applicant = await pageFor(browser, "e2e-key-sub-i");
  const pmo = await pageFor(browser, "e2e-pmo");

  const rejectedId = await createAndSave(applicant, "虚构 Web 最终拒绝项目");
  await submit(applicant);
  await pmo.goto(`/workspace/pmo/project-applications/${rejectedId}`);
  await pmo.getByLabel("拒绝原因").fill("虚构最终拒绝原因");
  await pmo.getByLabel("我确认拒绝后申请不可恢复").check();
  await performPmoAction(pmo, "最终拒绝", "reject", "REJECTED");

  await withdrawInState(applicant, pmo, "DRAFT", "虚构草稿撤回项目");
  await withdrawInState(applicant, pmo, "PENDING", "虚构待审撤回项目");
  await withdrawInState(applicant, pmo, "RETURNED", "虚构退回撤回项目");
  await withdrawInState(applicant, pmo, "ON_HOLD", "虚构暂缓撤回项目");

  await applicant.context().close();
  await pmo.context().close();
});

test("normalized duplicate names and concurrent PMO decisions return real conflicts", async ({ browser }) => {
  const first = await pageFor(browser, "e2e-key-sub-i");
  await createAndSave(first, "虚构 Web 同名  并发项目");
  await submit(first);

  const second = await pageFor(browser, "e2e-second-key-sub-i");
  await createAndSave(second, "虚构 Web 同名 并发项目");
  await second.getByRole("button", { name: "提交审核" }).click();
  await second.waitForURL((url) =>
    url.searchParams.has("submitted") || url.searchParams.has("error"),
  );
  expect(new URL(second.url()).searchParams.get("error")).toBe(
    "PROJECT_APPLICATION_DUPLICATE_NAME",
  );
  await expect(
    second.getByText("该项目名称已被占用，请修改名称。", { exact: true }),
  ).toBeVisible();

  const conflictId = await createAndSave(first, "虚构 Web PMO 并发项目");
  await submit(first);
  const firstPmo = await pageFor(browser, "e2e-pmo");
  const secondPmo = await pageFor(browser, "e2e-second-pmo");
  await Promise.all([
    firstPmo.goto(`/workspace/pmo/project-applications/${conflictId}`),
    secondPmo.goto(`/workspace/pmo/project-applications/${conflictId}`),
  ]);
  const decisionNavigations = [firstPmo, secondPmo].map((page) =>
    page.waitForURL((url) =>
      url.searchParams.get("completed") === "approve" ||
      url.searchParams.has("error"),
    ),
  );
  await Promise.all([
    ...decisionNavigations,
    firstPmo.getByRole("button", { name: "批准并建档" }).click(),
    secondPmo.getByRole("button", { name: "批准并建档" }).click(),
  ]);
  const decisionErrors = [firstPmo, secondPmo].map((page) =>
    new URL(page.url()).searchParams.get("error"),
  );
  expect(decisionErrors.filter(Boolean)).toEqual([
    "PROJECT_APPLICATION_CONFLICT",
  ]);
  const conflictFeedback = [firstPmo, secondPmo].map((page) =>
    page.getByText("数据已被其他操作更新，请刷新后重试。", { exact: true }),
  );
  expect(
    (await conflictFeedback[0].count()) + (await conflictFeedback[1].count()),
  ).toBe(1);
  const client = getE2eClient();
  expect(await client.projectPlan.count({ where: { projectId: conflictId } })).toBe(1);
  await client.$disconnect();

  for (const page of [first, second, firstPmo, secondPmo]) {
    await page.context().close();
  }
});

async function pageFor(
  browser: Browser,
  loginName: string,
  expectedUrl: RegExp = /\/workspace\/projects$/,
) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("登录名").fill(loginName);
  await page.getByLabel("密码").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(expectedUrl, { timeout: 60_000 });
  return page;
}

async function createAndSave(
  page: Page,
  projectName: string,
  options?: { primaryOwner?: string; additionalOwner?: string },
) {
  await page.goto("/workspace/applications/new");
  await page.getByLabel("项目名称").fill(projectName);
  await page.getByRole("button", { name: "保存草稿" }).click();
  await page.waitForURL((url) => url.pathname === "/workspace/projects" && url.hash === "#applications", { timeout: 30_000 });
  const card = page.locator("article").filter({ hasText: projectName });
  const continueLink = card.getByRole("link", { name: "继续编辑" });
  const detailHref = await continueLink.getAttribute("href");
  const projectId = new URL(detailHref!, page.url()).pathname.split("/").at(-1)!;
  await continueLink.click();
  await page.getByLabel("工作流方案").selectOption({
    label: "虚拟 E2E 项目生命周期",
  });
  await page.getByRole("button", { name: "查看或修改泳道" }).click();
  const swimlaneDialog = page.getByRole("dialog", { name: "修改申请泳道" });
  await swimlaneDialog.getByRole("button", { name: "启动阶段", exact: true }).click();
  const stageDialog = page.getByRole("dialog").filter({ hasText: "阶段详情" });
  await stageDialog.getByLabel("计划开始").fill("2026-09-01");
  await stageDialog.getByLabel("计划结束").fill("2026-09-30");
  await stageDialog.getByRole("button", { name: "关闭", exact: true }).click();
  await swimlaneDialog.getByRole("button", { name: /^完成准备/u }).click();
  const nodeDialog = page.getByRole("dialog").filter({ hasText: "节点详情" });
  await nodeDialog.getByLabel("计划开始").fill("2026-09-02");
  await nodeDialog.getByLabel("计划结束").fill("2026-09-20");
  await nodeDialog.getByRole("button", { name: "关闭", exact: true }).click();
  await Promise.all([
    page.waitForEvent("framenavigated"),
    swimlaneDialog.getByRole("button", { name: "保存泳道修改" }).click(),
  ]);
  await page.waitForLoadState("domcontentloaded");
  await page.getByLabel("项目简介").fill("虚构项目级 E2E 说明，不含个体明细。");
  await page.getByLabel("项目方向").selectOption({ label: "虚拟选项" });
  await page.getByLabel("研究类型").selectOption({ label: "虚拟选项" });
  await page.getByLabel("拟任主 Key Sub-I").selectOption({
    label: options?.primaryOwner ?? "虚拟 E2E Key Sub-I",
  });
  if (options?.additionalOwner) {
    await page.getByLabel(options.additionalOwner, { exact: true }).check();
  }
  await save(page);
  return projectId;
}

async function submit(page: Page) {
  const projectName = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
  await page.getByRole("button", { name: "提交审核" }).click();
  await page.waitForURL((url) =>
    (url.pathname === "/workspace/projects" && url.hash === "#applications") || url.searchParams.has("error"),
  );
  expect(new URL(page.url()).searchParams.get("error")).toBeNull();
  const card = page.locator("article").filter({ hasText: projectName });
  await expect(card).toContainText("待 PMO 审核");
  await card.getByRole("link", { name: "查看申请" }).click();
  await expect(page.getByText("PENDING_ESTABLISHMENT_REVIEW")).toBeVisible();
}

async function save(page: Page) {
  const projectName = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
  const rowVersion = page.locator('input[name="expectedRowVersion"]').first();
  const previous = await rowVersion.inputValue();
  await page.getByRole("button", { name: "保存草稿" }).click();
  await page.waitForURL((url) => url.pathname === "/workspace/projects" && url.hash === "#applications");
  await page.locator("article").filter({ hasText: projectName }).getByRole("link", { name: "继续编辑" }).click();
  await expect(page.locator('input[name="expectedRowVersion"]').first()).not.toHaveValue(previous);
}

async function withdrawInState(
  applicant: Page,
  pmo: Page,
  state: "DRAFT" | "PENDING" | "RETURNED" | "ON_HOLD",
  name: string,
) {
  const projectId = await createAndSave(applicant, name);
  if (state !== "DRAFT") await submit(applicant);
  if (state === "RETURNED") {
    await pmo.goto(`/workspace/pmo/project-applications/${projectId}`);
    await pmo.getByLabel("退回修改说明（必填）").fill("虚构退回后撤回");
    await performPmoAction(pmo, "退回修改", "return", "RETURNED_FOR_REVISION");
    await applicant.reload();
  }
  if (state === "ON_HOLD") {
    await pmo.goto(`/workspace/pmo/project-applications/${projectId}`);
    await pmo.getByLabel("暂缓审核说明（必填）").fill("虚构暂缓后撤回");
    await performPmoAction(pmo, "暂缓审核", "hold", "ON_HOLD");
    await applicant.reload();
  }
  await applicant.getByRole("button", { name: "撤回申请", exact: true }).click();
  const withdrawDialog = applicant.getByRole("dialog", { name: "撤回申请" });
  if (state !== "DRAFT") {
    await withdrawDialog.getByLabel("撤回原因（必填）").fill("虚构申请人主动撤回");
  }
  const withdrawButton = withdrawDialog.getByRole("button", { name: "确认撤回" });
  await expectActionIdentityCurrent(applicant, withdrawButton);
  await withdrawButton.click();
  await applicant.waitForURL((url) =>
    (url.pathname === "/workspace/projects" && url.hash === "#applications") || url.searchParams.has("error"),
  );
  expect(new URL(applicant.url()).searchParams.get("error")).toBeNull();
  await applicant.goto(`/workspace/applications/${projectId}`);
  await expect(applicant.getByText("CANCELLED")).toBeVisible();
}

async function performPmoAction(
  page: Page,
  buttonName: string,
  completedAction: string,
  expectedStatus: string,
) {
  const button = page.getByRole("button", { name: buttonName });
  const form = button.locator("xpath=ancestor::form");
  const previousRowVersion = await form
    .locator('input[name="expectedRowVersion"]')
    .inputValue();
  await button.click();
  await page.waitForURL((url) =>
    url.searchParams.get("completed") === completedAction ||
    url.searchParams.has("error"),
  );
  expect(new URL(page.url()).searchParams.get("error")).toBeNull();
  await expect(page.getByText(expectedStatus)).toBeVisible();

  const currentRowVersions = page.locator('input[name="expectedRowVersion"]');
  if (await currentRowVersions.count()) {
    await expect(currentRowVersions.first()).not.toHaveValue(previousRowVersion);
  }
}

async function expectActionIdentityCurrent(page: Page, button: Locator) {
  const form = button.locator("xpath=ancestor::form");
  const projectId = new URL(page.url()).pathname.split("/").at(-1)!;
  const client = getE2eClient();
  const project = await client.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      rowVersion: true,
      currentApplicationVersionId: true,
      establishmentReviews: {
        orderBy: { submissionNo: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
  await client.$disconnect();
  await expect(form.locator('input[name="expectedRowVersion"]')).toHaveValue(
    String(project.rowVersion),
  );
  await expect(form.locator('input[name="applicationVersionId"]')).toHaveValue(
    project.currentApplicationVersionId!,
  );
  await expect(form.locator('input[name="reviewId"]')).toHaveValue(
    project.establishmentReviews[0]?.id ?? "",
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    return {
      clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          text: element.textContent?.trim().slice(0, 60) ?? "",
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        }))
        .filter((element) => element.right > clientWidth + 1 || element.left < -1)
        .slice(0, 8),
    };
  });
  expect(dimensions.scrollWidth, JSON.stringify(dimensions.offenders)).toBeLessThanOrEqual(dimensions.clientWidth);
}
