import type { WorkerHeartbeatRepository } from "@researchflow/db";

export class WorkerHeartbeatTask {
  readonly code = "WORKER_HEARTBEAT";

  constructor(
    private readonly repository: WorkerHeartbeatRepository,
    private readonly options: {
      workerId: string;
      enabledTaskCodes: string[];
      processId?: number;
      intervalMs?: number;
      now?: () => Date;
    },
  ) {}

  async run(signal: AbortSignal): Promise<void> {
    await this.safeWrite("markStarted");
    try {
      while (!signal.aborted) {
        await this.safeWrite("markRunning");
        if (!signal.aborted) await waitForAbortOrDelay(signal, this.options.intervalMs ?? 30_000);
      }
    } finally {
      await this.safeWrite("markStopped");
    }
  }

  private async safeWrite(method: "markStarted" | "markRunning" | "markStopped"): Promise<void> {
    try {
      await this.repository[method]({
        workerId: this.options.workerId,
        processId: this.options.processId ?? process.pid,
        enabledTaskCodes: this.options.enabledTaskCodes,
        observedAt: (this.options.now ?? (() => new Date()))(),
      });
    } catch {
      // Heartbeat failures must not stop lease-protected business tasks.
    }
  }
}

function waitForAbortOrDelay(signal: AbortSignal, delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, delayMs);
    signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}
