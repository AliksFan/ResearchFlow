import {
  AttachmentService,
  FileTypeAttachmentContentInspector,
  S3PrivateObjectStorage,
} from "@researchflow/attachments";
import { createPrismaClient, PrismaAttachmentRepository, PrismaNotificationWorkerService, PrismaWorkerHeartbeatRepository } from "@researchflow/db";

import { AttachmentCleanupTask } from "./attachment-cleanup-task.js";
import { CaptureEmailTransport } from "./capture-email-transport.js";
import { OutboxDeliveryTask } from "./outbox-delivery-task.js";
import { ReminderTask } from "./reminder-task.js";
import { runWorker, WorkerTaskRegistry } from "./worker.js";
import { WorkerHeartbeatTask } from "./worker-heartbeat-task.js";

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => controller.abort());
}

const registry = new WorkerTaskRegistry();
let disconnect: (() => Promise<void>) | undefined;
const workerId = process.env.WORKER_ID?.trim() || `worker-${process.pid}`;
const databaseEnabled = process.env.ATTACHMENT_CLEANUP_ENABLED === "1" || process.env.NOTIFICATION_WORKER_ENABLED === "1";
const client = databaseEnabled ? createPrismaClient(requiredEnvironment("DATABASE_URL")) : null;
if (process.env.ATTACHMENT_CLEANUP_ENABLED === "1") {
  if (!client) throw new Error("DATABASE_CLIENT_REQUIRED");
  const storage = new S3PrivateObjectStorage({
    endpoint: requiredEnvironment("ATTACHMENT_S3_ENDPOINT"),
    region: requiredEnvironment("ATTACHMENT_S3_REGION"),
    bucket: requiredEnvironment("ATTACHMENT_S3_BUCKET"),
    accessKeyId: requiredEnvironment("ATTACHMENT_S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnvironment("ATTACHMENT_S3_SECRET_ACCESS_KEY"),
  });
  const service = new AttachmentService(
    new PrismaAttachmentRepository(client),
    storage,
    new FileTypeAttachmentContentInspector(storage),
  );
  registry.register(new AttachmentCleanupTask(service, { workerId }));
}
if (process.env.NOTIFICATION_WORKER_ENABLED === "1") {
  if (!client) throw new Error("DATABASE_CLIENT_REQUIRED");
  if (process.env.NOTIFICATION_TRANSPORT !== "capture") throw new Error("NOTIFICATION_CAPTURE_TRANSPORT_REQUIRED");
  const service = new PrismaNotificationWorkerService(
    client,
    new CaptureEmailTransport(),
    requiredEnvironment("PUBLIC_BASE_URL"),
  );
  registry.register(new ReminderTask(service, { workerId }));
  registry.register(new OutboxDeliveryTask(service, { workerId }));
}
if (client && process.env.WORKER_HEARTBEAT_ENABLED !== "0") {
  const enabledTaskCodes = registry.list().map((task) => task.code);
  registry.register(new WorkerHeartbeatTask(
    new PrismaWorkerHeartbeatRepository(client),
    {
      workerId,
      enabledTaskCodes,
      intervalMs: optionalPositiveInteger("WORKER_HEARTBEAT_INTERVAL_MS") ?? 30_000,
    },
  ));
}
if (client) disconnect = async () => await client.$disconnect();

try {
  await runWorker(registry, controller.signal);
} finally {
  await disconnect?.();
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function optionalPositiveInteger(name: string): number | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name}_INVALID`);
  return parsed;
}
