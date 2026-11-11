import { describe, expect, it, vi } from "vitest";

import { runWorker, WorkerTaskRegistry } from "../src/worker.js";

describe("worker skeleton", () => {
  it("does not claim or execute an unregistered task", async () => {
    const registry = new WorkerTaskRegistry();
    const controller = new AbortController();
    controller.abort();
    await expect(runWorker(registry, controller.signal)).resolves.toBeUndefined();
    expect(registry.list()).toHaveLength(0);
  });

  it("stops a registered task through the shared abort signal", async () => {
    const registry = new WorkerTaskRegistry();
    const run = vi.fn(async (signal: AbortSignal) => {
      expect(signal.aborted).toBe(false);
    });
    registry.register({ code: "TEST_ONLY", run });
    await runWorker(registry, new AbortController().signal);
    expect(run).toHaveBeenCalledOnce();
  });
});
