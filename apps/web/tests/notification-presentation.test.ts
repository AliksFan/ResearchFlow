import type { NotificationListItem } from "@researchflow/collaboration";
import { describe, expect, it } from "vitest";

import {
  filterNotifications,
  notificationWorkflowLabel,
} from "@/app/workspace/notifications/presentation";

const baseItem: NotificationListItem = {
  id: "notification-1",
  eventCode: "WORKFLOW_PROGRESS_RECORDED",
  projectId: "project-1",
  projectCode: "DEMO-TEST-001",
  workflowName: "研究启动",
  title: "进展已记录",
  content: "虚构项目级测试消息",
  readStatus: "UNREAD",
  messageKind: "INFORMATIONAL",
  actionStatus: "NOT_APPLICABLE",
  actionCompletionReason: null,
  createdAt: "2026-09-01T01:00:00.000Z",
  readAt: null,
  navigation: null,
};

describe("notification presentation", () => {
  it("shows the repository-provided workflow name and truthful fallbacks", () => {
    expect(notificationWorkflowLabel(baseItem)).toBe("研究启动");
    expect(notificationWorkflowLabel({ ...baseItem, workflowName: null, eventCode: "PROJECT_APPLICATION_SUBMITTED" })).toBe("项目申请");
    expect(notificationWorkflowLabel({ ...baseItem, workflowName: null, projectId: null, projectCode: null })).toBe("系统消息");
  });

  it("filters unread and pending action messages independently", () => {
    const pending = { ...baseItem, id: "notification-2", readStatus: "READ" as const, messageKind: "ACTION" as const, actionStatus: "PENDING" as const };
    expect(filterNotifications([baseItem, pending], "unread")).toEqual([baseItem]);
    expect(filterNotifications([baseItem, pending], "pending")).toEqual([pending]);
    expect(filterNotifications([baseItem, pending], "all")).toHaveLength(2);
  });
});
