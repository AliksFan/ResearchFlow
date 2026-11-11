import { describe, expect, it, vi } from "vitest";

import { OutboxDeliveryTask } from "../src/outbox-delivery-task.js";

describe("OutboxDeliveryTask", () => {
  it("uses a stable worker lease and stops after a bounded batch", async () => {
    const controller = new AbortController();
    const deliverClaimedBatch = vi.fn(async (input: { workerId: string; limit: number; leaseMs: number }) => {
      expect(input.workerId).toBe("worker-a");
      expect(input.limit).toBe(25);
      expect(input.leaseMs).toBe(30_000);
      controller.abort();
    });
    await new OutboxDeliveryTask(
      { deliverClaimedBatch },
      { workerId: "worker-a", batchSize: 25, leaseMs: 30_000, intervalMs: 1 },
    ).run(controller.signal);
    expect(deliverClaimedBatch).toHaveBeenCalledOnce();
  });

  it("does not claim work after graceful shutdown starts", async () => {
    const deliverClaimedBatch = vi.fn(async () => undefined);
    const controller = new AbortController();
    controller.abort();
    await new OutboxDeliveryTask({ deliverClaimedBatch }, { workerId: "worker-a" }).run(controller.signal);
    expect(deliverClaimedBatch).not.toHaveBeenCalled();
  });
});
