import { spawn } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:https";
import { resolve } from "node:path";

const externalPort = requiredPort("E2E_PORT");
const internalPort = externalPort + 1;
const key = readFileSync(requiredEnvironment("E2E_HTTPS_KEY_PATH"));
const cert = readFileSync(requiredEnvironment("E2E_HTTPS_CERT_PATH"));
const appDirectory = resolve(process.cwd(), "apps/web");
const standaloneDirectory = resolve(appDirectory, ".next/standalone/apps/web");
const standaloneServer = resolve(standaloneDirectory, "server.js");
prepareStandaloneAssets();
let stopping = false;

const application = spawn(process.execPath, [standaloneServer], {
  cwd: standaloneDirectory,
  env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(internalPort) },
  stdio: "inherit",
  windowsHide: true,
});
application.once("exit", (code, signal) => {
  if (!stopping) {
    console.error(`E2E production application exited early (code=${code}, signal=${signal})`);
    process.exit(code ?? 1);
  }
});

const proxy = createServer({ key, cert }, (incoming, outgoing) => {
  const proxied = httpRequest({
    hostname: "127.0.0.1",
    port: internalPort,
    method: incoming.method,
    path: incoming.url,
    headers: {
      ...incoming.headers,
      host: `127.0.0.1:${externalPort}`,
      "x-forwarded-host": `127.0.0.1:${externalPort}`,
      "x-forwarded-proto": "https",
    },
  }, (response) => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  proxied.on("error", (error) => {
    if (!outgoing.headersSent) outgoing.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    outgoing.end(`E2E upstream unavailable: ${error.code ?? "UNKNOWN"}`);
  });
  incoming.pipe(proxied);
});

proxy.listen(externalPort, "127.0.0.1", () => {
  console.log(`E2E_HTTPS_PROXY_READY https://127.0.0.1:${externalPort} -> http://127.0.0.1:${internalPort}`);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(signal));

function stop(signal) {
  if (stopping) return;
  stopping = true;
  proxy.close(() => process.exit(0));
  application.kill(signal);
  setTimeout(() => process.exit(0), 5_000).unref();
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredPort(name) {
  const value = Number(requiredEnvironment(name));
  if (!Number.isInteger(value) || value < 1024 || value > 65_534) throw new Error(`${name} is invalid`);
  return value;
}

function prepareStandaloneAssets() {
  if (!existsSync(standaloneServer)) throw new Error("E2E production build is missing the standalone server");
  copyDirectory(resolve(appDirectory, ".next/static"), resolve(standaloneDirectory, ".next/static"));
  const publicDirectory = resolve(appDirectory, "public");
  if (existsSync(publicDirectory)) copyDirectory(publicDirectory, resolve(standaloneDirectory, "public"));
}

function copyDirectory(source, destination) {
  if (!existsSync(source)) throw new Error(`E2E production asset directory is missing: ${source}`);
  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true });
}
