import { defineConfig } from "@playwright/test";

const httpsCertificateArguments =
  process.env.E2E_HTTPS_KEY_PATH && process.env.E2E_HTTPS_CERT_PATH
    ? ` --experimental-https-key "${process.env.E2E_HTTPS_KEY_PATH}" --experimental-https-cert "${process.env.E2E_HTTPS_CERT_PATH}"`
    : "";
const httpsCertificateAuthorityArgument = process.env.E2E_HTTPS_CA_PATH
  ? ` --experimental-https-ca "${process.env.E2E_HTTPS_CA_PATH}"`
  : "";
const e2ePort = process.env.E2E_PORT?.trim() || "3443";
if (!/^\d{4,5}$/u.test(e2ePort)) throw new Error("E2E_PORT must be a four or five digit port");
const e2eScheme = process.env.E2E_SCHEME?.trim() || "https";
if (!/^(?:http|https)$/u.test(e2eScheme)) throw new Error("E2E_SCHEME must be http or https");
const e2eBaseUrl = `${e2eScheme}://127.0.0.1:${e2ePort}`;
const e2eWebMode = process.env.E2E_WEB_MODE?.trim() || "development";
if (!/^(?:development|production|production-https)$/u.test(e2eWebMode)) throw new Error("E2E_WEB_MODE must be development, production, or production-https");
const webServerCommand = e2eWebMode === "production-https"
  ? "node scripts/e2e-https-production.mjs"
  : e2eWebMode === "production"
    ? `pnpm --filter @researchflow/web start --hostname 127.0.0.1 --port ${e2ePort}`
  : `pnpm --filter @researchflow/web dev:https --hostname 127.0.0.1 --port ${e2ePort}${httpsCertificateArguments}${httpsCertificateAuthorityArgument}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: e2eBaseUrl,
    ignoreHTTPSErrors: true,
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : undefined,
    trace: "retain-on-failure",
  },
  webServer: {
    command: webServerCommand,
    url: `${e2eBaseUrl}/api/health`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
