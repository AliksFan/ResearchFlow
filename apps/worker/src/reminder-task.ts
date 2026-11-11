export interface ReminderService {
  runScheduledReminder(scheduledFor: Date, workerId: string, leaseMs: number): Promise<void>;
}

export class ReminderTask {
  readonly code = "COLLABORATION_REMINDERS";

  constructor(
    private readonly service: ReminderService,
    private readonly options: { workerId?: string; leaseMs?: number; now?: () => Date; intervalMs?: number } = {},
  ) {}

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        await this.service.runScheduledReminder((this.options.now ?? (() => new Date()))(), this.options.workerId ?? `reminder-${process.pid}`, this.options.leaseMs ?? 60_000);
      } catch {
        // The repository records the bounded retry state; keep the task alive for the next eligible attempt.
      }
      if (!signal.aborted) await waitForAbortOrDelay(signal, this.options.intervalMs ?? 60_000);
    }
  }
}

function waitForAbortOrDelay(signal: AbortSignal, delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, delayMs);
    signal.addEventListener("abort", () => { clearTimeout(timeout); resolve(); }, { once: true });
  });
}
