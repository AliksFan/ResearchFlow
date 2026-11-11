-- Archive and restore notifications use project_archive_activity as their
-- single project-level source.
ALTER TABLE "notification"
  DROP CONSTRAINT "notification_type_source_check";

ALTER TABLE "notification"
  ADD CONSTRAINT "notification_type_source_check" CHECK (
    ("notification_type" = 'ISSUE_MESSAGE' AND "issue_id" IS NOT NULL AND "event_code" LIKE 'ISSUE_%')
    OR ("notification_type" = 'WORKFLOW_REVIEW_NOTICE' AND "project_id" IS NOT NULL AND "event_code" LIKE 'WORKFLOW_COMPLETION_%'
        AND num_nonnulls("workflow_update_id", "workflow_completion_request_id") = 1)
    OR ("notification_type" = 'PROJECT_REVIEW_NOTICE' AND "project_id" IS NOT NULL AND "event_code" LIKE 'PROJECT_%'
        AND num_nonnulls("project_establishment_review_id", "project_application_activity_id", "project_plan_change_request_id", "project_field_change_request_id", "project_completion_request_id", "project_archive_activity_id") = 1)
    OR ("notification_type" = 'WORKFLOW_FILL_REMINDER' AND "project_workflow_stage_id" IS NOT NULL AND "event_code" IN ('WORKFLOW_UPDATE_DUE', 'WORKFLOW_MANUAL_REMINDER_SENT'))
    OR ("notification_type" = 'MILESTONE_UPCOMING_REMINDER' AND "project_workflow_stage_id" IS NOT NULL AND "event_code" = 'MILESTONE_UPCOMING')
    OR ("notification_type" = 'MILESTONE_OVERDUE_REMINDER' AND "project_workflow_stage_id" IS NOT NULL AND "event_code" = 'MILESTONE_OVERDUE')
    OR ("notification_type" = 'SYSTEM_NOTICE' AND "event_code" = 'WORKFLOW_EXCEPTION_DIGEST')
  );
