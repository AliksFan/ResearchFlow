import { describe, expect, it, vi } from "vitest";

import {
  CollaborationError,
  NotificationService,
  type CollaborationActor,
  type NotificationRepository,
} from "../src/index.js";

const actor: CollaborationActor = {
  personId: "person-pmo",
  roleCode: "PMO",
  sessionId: "session-pmo",
};

function repository(): NotificationRepository {
  return {
    listForRecipient: vi.fn(async () => ({
      items: [],
      counts: { unread: 0, pendingAction: 0, informational: 0 },
    })),
    markRead: vi.fn(async () => undefined),
    open: vi.fn(async () => ({
      kind: "PROJECT_EXECUTION" as const,
      projectId: "project-1",
    })),
    listDeliveryStatus: vi.fn(async () => []),
    listAuditTrail: vi.fn(async () => []),
  };
}

describe("NotificationService", () => {
  it("keeps reading and action completion as independent dimensions", async () => {
    const repo = repository();
    await new NotificationService(repo).markRead(actor, "notification-1");
    expect(repo.markRead).toHaveBeenCalledWith(actor, "notification-1");
  });

  it("opens a notification through the repository so read state and the authorized target are resolved together", async () => {
    const repo = repository();
    await expect(new NotificationService(repo).open(actor, " notification-1 ")).resolves.toEqual({
      kind: "PROJECT_EXECUTION",
      projectId: "project-1",
    });
    expect(repo.open).toHaveBeenCalledWith(actor, "notification-1");
  });

  it("allows only PMO to query delivery and audit operations", async () => {
    const repo = repository();
    const service = new NotificationService(repo);
    await expect(service.listDeliveryStatus(actor)).resolves.toEqual([]);
    await expect(service.listAuditTrail(actor)).resolves.toEqual([]);
    expect(() => service.listDeliveryStatus({ ...actor, roleCode: "DEAN" })).toThrowError("COLLABORATION_FORBIDDEN");
  });

  it("rejects support roles from the phase 2 message center", async () => {
    const service = new NotificationService(repository());
    expect(() => service.list({ ...actor, roleCode: "CRC" } as unknown as CollaborationActor)).toThrowError(expect.objectContaining<Partial<CollaborationError>>({
      code: "COLLABORATION_FORBIDDEN",
    }));
  });

  it("rejects blank notification ids before reaching the repository", async () => {
    const repo = repository();
    expect(() => new NotificationService(repo).markRead(actor, "  ")).toThrowError(expect.objectContaining<Partial<CollaborationError>>({
      code: "NOTIFICATION_INVALID_INPUT",
    }));
    expect(repo.markRead).not.toHaveBeenCalled();
    expect(() => new NotificationService(repo).open(actor, "\u3000")).toThrowError(expect.objectContaining<Partial<CollaborationError>>({
      code: "NOTIFICATION_INVALID_INPUT",
    }));
    expect(repo.open).not.toHaveBeenCalled();
  });
});
