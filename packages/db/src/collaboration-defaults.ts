import { randomUUID } from "node:crypto";

import { DEFAULT_COLLABORATION_TIME_LIMITS } from "@researchflow/collaboration";

import type { ApplicationPrismaClient } from "./client.js";

export async function ensureDefaultCollaborationTimeLimits(
  client: ApplicationPrismaClient,
  input: { updatedByPersonId: string; correlationId?: string },
): Promise<void> {
  await client.$transaction(async (transaction) => {
    const pmo = await transaction.person.findFirst({
      where: {
        id: input.updatedByPersonId,
        accountStatus: "ACTIVE",
        roleAssignments: {
          some: {
            roleCode: "PMO",
            projectId: null,
            assignmentStatus: "ACTIVE",
          },
        },
      },
      select: { id: true },
    });
    if (!pmo) throw new Error("DEFAULT_COLLABORATION_TIME_LIMIT_PMO_REQUIRED");

    const result = await transaction.collaborationTimeLimitSetting.createMany({
      data: DEFAULT_COLLABORATION_TIME_LIMITS.map((setting) => ({
        ...setting,
        projectId: null,
        updatedByPersonId: pmo.id,
      })),
      skipDuplicates: true,
    });
    if (result.count === 0) return;

    await transaction.auditLog.create({
      data: {
        actorPersonId: pmo.id,
        actorRoleCode: "PMO",
        actorIdentifierMasked: "system-bootstrap",
        actionCode: "COLLABORATION_TIME_LIMIT_DEFAULTS_INITIALIZED",
        result: "SUCCESS",
        entityType: "COLLABORATION_TIME_LIMIT_SETTING",
        summary: "初始化协作责任全局默认时限",
        changedFields: ["time_limit_days", "reminder_interval_days"],
        afterSnapshot: [...DEFAULT_COLLABORATION_TIME_LIMITS],
        correlationId: input.correlationId ?? randomUUID(),
      },
    });
  }, { isolationLevel: "Serializable" });
}
