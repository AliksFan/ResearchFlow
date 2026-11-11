import { describe, expect, it, vi } from "vitest";

import { WorkerHeartbeatTask } from "../src/worker-heartbeat-task.js";

describe("WorkerHeartbeatTask", () => {
  it("records startup, running heartbeat, and stopped state", async () => {
    const controller = new AbortController();
    const observedAt = new Date("2026-09-03T08:00:00.000Z");
    const repository = {
      markStarted: vi.fn(async () => undefined),
      markRunning: vi.fn(async () => controller.abort()),
      markStopped: vi.fn(async () => undefined),
    };
    await new WorkerHeartbeatTask(repository, {
      workerId: "worker-a",
      processId: 42,
      enabledTaskCodes: ["ATTACHMENT_DRAFT_CLEANUP"],
      intervalMs: 1,
      now: () => observedAt,
    }).run(controller.signal);

    expect(repository.markStarted).toHaveBeenCalledWith({
      workerId: "worker-a",
      processId: 42,
      enabledTaskCodes: ["ATTACHMENT_DRAFT_CLEANUP"],
      observedAt,
    });
    expect(repository.markRunning).toHaveBeenCalledOnce();
    expect(repository.markStopped).toHaveBeenCalledOnce();
  });

  it("keeps the worker alive when heartbeat storage is temporarily unavailable", async () => {
    const controller = new AbortController();
    const repository = {
      markStarted: vi.fn(async () => { throw new Error("storage unavailable"); }),
      markRunning: vi.fn(async () => controller.abort()),
      markStopped: vi.fn(async () => undefined),
    };
    await new WorkerHeartbeatTask(repository, {
      workerId: "worker-retry",
      enabledTaskCodes: [],
      intervalMs: 1,
    }).run(controller.signal);
    expect(repository.markRunning).toHaveBeenCalledOnce();
  });
});
