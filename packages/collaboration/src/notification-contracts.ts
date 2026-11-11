import type { CollaborationActor } from "./contracts.js";

export type NotificationMessageKind = "INFORMATIONAL" | "ACTION";
export type NotificationReadStatus = "UNREAD" | "READ";
export type NotificationActionStatus = "NOT_APPLICABLE" | "PENDING" | "COMPLETED";
export type NotificationNodeTab = "report" | "progress" | "issues";

export type NotificationNavigationReference =
  | {
      kind: "PROJECT_APPLICATION";
      projectId: string;
      perspective: "APPLICANT" | "PMO_REVIEW";
    }
  | {
      kind: "PROJECT_EXECUTION";
      projectId: string;
      projectWorkflowStageId?: string;
      tab?: NotificationNodeTab;
      progressRecordId?: string;
      completionRequestId?: string;
      issueId?: string;
      panel?: "closure";
    };

export interface NotificationListItem {
  id: string;
  eventCode: string;
  projectId: string | null;
  projectCode: string | null;
  workflowName: string | null;
  title: string;
  content: string;
  readStatus: NotificationReadStatus;
  messageKind: NotificationMessageKind;
  actionStatus: NotificationActionStatus;
  actionCompletionReason: string | null;
  createdAt: string;
  readAt: string | null;
  navigation: NotificationNavigationReference | null;
}

export interface NotificationCenterState {
  items: NotificationListItem[];
  counts: { unread: number; pendingAction: number; informational: number };
}

export interface NotificationRepository {
  listForRecipient(actor: CollaborationActor): Promise<NotificationCenterState>;
  markRead(actor: CollaborationActor, notificationId: string): Promise<void>;
  open(actor: CollaborationActor, notificationId: string): Promise<NotificationNavigationReference | null>;
  listDeliveryStatus(actor: CollaborationActor): Promise<NotificationDeliveryStatusItem[]>;
  listAuditTrail(actor: CollaborationActor): Promise<AuditTrailItem[]>;
}

export interface NotificationDeliveryStatusItem {
  id: string;
  projectCode: string | null;
  recipientDisplayName: string;
  recipientEmailPresent: boolean;
  eventCode: string;
  status: "PENDING" | "PROCESSING" | "SENT" | "SKIPPED_NO_ADDRESS" | "FAILED_FINAL";
  attemptCount: number;
  maxAttempts: number;
  lastErrorCode: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AuditTrailItem {
  id: string;
  occurredAt: string;
  actorDisplayName: string | null;
  actorRoleCode: string | null;
  actionCode: string;
  result: "SUCCESS" | "FAILURE";
  projectCode: string | null;
  entityType: string;
  summary: string;
  failureCode: string | null;
}
