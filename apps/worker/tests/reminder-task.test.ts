import { describe, expect, it, vi } from "vitest";

import { ReminderTask } from "../src/reminder-task.js";

describe("ReminderTask", () => {
  it("passes the scheduler occurrence to the idempotent reminder service", async () => {
    const controller = new AbortController();
    const scheduledFor = new Date("2026-08-26T01:00:00.000Z");
    const runScheduledReminder = vi.fn(async () => controller.abort());
    await new ReminderTask(
      { runScheduledReminder },
      { workerId: "worker-a", leaseMs: 30_000, now: () => scheduledFor, intervalMs: 1 },
    ).run(controller.signal);
    expect(runScheduledReminder).toHaveBeenCalledWith(scheduledFor, "worker-a", 30_000);
  });

  it("keeps running after a persisted reminder attempt fails", async () => {
    const controller = new AbortController();
    const runScheduledReminder = vi.fn()
      .mockRejectedValueOnce(new Error("captured reminder failure"))
      .mockImplementationOnce(async () => controller.abort());
    await new ReminderTask(
      { runScheduledReminder },
      { workerId: "worker-retry", leaseMs: 30_000, intervalMs: 1 },
    ).run(controller.signal);
    expect(runScheduledReminder).toHaveBeenCalledTimes(2);
  });
});
