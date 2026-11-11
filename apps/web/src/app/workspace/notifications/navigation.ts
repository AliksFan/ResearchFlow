import type { NotificationNavigationReference } from "@researchflow/collaboration";

export function notificationHref(reference: NotificationNavigationReference): string {
  if (reference.kind === "PROJECT_APPLICATION") {
    return reference.perspective === "PMO_REVIEW"
      ? `/workspace/pmo/project-applications/${reference.projectId}`
      : `/workspace/applications/${reference.projectId}`;
  }

  const base = `/workspace/projects/${reference.projectId}/execution`;
  if (reference.panel) return `${base}?panel=${reference.panel}`;
  if (!reference.projectWorkflowStageId) return base;

  const query = new URLSearchParams({ node: reference.projectWorkflowStageId });
  if (reference.tab) query.set("tab", reference.tab);
  if (reference.progressRecordId) query.set("progress", reference.progressRecordId);
  if (reference.completionRequestId) query.set("completion", reference.completionRequestId);
  if (reference.issueId) query.set("issue", reference.issueId);
  const fragment = reference.issueId
    ? `#issue-${encodeURIComponent(reference.issueId)}`
    : reference.progressRecordId
      ? `#progress-${encodeURIComponent(reference.progressRecordId)}`
      : reference.completionRequestId
        ? `#completion-${encodeURIComponent(reference.completionRequestId)}`
        : "";
  return `${base}?${query.toString()}${fragment}`;
}
