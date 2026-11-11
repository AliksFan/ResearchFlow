import type { CollaborationActor } from "./contracts.js";
import type { NotificationRepository } from "./notification-contracts.js";
import { CollaborationError } from "./repository-contracts.js";

export class NotificationService {
  constructor(private readonly repository: NotificationRepository) {}

  list(actor: CollaborationActor) {
    requireCoreRole(actor);
    return this.repository.listForRecipient(actor);
  }

  markRead(actor: CollaborationActor, notificationId: string) {
    requireCoreRole(actor);
    const id = notificationId.normalize("NFKC").trim();
    if (!id) throw new CollaborationError("NOTIFICATION_INVALID_INPUT");
    return this.repository.markRead(actor, id);
  }

  open(actor: CollaborationActor, notificationId: string) {
    requireCoreRole(actor);
    const id = notificationId.normalize("NFKC").trim();
    if (!id) throw new CollaborationError("NOTIFICATION_INVALID_INPUT");
    return this.repository.open(actor, id);
  }

  listDeliveryStatus(actor: CollaborationActor) {
    requirePmo(actor);
    return this.repository.listDeliveryStatus(actor);
  }

  listAuditTrail(actor: CollaborationActor) {
    requirePmo(actor);
    return this.repository.listAuditTrail(actor);
  }
}

function requireCoreRole(actor: CollaborationActor): void {
  if (!(actor.roleCode === "PMO" || actor.roleCode === "DEAN" || actor.roleCode === "KEY_SUB_I")) {
    throw new CollaborationError("COLLABORATION_FORBIDDEN");
  }
}

function requirePmo(actor: CollaborationActor): void {
  if (actor.roleCode !== "PMO") throw new CollaborationError("COLLABORATION_FORBIDDEN");
}
