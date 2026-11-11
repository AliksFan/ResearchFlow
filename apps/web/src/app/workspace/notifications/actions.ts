"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCollaborationActor } from "@/server/collaboration-session";
import { getNotificationRuntime } from "@/server/notification-runtime";
import { notificationHref } from "./navigation";

export async function openNotification(formData: FormData): Promise<never> {
  const actor = await requireCollaborationActor();
  const notificationId = formData.get("notificationId");
  if (typeof notificationId !== "string") redirect("/workspace/notifications");
  const target = await getNotificationRuntime().open(actor, notificationId);
  revalidateNotificationCenter();
  redirect(target ? notificationHref(target) : "/workspace/notifications");
}

export async function markNotificationRead(formData: FormData): Promise<void> {
  const actor = await requireCollaborationActor();
  const notificationId = formData.get("notificationId");
  if (typeof notificationId !== "string") return;
  await getNotificationRuntime().markRead(actor, notificationId);
  revalidateNotificationCenter();
}

export async function markAllNotificationsRead(): Promise<void> {
  const actor = await requireCollaborationActor();
  const runtime = getNotificationRuntime();
  const state = await runtime.list(actor);
  for (const item of state.items) {
    if (item.readStatus === "UNREAD") await runtime.markRead(actor, item.id);
  }
  revalidateNotificationCenter();
}

function revalidateNotificationCenter() {
  revalidatePath("/workspace", "layout");
  revalidatePath("/admin/access");
}
