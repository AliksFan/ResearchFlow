import { randomUUID } from "node:crypto";

import type { NotificationEmail, NotificationEmailTransport } from "@researchflow/db";

export class CaptureEmailTransport implements NotificationEmailTransport {
  private readonly messages: NotificationEmail[] = [];
  private readonly providerIds = new Map<string, string>();

  async send(message: NotificationEmail): Promise<{ providerMessageId: string }> {
    const existing = this.providerIds.get(message.idempotencyKey);
    if (existing) return { providerMessageId: existing };
    const providerMessageId = `capture-${randomUUID()}`;
    this.providerIds.set(message.idempotencyKey, providerMessageId);
    this.messages.push(structuredClone(message));
    return { providerMessageId };
  }

  captured(): readonly NotificationEmail[] {
    return this.messages.map((message) => structuredClone(message));
  }
}
