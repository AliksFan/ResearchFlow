import { randomUUID } from "node:crypto";

import type { ApplicationPrismaClient } from "./client.js";

export interface WorkerHeartbeatInput {
  workerId: string;
  processId: number;
  enabledTaskCodes: string[];
  observedAt: Date;
}

export interface WorkerHeartbeatRepository {
  markStarted(input: WorkerHeartbeatInput): Promise<void>;
  markRunning(input: WorkerHeartbeatInput): Promise<void>;
  markStopped(input: WorkerHeartbeatInput): Promise<void>;
}

export class PrismaWorkerHeartbeatRepository implements WorkerHeartbeatRepository {
  constructor(private readonly client: ApplicationPrismaClient) {}

  async markStarted(input: WorkerHeartbeatInput): Promise<void> {
    await this.client.workerHeartbeat.upsert({
      where: { workerId: input.workerId },
      create: {
        id: randomUUID(),
        workerId: input.workerId,
        processId: input.processId,
        status: "STARTING",
        enabledTaskCodes: input.enabledTaskCodes,
        startedAt: input.observedAt,
        lastSeenAt: input.observedAt,
      },
      update: {
        processId: input.processId,
        status: "STARTING",
        enabledTaskCodes: input.enabledTaskCodes,
        startedAt: input.observedAt,
        lastSeenAt: input.observedAt,
        stoppedAt: null,
      },
    });
  }

  async markRunning(input: WorkerHeartbeatInput): Promise<void> {
    await this.client.workerHeartbeat.updateMany({
      where: { workerId: input.workerId },
      data: {
        processId: input.processId,
        status: "RUNNING",
        enabledTaskCodes: input.enabledTaskCodes,
        lastSeenAt: input.observedAt,
      },
    });
  }

  async markStopped(input: WorkerHeartbeatInput): Promise<void> {
    await this.client.workerHeartbeat.updateMany({
      where: { workerId: input.workerId },
      data: {
        processId: input.processId,
        status: "STOPPED",
        enabledTaskCodes: input.enabledTaskCodes,
        lastSeenAt: input.observedAt,
        stoppedAt: input.observedAt,
      },
    });
  }
}
