export interface WorkerTask {
  code: string;
  run(signal: AbortSignal): Promise<void>;
}

export class WorkerTaskRegistry {
  private readonly tasks = new Map<string, WorkerTask>();

  register(task: WorkerTask): void {
    if (this.tasks.has(task.code)) throw new Error("WORKER_TASK_ALREADY_REGISTERED");
    this.tasks.set(task.code, task);
  }

  list(): readonly WorkerTask[] {
    return [...this.tasks.values()];
  }
}

export async function runWorker(
  registry: WorkerTaskRegistry,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return;
  const tasks = registry.list();
  if (tasks.length === 0) {
    await waitForAbort(signal);
    return;
  }
  await Promise.all(tasks.map((task) => task.run(signal)));
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
