-- A project-completion draft is created before the completion request exists,
-- then bound to that request in the same transaction as the first submission.
ALTER TABLE "attachment_draft"
  DROP CONSTRAINT "attachment_draft_context_check",
  ADD CONSTRAINT "attachment_draft_context_check"
  CHECK (
    (
      "parent_type" = 'PROJECT_COMPLETION_SUBMISSION_VERSION'
      AND "project_workflow_stage_id" IS NULL
      AND "issue_id" IS NULL
      AND "project_plan_change_request_id" IS NULL
      AND "project_field_change_request_id" IS NULL
    )
    OR (
      "parent_type" <> 'PROJECT_COMPLETION_SUBMISSION_VERSION'
      AND NUM_NONNULLS(
        "project_workflow_stage_id",
        "issue_id",
        "project_plan_change_request_id",
        "project_field_change_request_id",
        "project_completion_request_id"
      ) = 1
    )
  );
