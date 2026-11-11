import type { NotificationListItem } from "@researchflow/collaboration";

export type NotificationView = "unread" | "pending" | "all";

export function filterNotifications(items: NotificationListItem[], view: NotificationView) {
  return items.filter((item) => {
    if (view === "unread") return item.readStatus === "UNREAD";
    if (view === "pending") return item.messageKind === "ACTION" && item.actionStatus === "PENDING";
    return true;
  });
}

export function notificationWorkflowLabel(item: NotificationListItem): string {
  if (item.workflowName) return item.workflowName;
  if (item.eventCode.startsWith("PROJECT_APPLICATION_")) return "项目申请";
  if (item.navigation?.kind === "PROJECT_EXECUTION" && item.navigation.panel === "closure") return "结题与归档";
  return item.projectId ? "项目级事项" : "系统消息";
}

export function notificationKindLabel(item: NotificationListItem): string {
  if (item.messageKind === "INFORMATIONAL") return "信息";
  return item.actionStatus === "PENDING" ? "待处理" : "待办已完成";
}

export function formatNotificationTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
