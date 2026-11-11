export interface AttachmentCleanupService {
  cleanupExpiredDrafts(limit: number, workerId: string, leaseMs: number): Promise<void>;
}

export class AttachmentCleanupTask {
  readonly code = "ATTACHMENT_DRAFT_CLEANUP";

  constructor(
    private readonly service: AttachmentCleanupService,
    private readonly options: { workerId?: string; batchSize?: number; leaseMs?: number; intervalMs?: number } = {},
  ) {}

  async run(signal: AbortSignal): Promise<void> {
    const batchSize = this.options.batchSize ?? 20;
    const intervalMs = this.options.intervalMs ?? 60_000;
    while (!signal.aborted) {
      try {
        await this.service.cleanupExpiredDrafts(batchSize, this.options.workerId ?? `attachment-cleanup-${process.pid}`, this.options.leaseMs ?? 60_000);
      } catch {
        // The cleanup run stores the bounded failure summary; retry on the next interval.
      }
      if (!signal.aborted) await waitForAbortOrDelay(signal, intervalMs);
    }
  }
}

function waitForAbortOrDelay(signal: AbortSignal, intervalMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, intervalMs);
    signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}
