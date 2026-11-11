export interface OutboxDeliveryService {
  deliverClaimedBatch(input: { workerId: string; limit: number; leaseMs: number }): Promise<void>;
}

export class OutboxDeliveryTask {
  readonly code = "NOTIFICATION_OUTBOX_DELIVERY";

  constructor(
    private readonly service: OutboxDeliveryService,
    private readonly options: { workerId: string; batchSize?: number; leaseMs?: number; intervalMs?: number },
  ) {}

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.service.deliverClaimedBatch({
        workerId: this.options.workerId,
        limit: this.options.batchSize ?? 20,
        leaseMs: this.options.leaseMs ?? 60_000,
      });
      if (!signal.aborted) await waitForAbortOrDelay(signal, this.options.intervalMs ?? 10_000);
    }
  }
}

function waitForAbortOrDelay(signal: AbortSignal, delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, delayMs);
    signal.addEventListener("abort", () => { clearTimeout(timeout); resolve(); }, { once: true });
  });
}
