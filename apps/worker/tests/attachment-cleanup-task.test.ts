import { describe, expect, it, vi } from "vitest";

import { AttachmentCleanupTask } from "../src/attachment-cleanup-task.js";

describe("AttachmentCleanupTask", () => {
  it("runs bounded cleanup batches and stops on the shared abort signal", async () => {
    const controller = new AbortController();
    const cleanupExpiredDrafts = vi.fn(async (limit: number, workerId: string, leaseMs: number) => {
      expect(limit).toBe(20);
      expect(workerId).toBe("worker-a");
      expect(leaseMs).toBe(30_000);
      controller.abort();
    });
    await new AttachmentCleanupTask({ cleanupExpiredDrafts }, { workerId: "worker-a", leaseMs: 30_000 }).run(controller.signal);
    expect(cleanupExpiredDrafts).toHaveBeenCalledOnce();
  });

  it("does not claim cleanup after shutdown", async () => {
    const cleanupExpiredDrafts = vi.fn(async () => undefined);
    const controller = new AbortController();
    controller.abort();
    await new AttachmentCleanupTask({ cleanupExpiredDrafts }).run(controller.signal);
    expect(cleanupExpiredDrafts).not.toHaveBeenCalled();
  });

  it("keeps running after a cleanup run records a failure", async () => {
    const controller = new AbortController();
    const cleanupExpiredDrafts = vi.fn()
      .mockRejectedValueOnce(new Error("captured cleanup failure"))
      .mockImplementationOnce(async () => controller.abort());
    await new AttachmentCleanupTask(
      { cleanupExpiredDrafts },
      { workerId: "worker-retry", intervalMs: 1 },
    ).run(controller.signal);
    expect(cleanupExpiredDrafts).toHaveBeenCalledTimes(2);
  });
});
