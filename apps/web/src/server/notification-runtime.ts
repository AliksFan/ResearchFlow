import { NotificationService } from "@researchflow/collaboration";
import { PrismaNotificationRepository } from "@researchflow/db";

import { getApplicationPrismaClient } from "./auth-runtime";

const runtimeState = globalThis as typeof globalThis & { researchFlowNotificationRuntime?: NotificationService };

export function getNotificationRuntime(): NotificationService {
  runtimeState.researchFlowNotificationRuntime ??= new NotificationService(
    new PrismaNotificationRepository(getApplicationPrismaClient()),
  );
  return runtimeState.researchFlowNotificationRuntime;
}
