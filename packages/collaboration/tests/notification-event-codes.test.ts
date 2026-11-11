import { describe, expect, it } from "vitest";

import { NOTIFICATION_EVENT_CODES, isNotificationEventCode } from "../src/index.js";

describe("notification event catalog", () => {
  it("keeps stable unique codes for all six phase 2 stages", () => {
    expect(new Set(NOTIFICATION_EVENT_CODES).size).toBe(NOTIFICATION_EVENT_CODES.length);
    expect(isNotificationEventCode("PROJECT_APPLICATION_APPROVED")).toBe(true);
    expect(isNotificationEventCode("WORKFLOW_COMPLETION_REVIEW_REQUIRED")).toBe(true);
    expect(isNotificationEventCode("ISSUE_DEAN_DECIDED")).toBe(true);
    expect(isNotificationEventCode("PROJECT_COMPLETION_APPROVED")).toBe(true);
    expect(isNotificationEventCode("PROJECT_COMPLETION_SUPPLEMENT_OVERDUE")).toBe(true);
    expect(isNotificationEventCode("UNREGISTERED_EVENT")).toBe(false);
  });
});
