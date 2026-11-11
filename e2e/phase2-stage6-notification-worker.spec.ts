import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { PrismaNotificationWorkerService, type NotificationEmail, type NotificationEmailTransport } from "@researchflow/db";

import { E2E_PERSON_IDS, E2E_PROJECT_IDS, getE2eClient } from "./fixture";

test.describe.configure({ mode: "serial" });

test("Outbox leases once across workers, skips missing email, alarms final failure, and recovers reminder lease", async () => {
  const client = getE2eClient();
  const sent: NotificationEmail[] = [];
  const capture: NotificationEmailTransport = { send: async (message) => { sent.push(message); return { providerMessageId: `capture-${sent.length}` }; } };
  const baseUrl = process.env.PUBLIC_BASE_URL || "https://127.0.0.1:3443";
  await client.person.update({ where: { id: E2E_PERSON_IDS.pmo }, data: { workEmail: "pmo@example.invalid" } });

  const delivery = await createOutbox(client, E2E_PERSON_IDS.pmo, "PMO", "STAGE6_CAPTURE_DELIVERY", 5);
  const first = new PrismaNotificationWorkerService(client, capture, baseUrl);
  const second = new PrismaNotificationWorkerService(client, capture, baseUrl);
  await Promise.all([
    first.deliverClaimedBatch({ workerId: "e2e-worker-a", limit: 10, leaseMs: 30_000 }),
    second.deliverClaimedBatch({ workerId: "e2e-worker-b", limit: 10, leaseMs: 30_000 }),
  ]);
  expect(sent).toHaveLength(1);
  await expect(client.notificationOutbox.findUniqueOrThrow({ where: { id: delivery.outboxId }, select: { status: true, attemptCount: true } })).resolves.toEqual({ status: "SENT", attemptCount: 1 });

  const missing = await createOutbox(client, E2E_PERSON_IDS.secondPmo, "PMO", "STAGE6_MISSING_EMAIL", 5);
  await first.deliverClaimedBatch({ workerId: "e2e-worker-a", limit: 10, leaseMs: 30_000 });
  await expect(client.notificationOutbox.findUniqueOrThrow({ where: { id: missing.outboxId }, select: { status: true, lastErrorCode: true } })).resolves.toEqual({ status: "SKIPPED_NO_ADDRESS", lastErrorCode: "RECIPIENT_EMAIL_MISSING" });

  const failing = await createOutbox(client, E2E_PERSON_IDS.pmo, "PMO", "STAGE6_FINAL_FAILURE", 1);
  const failureTransport: NotificationEmailTransport = { send: async () => { throw Object.assign(new Error("captured failure"), { code: "CAPTURED_DELIVERY_FAILURE" }); } };
  await new PrismaNotificationWorkerService(client, failureTransport, baseUrl).deliverClaimedBatch({ workerId: "e2e-worker-failure", limit: 10, leaseMs: 30_000 });
  await expect(client.notificationOutbox.findUniqueOrThrow({ where: { id: failing.outboxId }, select: { status: true, attemptCount: true, lastErrorCode: true } })).resolves.toEqual({ status: "FAILED_FINAL", attemptCount: 1, lastErrorCode: "CAPTURED_DELIVERY_FAILURE" });
  await expect(client.notification.count({ where: { eventCode: "OUTBOX_DELIVERY_FAILED_FINAL" } })).resolves.toBeGreaterThan(0);
  await expect(client.auditLog.count({ where: { actionCode: "OUTBOX_DELIVERY_FAILED_FINAL", entityId: failing.outboxId } })).resolves.toBe(1);

  const scheduledFor = new Date("2026-08-26T16:00:00.000Z");
  const run = await client.reminderRun.create({ data: { scheduledFor: new Date("2026-08-26T16:00:00.000Z"), status: "RUNNING", attemptCount: 1, startedAt: new Date("2026-08-26T16:00:00.000Z"), leaseOwner: "crashed-worker", leaseExpiresAt: new Date("2026-08-25T16:01:00.000Z") } });
  await first.runScheduledReminder(scheduledFor, "recovery-worker", 30_000);
  await first.runScheduledReminder(scheduledFor, "duplicate-worker", 30_000);
  await expect(client.reminderRun.findUniqueOrThrow({ where: { id: run.id }, select: { status: true, attemptCount: true, leaseOwner: true } })).resolves.toEqual({ status: "COMPLETED", attemptCount: 2, leaseOwner: null });
  await client.$disconnect();
});

async function createOutbox(client: ReturnType<typeof getE2eClient>, personId: string, roleCode: "PMO", eventCode: string, maxAttempts: number) {
  const occurrence = randomUUID();
  const notification = await client.notification.create({ data: { recipientPersonId: personId, recipientRoleCode: roleCode, notificationType: "SYSTEM_NOTICE", eventCode: "WORKFLOW_EXCEPTION_DIGEST", title: "虚拟项目提醒", content: "仅包含虚拟项目级摘要", eventKey: `${eventCode}:${occurrence}:${personId}`, messageKind: "ACTION", actionStatus: "PENDING", actionGroupKey: `stage6:${occurrence}` } });
  const recipient = await client.person.findUniqueOrThrow({ where: { id: personId }, select: { workEmail: true } });
  const outbox = await client.notificationOutbox.create({ data: { notificationId: notification.id, recipientPersonId: personId, recipientEmailSnapshot: recipient.workEmail, templateCode: "COLLABORATION_OVERDUE_V1", payload: { subject: "虚拟项目提醒", text: "仅包含虚拟项目级摘要", actionPath: `/workspace/projects/${E2E_PROJECT_IDS[0]}/execution` }, eventKey: `${eventCode}:${occurrence}:${personId}:EMAIL`, maxAttempts, nextAttemptAt: new Date() } });
  return { notificationId: notification.id, outboxId: outbox.id };
}
