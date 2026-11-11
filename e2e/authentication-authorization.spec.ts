import { expect, test, type Page } from "@playwright/test";

import {
  E2E_PASSWORD,
  E2E_PERSON_IDS,
  E2E_PROJECT_IDS,
  getE2eClient,
} from "./fixture";

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

test("rejects cross-origin Auth.js state changes and unauthenticated APIs", async ({ request }) => {
  const crossOrigin = await request.post("/api/auth/callback/credentials", {
    headers: { origin: "https://attacker.example.invalid" },
    form: { loginName: "e2e-pmo", password: E2E_PASSWORD },
  });
  expect(crossOrigin.status()).toBe(403);
  const unauthenticated = await request.get("/api/admin/access");
  expect(unauthenticated.status()).toBe(401);
});

for (const [loginName, roleCode, roleLabel] of [
  ["e2e-pmo", "PMO", "PMO"],
  ["e2e-dean", "DEAN", "院长"],
  ["e2e-key-sub-i", "KEY_SUB_I", "Key Sub-I"],
] as const) {
  test(`${roleCode} single-role login enters its authoritative workspace`, async ({ browser }) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await login(page, loginName);
    await expect(page).toHaveURL(/\/workspace\/projects$/);
    const banner = page.getByRole("banner");
    await expect(banner.getByText("当前角色", { exact: true })).toBeVisible();
    await expect(banner.getByText(roleLabel, { exact: true }).first()).toBeVisible();
    const cookies = await context.cookies();
    const sessionCookie = cookies.find(({ name }) => name === "__Host-researchflow.session-token");
    expect(sessionCookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax" });
    await context.close();
  });
}

for (const [loginName, roleCode] of [
  ["e2e-crc", "CRC"],
  ["e2e-statistician", "STATISTICIAN"],
  ["e2e-collaboration-lead", "COLLABORATION_LEAD"],
] as const) {
  test(`${roleCode} single-role login keeps its restricted integration role`, async ({ browser }) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await login(page, loginName);
    await expect(page).toHaveURL(/\/no-access$/);
    await expect(page.getByRole("heading", { name: "当前角色暂无工作区" })).toBeVisible();
    await expect(page.getByText(`当前角色：${roleCode}`, { exact: true })).toBeVisible();
    const cookies = await context.cookies();
    const sessionCookie = cookies.find(({ name }) => name === "__Host-researchflow.session-token");
    expect(sessionCookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax" });
    await context.close();
  });
}

test("multi-role and zero-role accounts follow separate entry states", async ({ browser }) => {
  const multi = await browser.newContext({ ignoreHTTPSErrors: true });
  const multiPage = await multi.newPage();
  await login(multiPage, "e2e-multi-role");
  await expect(multiPage).toHaveURL(/\/select-role$/);
  await expect(multiPage.getByRole("heading", { name: "选择本次使用的角色" })).toBeVisible();
  await multi.close();

  const zero = await browser.newContext({ ignoreHTTPSErrors: true });
  const zeroPage = await zero.newPage();
  await login(zeroPage, "e2e-zero-role");
  await expect(zeroPage).toHaveURL(/\/no-access$/);
  await expect(zeroPage.getByRole("heading", { name: "暂无可用角色" })).toBeVisible();
  await zero.close();
});

test("the seeded forced-change account cannot enter a role workspace first", async ({ page }) => {
  await login(page, "e2e-forced-pmo");
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(page.getByRole("heading", { name: "修改密码" })).toBeVisible();
});

test("project scope is returned as 404 while valid scope is allowed", async ({ page }) => {
  await login(page, "e2e-key-sub-i");
  const allowed = await page.request.get(`/api/projects/${E2E_PROJECT_IDS[0]}/access`);
  expect(allowed.status()).toBe(200);
  const hidden = await page.request.get(`/api/projects/${E2E_PROJECT_IDS[1]}/access`);
  expect(hidden.status()).toBe(404);
});

test("non-PMO receives 403 from both the management page and API", async ({ page }) => {
  await login(page, "e2e-dean");
  const api = await page.request.get("/api/admin/access");
  expect(api.status()).toBe(403);
  await page.goto("/admin/access");
  await expect(page).toHaveURL(/\/forbidden$/);
});

test("PMO creates an invited account and sees an activation link only once", async ({ page }) => {
  await login(page, "e2e-pmo");
  await page.goto("/admin/access");
  await page.getByRole("button", { name: "新建账号" }).click();
  const createDialog = page.getByRole("dialog", { name: "新建账号" });
  await createDialog.getByLabel("显示名称").fill("虚拟 E2E 新受邀用户");
  await createDialog.getByLabel("登录名").fill("e2e-created-invitee");
  await createDialog.getByRole("button", { name: "创建账号" }).click();
  await expect(createDialog.getByText("受邀账号已创建")).toBeVisible();
  await createDialog.getByRole("button", { name: "关闭", exact: true }).click();

  const accountRow = page.getByRole("row", { name: /虚拟 E2E 新受邀用户.*e2e-created-invitee/u });
  await accountRow.getByRole("button", { name: "管理" }).click();
  const manageDialog = page.getByRole("dialog", { name: "管理账号 · 虚拟 E2E 新受邀用户" });
  await manageDialog.getByRole("tab", { name: "账号安全" }).click();
  await manageDialog.getByRole("button", { name: "生成一次性链接" }).click();
  const linkField = manageDialog.getByRole("textbox", { name: "一次性链接" });
  await expect(linkField).toBeVisible();
  const oneTimeLink = await linkField.inputValue();
  expect(oneTimeLink).toContain("/activate#token=");
  const rawToken = decodeURIComponent(oneTimeLink.split("#token=")[1]);

  const client = getE2eClient();
  const stored = await client.authCredentialToken.findFirstOrThrow({
    where: { person: { loginName: "e2e-created-invitee" } },
    select: { tokenHash: true },
  });
  expect(stored.tokenHash).not.toBe(rawToken);
  await client.$disconnect();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "一次性链接" })).toHaveCount(0);
});

test("PMO sees actionable account validation and duplicate-login messages", async ({ page }) => {
  await login(page, "e2e-pmo");
  await page.goto("/admin/access");
  await page.getByRole("button", { name: "新建账号" }).click();
  const createDialog = page.getByRole("dialog", { name: "新建账号" });

  await createDialog.getByLabel("显示名称").fill("虚构错误账号");
  await createDialog.getByLabel("登录名").fill("INVALID LOGIN");
  const createButton = createDialog.getByRole("button", { name: "创建账号" });
  await createButton.click();
  await expect(createDialog.getByText("登录名需为 3–50 位", { exact: false })).toBeVisible();
  await createDialog.getByRole("button", { name: "关闭", exact: true }).click();

  await page.getByRole("button", { name: "新建账号" }).click();
  const duplicateDialog = page.getByRole("dialog", { name: "新建账号" });
  await duplicateDialog.getByLabel("显示名称").fill("虚构重复账号");
  await duplicateDialog.getByLabel("登录名").fill("e2e-pmo");
  await duplicateDialog.getByRole("button", { name: "创建账号" }).click();
  await expect(duplicateDialog.getByText("该登录名已存在", { exact: false })).toBeVisible();
});

test("database revocation immediately invalidates an existing encrypted cookie", async ({ page }) => {
  await login(page, "e2e-pmo");
  const client = getE2eClient();
  const session = await client.session.findFirstOrThrow({
    where: { personId: E2E_PERSON_IDS.pmo, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  await client.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  await client.$disconnect();
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/login$/);
});

async function login(page: Page, loginName: string) {
  await page.goto("/login");
  await page.getByLabel("登录名").fill(loginName);
  await page.getByLabel("密码").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/(workspace|select-role|no-access|change-password)$/);
}
