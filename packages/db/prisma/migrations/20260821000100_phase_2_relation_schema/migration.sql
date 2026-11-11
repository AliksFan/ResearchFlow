-- CreateEnum
CREATE TYPE "PlanItemApplicability" AS ENUM ('REQUIRED', 'OPTIONAL', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "AttachmentRequirement" AS ENUM ('NONE', 'OPTIONAL', 'REQUIRED');

-- CreateEnum
CREATE TYPE "RevisionValueMode" AS ENUM ('KEEP', 'SET', 'CLEAR');

-- CreateEnum
CREATE TYPE "WorkflowCompletionRequestStatus" AS ENUM ('WAITING_FOR_PREDECESSOR', 'PENDING_PMO_REVIEW', 'ISSUE_RESOLUTION_REQUIRED', 'PREDECESSOR_RETURNED_CONFIRMATION', 'RETURNED_FOR_RESUBMISSION', 'APPROVED', 'WITHDRAWN', 'TERMINATED_BY_PLAN_CHANGE');

-- CreateEnum
CREATE TYPE "WorkflowCompletionReviewRoundStatus" AS ENUM ('ACTIVE', 'PAUSED', 'APPROVED', 'RETURNED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "WorkflowCompletionPauseReason" AS ENUM ('ISSUE_BLOCK', 'PREDECESSOR_RETURNED');

-- CreateEnum
CREATE TYPE "WorkflowCompletionActivityType" AS ENUM ('SUBMITTED', 'SUPPLEMENTED', 'RECONFIRMED', 'PAUSED', 'RESUMED', 'RETURNED', 'RESUBMITTED', 'WITHDRAWN', 'APPROVED', 'TERMINATED_BY_PLAN_CHANGE');

-- CreateEnum
CREATE TYPE "BusinessVisibilityScope" AS ENUM ('PROJECT_SHARED', 'PMO_ONLY', 'PMO_AND_DEAN', 'ISSUE_PARTICIPANTS');

-- CreateEnum
CREATE TYPE "IssueDecisionRoundStatus" AS ENUM ('PENDING_DEAN_DECISION', 'PENDING_PMO_SUPPLEMENT', 'PENDING_PMO_IMPLEMENTATION', 'PENDING_DEAN_REVIEW', 'PENDING_REPORTER_CONFIRMATION', 'COMPLETED');

-- CreateEnum
CREATE TYPE "IssueDeanDecisionCode" AS ENUM ('AGREE_WITH_PMO_RECOMMENDATION', 'COORDINATE_RESOURCES', 'OTHER');

-- CreateEnum
CREATE TYPE "IssueImplementationReviewDecision" AS ENUM ('ACCEPTED', 'RETURNED');

-- CreateEnum
CREATE TYPE "IssueSharedSummaryType" AS ENUM ('INITIAL', 'COORDINATION', 'IMPLEMENTATION', 'RESOLUTION', 'INVALID_CLOSURE');

-- CreateEnum
CREATE TYPE "NotificationReadStatus" AS ENUM ('UNREAD', 'READ');

-- CreateEnum
CREATE TYPE "NotificationMessageKind" AS ENUM ('INFORMATIONAL', 'ACTION');

-- CreateEnum
CREATE TYPE "NotificationActionStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CollaborationResponsibilityType" AS ENUM ('WORKFLOW_COMPLETION_PMO_REVIEW', 'PROJECT_COMPLETION_PMO_REVIEW', 'PROJECT_COMPLETION_SUPPLEMENT', 'ISSUE_DEAN_DECISION', 'ISSUE_PMO_IMPLEMENTATION', 'ISSUE_REPORTER_SUPPLEMENT', 'ISSUE_REPORTER_CONFIRMATION');

-- CreateEnum
CREATE TYPE "ProjectCompletionReviewRoundStatus" AS ENUM ('ACTIVE', 'APPROVED', 'RETURNED', 'BLOCKED_ENDED');

-- CreateEnum
CREATE TYPE "ProjectCompletionSupplementReason" AS ENUM ('RESUBMITTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ProjectCompletionBlockType" AS ENUM ('REQUIRED_NODE_INCOMPLETE', 'OPEN_ISSUE', 'GOVERNANCE_MATERIAL_MISSING');

-- CreateEnum
CREATE TYPE "ProjectArchiveAction" AS ENUM ('ARCHIVED', 'RESTORED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'SKIPPED_NO_ADDRESS', 'FAILED_FINAL');

-- CreateEnum
CREATE TYPE "OutboxAttemptStatus" AS ENUM ('SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "AttachmentDraftStatus" AS ENUM ('OPEN', 'SUBMITTED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AttachmentUploadSessionStatus" AS ENUM ('OPEN', 'COMPLETED', 'FAILED', 'EXPIRED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "FileAssetStatus" AS ENUM ('UPLOADING', 'AVAILABLE', 'REJECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "AttachmentRemovalReason" AS ENUM ('DRAFT_ABANDONED', 'DRAFT_EXPIRED', 'SECURITY_DOWNLOAD_BLOCKED', 'STORAGE_OBJECT_MISSING');

-- CreateEnum
CREATE TYPE "AttachmentParentType" AS ENUM ('WORKFLOW_UPDATE', 'WORKFLOW_COMPLETION_SUBMISSION', 'WORKFLOW_COMPLETION_SUPPLEMENT', 'ISSUE', 'ISSUE_ACTIVITY', 'ISSUE_DEAN_DECISION', 'ISSUE_IMPLEMENTATION_SUBMISSION', 'PROJECT_PLAN_CHANGE_REQUEST', 'PROJECT_PLAN_CHANGE_ACTIVITY', 'PROJECT_FIELD_CHANGE_REQUEST', 'PROJECT_FIELD_CHANGE_ACTIVITY', 'PROJECT_COMPLETION_SUBMISSION_VERSION');

-- Refuse destructive conversion when legacy Phase 2 facts exist. The approved
-- design requires an explicit per-table mapping decision instead of clearing or
-- silently copying those facts.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "project" WHERE "budget_used" IS NOT NULL) THEN
    RAISE EXCEPTION 'PHASE2_MIGRATION_REQUIRES_BUDGET_USED_MAPPING';
  END IF;
  IF EXISTS (SELECT 1 FROM "project" WHERE "pre_archive_status" IS NOT NULL) THEN
    RAISE EXCEPTION 'PHASE2_MIGRATION_REQUIRES_PRE_ARCHIVE_STATUS_MAPPING';
  END IF;
  IF EXISTS (SELECT 1 FROM "workflow_update")
     OR EXISTS (SELECT 1 FROM "workflow_update_review") THEN
    RAISE EXCEPTION 'PHASE2_MIGRATION_REQUIRES_WORKFLOW_UPDATE_MAPPING';
  END IF;
  IF EXISTS (SELECT 1 FROM "project_completion_request")
     OR EXISTS (SELECT 1 FROM "project_completion_check")
     OR EXISTS (SELECT 1 FROM "project_completion_activity") THEN
    RAISE EXCEPTION 'PHASE2_MIGRATION_REQUIRES_COMPLETION_MAPPING';
  END IF;
  IF EXISTS (SELECT 1 FROM "issue")
     OR EXISTS (SELECT 1 FROM "issue_handling_state")
     OR EXISTS (SELECT 1 FROM "issue_activity") THEN
    RAISE EXCEPTION 'PHASE2_MIGRATION_REQUIRES_ISSUE_MAPPING';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "workflow_stage_template" wst
    JOIN "workflow_template" wt ON wt."id" = wst."workflow_template_id"
    JOIN "stage_template" st ON st."id" = wst."stage_template_id"
    WHERE wt."template_version_id" <> st."template_version_id"
  ) THEN
    RAISE EXCEPTION 'PHASE2_MIGRATION_TEMPLATE_VERSION_MISMATCH';
  END IF;
END $$;

-- This manual partial index is bound to the legacy enum values and must be
-- rebuilt after the enum replacement below.
DROP INDEX "project_completion_request_one_active_key";

-- AlterEnum
BEGIN;
CREATE TYPE "CompletionRequestStatus_new" AS ENUM ('CLOSURE_BLOCKED', 'CLOSURE_PENDING_PMO_REVIEW', 'CLOSURE_RETURNED_FOR_SUPPLEMENT', 'WITHDRAWN', 'APPROVED');
ALTER TABLE "project_completion_request" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "project_completion_request" ALTER COLUMN "status" TYPE "CompletionRequestStatus_new" USING ("status"::text::"CompletionRequestStatus_new");
ALTER TYPE "CompletionRequestStatus" RENAME TO "CompletionRequestStatus_old";
ALTER TYPE "CompletionRequestStatus_new" RENAME TO "CompletionRequestStatus";
DROP TYPE "CompletionRequestStatus_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "notification" DROP CONSTRAINT "notification_project_id_workflow_update_review_id_fkey";

-- DropForeignKey
ALTER TABLE "project_completion_check" DROP CONSTRAINT "project_completion_check_completion_request_id_fkey";

-- DropForeignKey
ALTER TABLE "project_completion_request" DROP CONSTRAINT "project_completion_request_previous_request_id_project_id_fkey";

-- DropForeignKey
ALTER TABLE "project_completion_request" DROP CONSTRAINT "project_completion_request_reviewed_by_person_id_fkey";

-- DropForeignKey
ALTER TABLE "project_completion_request" DROP CONSTRAINT "project_completion_request_submitted_by_person_id_fkey";

-- DropForeignKey
ALTER TABLE "workflow_update" DROP CONSTRAINT "workflow_update_source_update_id_project_id_fkey";

-- DropForeignKey
ALTER TABLE "workflow_update_review" DROP CONSTRAINT "workflow_update_review_project_id_fkey";

-- DropForeignKey
ALTER TABLE "workflow_update_review" DROP CONSTRAINT "workflow_update_review_reviewed_by_person_id_fkey";

-- DropForeignKey
ALTER TABLE "workflow_update_review" DROP CONSTRAINT "workflow_update_review_workflow_update_id_project_id_fkey";

-- Drop legacy triggers before removing the columns they reference. The shared
-- validate_previous_request function remains for plan and field-change chains.
DROP TRIGGER "project_completion_request_history" ON "project_completion_request";
DROP TRIGGER "workflow_update_source_history" ON "workflow_update";
DROP FUNCTION "validate_workflow_update_source"();

-- DropIndex
DROP INDEX "notification_recipient_person_id_status_created_at_idx";

-- DropIndex
DROP INDEX "project_completion_check_completion_request_id_check_code_key";

-- DropIndex
DROP INDEX "workflow_update_review_status_submitted_at_idx";

-- AlterTable
ALTER TABLE "issue" ADD COLUMN     "project_completion_request_id" UUID,
ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "issue_activity" ADD COLUMN     "decision_round_id" UUID,
ADD COLUMN     "sequence_no" INTEGER NOT NULL,
DROP COLUMN "visibility_scope",
ADD COLUMN     "visibility_scope" "BusinessVisibilityScope" NOT NULL;

-- AlterTable
ALTER TABLE "issue_email" DROP COLUMN "visibility_scope",
ADD COLUMN     "visibility_scope" "BusinessVisibilityScope" NOT NULL DEFAULT 'PMO_ONLY';

-- AlterTable
ALTER TABLE "issue_handling_state" ADD COLUMN     "due_at" TIMESTAMPTZ(3),
ADD COLUMN     "reminder_interval_days_snapshot" INTEGER,
ADD COLUMN     "responsibility_round_no" INTEGER NOT NULL,
ADD COLUMN     "time_limit_days_snapshot" INTEGER,
ADD COLUMN     "time_limit_result" TEXT;

-- AlterTable: preserve the independent legacy read fact before removing the old
-- overloaded status column.
ALTER TABLE "notification" ADD COLUMN "read_status" "NotificationReadStatus";
UPDATE "notification"
SET "read_status" = "status"::text::"NotificationReadStatus";
ALTER TABLE "notification" ALTER COLUMN "read_status" SET NOT NULL;
ALTER TABLE "notification" ALTER COLUMN "read_status" SET DEFAULT 'UNREAD';

ALTER TABLE "notification" DROP COLUMN "status",
DROP COLUMN "workflow_update_review_id",
ADD COLUMN     "action_completed_at" TIMESTAMPTZ(3),
ADD COLUMN     "action_completion_reason" TEXT,
ADD COLUMN     "action_group_key" TEXT,
ADD COLUMN     "action_status" "NotificationActionStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
ADD COLUMN     "issue_decision_round_id" UUID,
ADD COLUMN     "issue_implementation_submission_id" UUID,
ADD COLUMN     "issue_shared_summary_id" UUID,
ADD COLUMN     "message_kind" "NotificationMessageKind" NOT NULL DEFAULT 'INFORMATIONAL',
ADD COLUMN     "project_archive_activity_id" UUID,
ADD COLUMN     "project_completion_review_round_id" UUID,
ADD COLUMN     "workflow_completion_request_id" UUID,
ADD COLUMN     "workflow_completion_review_round_id" UUID;

-- AlterTable
ALTER TABLE "project" DROP COLUMN "budget_used",
DROP COLUMN "pre_archive_status";

-- AlterTable
ALTER TABLE "project_completion_check" DROP COLUMN "completion_request_id",
ADD COLUMN     "project_id" UUID NOT NULL,
ADD COLUMN     "review_round_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "project_completion_request" DROP COLUMN "completed_at",
DROP COLUMN "completion_summary",
DROP COLUMN "exception_statement",
DROP COLUMN "previous_request_id",
DROP COLUMN "review_comment",
DROP COLUMN "reviewed_at",
DROP COLUMN "reviewed_by_person_id",
DROP COLUMN "submitted_at",
DROP COLUMN "submitted_by_person_id",
DROP COLUMN "submitted_role_code",
ADD COLUMN     "closed_at" TIMESTAMPTZ(3),
ADD COLUMN     "current_submission_version_id" UUID,
ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "status" DROP DEFAULT;

-- AlterTable: freeze the legacy template meaning into existing plan versions.
ALTER TABLE "project_stage_version" ADD COLUMN "applicability" "PlanItemApplicability";
UPDATE "project_stage_version" psv
SET "applicability" = CASE
  WHEN NOT st."enabled" THEN 'NOT_APPLICABLE'::"PlanItemApplicability"
  WHEN st."required_by_default" THEN 'REQUIRED'::"PlanItemApplicability"
  ELSE 'OPTIONAL'::"PlanItemApplicability"
END
FROM "project_stage" ps
JOIN "stage_template" st ON st."id" = ps."source_stage_template_id"
WHERE ps."id" = psv."project_stage_id";
ALTER TABLE "project_stage_version"
ALTER COLUMN "applicability" SET NOT NULL,
ALTER COLUMN "applicability" SET DEFAULT 'REQUIRED';

-- AlterTable
ALTER TABLE "project_workflow_stage" ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: existing nodes inherit the legacy workflow template meaning.
ALTER TABLE "project_workflow_stage_version"
ADD COLUMN "applicability" "PlanItemApplicability",
ADD COLUMN "attachment_requirement" "AttachmentRequirement" NOT NULL DEFAULT 'NONE';
UPDATE "project_workflow_stage_version" pwsv
SET "applicability" = CASE
  WHEN NOT wt."enabled" THEN 'NOT_APPLICABLE'::"PlanItemApplicability"
  WHEN wt."required_by_default" THEN 'REQUIRED'::"PlanItemApplicability"
  ELSE 'OPTIONAL'::"PlanItemApplicability"
END
FROM "project_workflow_stage" pws
JOIN "project_workflow" pw ON pw."id" = pws."project_workflow_id"
JOIN "workflow_template" wt ON wt."id" = pw."source_workflow_template_id"
WHERE pws."id" = pwsv."project_workflow_stage_id";
ALTER TABLE "project_workflow_stage_version"
ALTER COLUMN "applicability" SET NOT NULL,
ALTER COLUMN "applicability" SET DEFAULT 'REQUIRED';

-- AlterTable: preserve REQUIRED / OPTIONAL / NOT_APPLICABLE explicitly.
ALTER TABLE "stage_template" ADD COLUMN "default_applicability" "PlanItemApplicability";
UPDATE "stage_template"
SET "default_applicability" = CASE
  WHEN NOT "enabled" THEN 'NOT_APPLICABLE'::"PlanItemApplicability"
  WHEN "required_by_default" THEN 'REQUIRED'::"PlanItemApplicability"
  ELSE 'OPTIONAL'::"PlanItemApplicability"
END;
ALTER TABLE "stage_template"
ALTER COLUMN "default_applicability" SET NOT NULL,
ALTER COLUMN "default_applicability" SET DEFAULT 'REQUIRED';
ALTER TABLE "stage_template" DROP COLUMN "enabled", DROP COLUMN "required_by_default";

-- The project-application freeze guard from phase 1 must follow the new
-- applicability model: every stage remains in the frozen plan and carries its
-- own REQUIRED / OPTIONAL / NOT_APPLICABLE value.
CREATE OR REPLACE FUNCTION "validate_application_version_freeze"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  primary_count integer;
  applicant_count integer;
  required_stage_count integer;
  actual_stage_count integer;
BEGIN
  IF NEW."version_status" <> 'FROZEN' OR OLD."version_status" = 'FROZEN' THEN
    RETURN NEW;
  END IF;

  IF NEW."project_summary" IS NULL
     OR NEW."disease_area_option_id" IS NULL
     OR NEW."research_type_option_id" IS NULL
     OR NEW."priority_option_id" IS NULL
     OR NEW."lifecycle_template_version_id" IS NULL THEN
    RAISE EXCEPTION 'frozen application version is incomplete';
  END IF;

  SELECT count(*) FILTER (WHERE owner."is_primary"),
         count(*) FILTER (WHERE owner."person_id" = project."applicant_person_id")
  INTO primary_count, applicant_count
  FROM "project_application_version_owner" owner
  JOIN "project" project ON project."id" = NEW."project_id"
  WHERE owner."application_version_id" = NEW."id";

  IF primary_count <> 1 OR applicant_count <> 1 THEN
    RAISE EXCEPTION 'frozen application version requires one primary owner and the applicant';
  END IF;

  SELECT count(*) INTO required_stage_count
  FROM "stage_template"
  WHERE "template_version_id" = NEW."lifecycle_template_version_id";

  SELECT count(*) INTO actual_stage_count
  FROM "project_application_version_stage_plan"
  WHERE "application_version_id" = NEW."id";

  IF required_stage_count = 0 OR actual_stage_count <> required_stage_count THEN
    RAISE EXCEPTION 'frozen application version requires every template stage';
  END IF;

  RETURN NEW;
END;
$$;

-- AlterTable: derive the redundant template version and prior applicability
-- before enforcing composite same-version dependencies.
ALTER TABLE "workflow_stage_template"
ADD COLUMN "default_applicability" "PlanItemApplicability",
ADD COLUMN "default_attachment_requirement" "AttachmentRequirement" NOT NULL DEFAULT 'NONE',
ADD COLUMN "template_version_id" UUID;
UPDATE "workflow_stage_template" wst
SET "template_version_id" = wt."template_version_id",
    "default_applicability" = CASE
      WHEN NOT wt."enabled" THEN 'NOT_APPLICABLE'::"PlanItemApplicability"
      WHEN wt."required_by_default" THEN 'REQUIRED'::"PlanItemApplicability"
      ELSE 'OPTIONAL'::"PlanItemApplicability"
    END
FROM "workflow_template" wt
WHERE wt."id" = wst."workflow_template_id";
ALTER TABLE "workflow_stage_template"
ALTER COLUMN "default_applicability" SET NOT NULL,
ALTER COLUMN "default_applicability" SET DEFAULT 'REQUIRED',
ALTER COLUMN "template_version_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "workflow_update" DROP COLUMN "review_status",
DROP COLUMN "source_update_id",
DROP COLUMN "update_type",
ADD COLUMN     "budget_amount_cny" DECIMAL(14,2);

-- DropTable
DROP TABLE "workflow_update_review";

-- DropEnum
DROP TYPE "IssueVisibilityScope";

-- DropEnum
DROP TYPE "NotificationStatus";

-- DropEnum
DROP TYPE "WorkflowReviewDecision";

-- DropEnum
DROP TYPE "WorkflowReviewStatus";

-- DropEnum
DROP TYPE "WorkflowUpdateType";

-- CreateTable
CREATE TABLE "project_completion_submission_version" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "completion_request_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "completion_summary" TEXT NOT NULL,
    "unfinished_optional_and_legacy_statement" TEXT NOT NULL,
    "no_unfinished_item_confirmed" BOOLEAN NOT NULL,
    "archive_compliance_self_check" TEXT NOT NULL,
    "exception_statement" TEXT,
    "truth_confirmed" BOOLEAN NOT NULL,
    "submitted_by_person_id" UUID NOT NULL,
    "submitted_role_code" "RoleCode" NOT NULL DEFAULT 'KEY_SUB_I',
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_completion_submission_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_completion_review_round" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "completion_request_id" UUID NOT NULL,
    "round_no" INTEGER NOT NULL,
    "status" "ProjectCompletionReviewRoundStatus" NOT NULL,
    "time_limit_days_snapshot" INTEGER NOT NULL,
    "reminder_interval_days_snapshot" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "completed_by_person_id" UUID,
    "comment" TEXT,

    CONSTRAINT "project_completion_review_round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_completion_supplement_round" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "completion_request_id" UUID NOT NULL,
    "round_no" INTEGER NOT NULL,
    "responsible_person_id" UUID NOT NULL,
    "time_limit_days_snapshot" INTEGER NOT NULL,
    "reminder_interval_days_snapshot" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "completion_reason" "ProjectCompletionSupplementReason",

    CONSTRAINT "project_completion_supplement_round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_completion_block" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "completion_request_id" UUID NOT NULL,
    "block_type" "ProjectCompletionBlockType" NOT NULL,
    "source_workflow_stage_id" UUID,
    "source_issue_id" UUID,
    "check_code" TEXT,
    "summary" TEXT NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL,
    "cleared_at" TIMESTAMPTZ(3),

    CONSTRAINT "project_completion_block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_archive_activity" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "action" "ProjectArchiveAction" NOT NULL,
    "reason" TEXT NOT NULL,
    "actor_person_id" UUID NOT NULL,
    "actor_role_code" "RoleCode" NOT NULL DEFAULT 'PMO',
    "project_row_version_before" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_archive_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_stage_template_dependency" (
    "id" UUID NOT NULL,
    "template_version_id" UUID NOT NULL,
    "predecessor_workflow_stage_template_id" UUID NOT NULL,
    "successor_workflow_stage_template_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_stage_template_dependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_workflow_stage_dependency_version" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "project_plan_version_id" UUID NOT NULL,
    "predecessor_workflow_stage_id" UUID NOT NULL,
    "successor_workflow_stage_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_workflow_stage_dependency_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_update_correction" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "workflow_update_id" UUID NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "corrected_by_person_id" UUID NOT NULL,
    "corrected_role_code" "RoleCode" NOT NULL,
    "correction_reason" TEXT NOT NULL,
    "revised_progress_summary" TEXT,
    "revised_basis" TEXT,
    "revised_expected_date_mode" "RevisionValueMode" NOT NULL,
    "revised_expected_date" DATE,
    "budget_amount_mode" "RevisionValueMode" NOT NULL,
    "revised_budget_amount_cny" DECIMAL(14,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_update_correction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_completion_request" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "project_workflow_stage_id" UUID NOT NULL,
    "submitted_plan_version_id" UUID NOT NULL,
    "current_submission_id" UUID,
    "status" "WorkflowCompletionRequestStatus" NOT NULL,
    "attachment_requirement_snapshot" "AttachmentRequirement" NOT NULL,
    "row_version" INTEGER NOT NULL DEFAULT 0,
    "terminated_by_plan_change_request_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "workflow_completion_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_completion_submission" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "completion_request_id" UUID NOT NULL,
    "submission_no" INTEGER NOT NULL,
    "submitted_by_person_id" UUID NOT NULL,
    "submitted_role_code" "RoleCode" NOT NULL,
    "progress_summary_snapshot" TEXT NOT NULL,
    "basis_snapshot" TEXT NOT NULL,
    "expected_completion_date_snapshot" DATE,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workflow_completion_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_completion_supplement" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "completion_request_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "added_by_person_id" UUID NOT NULL,
    "added_role_code" "RoleCode" NOT NULL,
    "content" TEXT NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workflow_completion_supplement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_completion_review_round" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "completion_request_id" UUID NOT NULL,
    "round_no" INTEGER NOT NULL,
    "status" "WorkflowCompletionReviewRoundStatus" NOT NULL,
    "time_limit_days_snapshot" INTEGER NOT NULL,
    "reminder_interval_days_snapshot" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "completed_by_person_id" UUID,
    "decision_comment" TEXT,

    CONSTRAINT "workflow_completion_review_round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_completion_review_pause" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "review_round_id" UUID NOT NULL,
    "pause_no" INTEGER NOT NULL,
    "pause_reason" "WorkflowCompletionPauseReason" NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "workflow_completion_review_pause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_completion_activity" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "completion_request_id" UUID NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "activity_type" "WorkflowCompletionActivityType" NOT NULL,
    "actor_person_id" UUID NOT NULL,
    "actor_role_code" "RoleCode" NOT NULL,
    "content" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_completion_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_decision_round" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "round_no" INTEGER NOT NULL,
    "status" "IssueDecisionRoundStatus" NOT NULL,
    "current_handling_state_id" UUID NOT NULL,
    "row_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "issue_decision_round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_dean_decision" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "decision_round_id" UUID NOT NULL,
    "decision_code" "IssueDeanDecisionCode" NOT NULL,
    "decision_content" TEXT,
    "pmo_implementation_instruction" TEXT NOT NULL,
    "implementation_review_required" BOOLEAN NOT NULL,
    "decided_by_person_id" UUID NOT NULL,
    "decided_role_code" "RoleCode" NOT NULL DEFAULT 'DEAN',
    "decided_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "issue_dean_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_implementation_submission" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "decision_round_id" UUID NOT NULL,
    "submission_no" INTEGER NOT NULL,
    "submitted_by_person_id" UUID NOT NULL,
    "submitted_role_code" "RoleCode" NOT NULL DEFAULT 'PMO',
    "result_detail" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "issue_implementation_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_implementation_review" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "implementation_submission_id" UUID NOT NULL,
    "reviewed_by_person_id" UUID NOT NULL,
    "decision" "IssueImplementationReviewDecision" NOT NULL,
    "comment" TEXT NOT NULL,
    "reviewed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "issue_implementation_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_dean_review_transfer" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "decision_round_id" UUID NOT NULL,
    "from_dean_person_id" UUID NOT NULL,
    "requested_by_pmo_person_id" UUID NOT NULL,
    "request_reason" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_by_dean_person_id" UUID,
    "accepted_at" TIMESTAMPTZ(3),

    CONSTRAINT "issue_dean_review_transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_shared_summary" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "decision_round_id" UUID,
    "implementation_submission_id" UUID,
    "summary_type" "IssueSharedSummaryType" NOT NULL,
    "content" TEXT NOT NULL,
    "published_by_person_id" UUID NOT NULL,
    "published_role_code" "RoleCode" NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "issue_shared_summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_time_limit_setting" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "responsibility_type" "CollaborationResponsibilityType" NOT NULL,
    "time_limit_days" INTEGER NOT NULL,
    "reminder_interval_days" INTEGER NOT NULL,
    "updated_by_person_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "collaboration_time_limit_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "recipient_person_id" UUID NOT NULL,
    "recipient_email_snapshot" TEXT,
    "template_code" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "event_key" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_attempt_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_outbox_attempt" (
    "id" UUID NOT NULL,
    "outbox_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "status" "OutboxAttemptStatus" NOT NULL,
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "attempted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_outbox_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment_draft" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "parent_type" "AttachmentParentType" NOT NULL,
    "purpose_code" TEXT NOT NULL,
    "visibility_scope" "BusinessVisibilityScope" NOT NULL,
    "uploader_person_id" UUID NOT NULL,
    "uploader_role_code" "RoleCode" NOT NULL,
    "project_workflow_stage_id" UUID,
    "issue_id" UUID,
    "project_plan_change_request_id" UUID,
    "project_field_change_request_id" UUID,
    "project_completion_request_id" UUID,
    "status" "AttachmentDraftStatus" NOT NULL DEFAULT 'OPEN',
    "row_version" INTEGER NOT NULL DEFAULT 0,
    "last_activity_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "submitted_parent_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment_upload_session" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "attachment_draft_id" UUID NOT NULL,
    "uploader_person_id" UUID NOT NULL,
    "status" "AttachmentUploadSessionStatus" NOT NULL DEFAULT 'OPEN',
    "idempotency_key" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_activity_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_upload_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_asset" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "attachment_upload_session_id" UUID NOT NULL,
    "status" "FileAssetStatus" NOT NULL DEFAULT 'UPLOADING',
    "original_file_name" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storage_object_key" TEXT NOT NULL,
    "storage_object_version" TEXT,
    "uploaded_by_person_id" UUID NOT NULL,
    "uploaded_role_code" "RoleCode" NOT NULL,
    "declaration_version" TEXT NOT NULL,
    "available_at" TIMESTAMPTZ(3),
    "rejected_at" TIMESTAMPTZ(3),
    "rejection_code" TEXT,
    "removed_at" TIMESTAMPTZ(3),
    "removal_reason" "AttachmentRemovalReason",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_attachment" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "file_asset_id" UUID NOT NULL,
    "parent_type" "AttachmentParentType" NOT NULL,
    "visibility_scope" "BusinessVisibilityScope" NOT NULL,
    "purpose_code" TEXT NOT NULL,
    "attached_by_person_id" UUID NOT NULL,
    "attached_role_code" "RoleCode" NOT NULL,
    "attached_at" TIMESTAMPTZ(3) NOT NULL,
    "workflow_update_id" UUID,
    "workflow_completion_submission_id" UUID,
    "workflow_completion_supplement_id" UUID,
    "issue_id" UUID,
    "issue_activity_id" UUID,
    "issue_dean_decision_id" UUID,
    "issue_implementation_submission_id" UUID,
    "project_plan_change_request_id" UUID,
    "project_plan_change_activity_id" UUID,
    "project_field_change_request_id" UUID,
    "project_field_change_activity_id" UUID,
    "project_completion_submission_version_id" UUID,

    CONSTRAINT "business_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment_cleanup_run" (
    "id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "scanned_count" INTEGER NOT NULL DEFAULT 0,
    "marked_count" INTEGER NOT NULL DEFAULT 0,
    "delete_success_count" INTEGER NOT NULL DEFAULT 0,
    "delete_failure_count" INTEGER NOT NULL DEFAULT 0,
    "error_summary" TEXT,

    CONSTRAINT "attachment_cleanup_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_completion_submission_version_completion_request_id_key" ON "project_completion_submission_version"("completion_request_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "project_completion_submission_version_project_id_id_key" ON "project_completion_submission_version"("project_id", "id");

-- CreateIndex
CREATE INDEX "project_completion_review_round_status_due_at_idx" ON "project_completion_review_round"("status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_completion_review_round_completion_request_id_round_key" ON "project_completion_review_round"("completion_request_id", "round_no");

-- CreateIndex
CREATE UNIQUE INDEX "project_completion_review_round_project_id_id_key" ON "project_completion_review_round"("project_id", "id");

-- CreateIndex
CREATE INDEX "project_completion_supplement_round_completed_at_due_at_idx" ON "project_completion_supplement_round"("completed_at", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_completion_supplement_round_completion_request_id_r_key" ON "project_completion_supplement_round"("completion_request_id", "round_no");

-- CreateIndex
CREATE UNIQUE INDEX "project_completion_supplement_round_project_id_id_key" ON "project_completion_supplement_round"("project_id", "id");

-- CreateIndex
CREATE INDEX "project_completion_block_completion_request_id_cleared_at_b_idx" ON "project_completion_block"("completion_request_id", "cleared_at", "block_type");

-- CreateIndex
CREATE UNIQUE INDEX "project_completion_block_project_id_id_key" ON "project_completion_block"("project_id", "id");

-- CreateIndex
CREATE INDEX "project_archive_activity_project_id_occurred_at_idx" ON "project_archive_activity"("project_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_archive_activity_project_id_id_key" ON "project_archive_activity"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_stage_template_dependency_template_version_id_pred_key" ON "workflow_stage_template_dependency"("template_version_id", "predecessor_workflow_stage_template_id", "successor_workflow_stage_template_id");

-- CreateIndex
CREATE INDEX "project_workflow_stage_dependency_version_project_id_projec_idx" ON "project_workflow_stage_dependency_version"("project_id", "project_plan_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_workflow_stage_dependency_version_project_plan_vers_key" ON "project_workflow_stage_dependency_version"("project_plan_version_id", "predecessor_workflow_stage_id", "successor_workflow_stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_workflow_stage_dependency_version_project_id_id_key" ON "project_workflow_stage_dependency_version"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_update_correction_workflow_update_id_sequence_no_key" ON "workflow_update_correction"("workflow_update_id", "sequence_no");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_update_correction_project_id_id_key" ON "workflow_update_correction"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_completion_request_current_submission_id_key" ON "workflow_completion_request"("current_submission_id");

-- CreateIndex
CREATE INDEX "workflow_completion_request_project_id_status_created_at_idx" ON "workflow_completion_request"("project_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "workflow_completion_request_project_workflow_stage_id_statu_idx" ON "workflow_completion_request"("project_workflow_stage_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_completion_request_project_id_id_key" ON "workflow_completion_request"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_completion_submission_completion_request_id_submis_key" ON "workflow_completion_submission"("completion_request_id", "submission_no");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_completion_submission_project_id_id_key" ON "workflow_completion_submission"("project_id", "id");

-- CreateIndex
CREATE INDEX "workflow_completion_supplement_completion_request_id_added__idx" ON "workflow_completion_supplement"("completion_request_id", "added_at");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_completion_supplement_project_id_id_key" ON "workflow_completion_supplement"("project_id", "id");

-- CreateIndex
CREATE INDEX "workflow_completion_review_round_status_due_at_idx" ON "workflow_completion_review_round"("status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_completion_review_round_completion_request_id_roun_key" ON "workflow_completion_review_round"("completion_request_id", "round_no");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_completion_review_round_project_id_id_key" ON "workflow_completion_review_round"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_completion_review_pause_review_round_id_pause_no_key" ON "workflow_completion_review_pause"("review_round_id", "pause_no");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_completion_review_pause_project_id_id_key" ON "workflow_completion_review_pause"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_completion_activity_completion_request_id_sequence_key" ON "workflow_completion_activity"("completion_request_id", "sequence_no");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_completion_activity_project_id_id_key" ON "workflow_completion_activity"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_decision_round_issue_id_round_no_key" ON "issue_decision_round"("issue_id", "round_no");

-- CreateIndex
CREATE UNIQUE INDEX "issue_decision_round_project_id_issue_id_id_key" ON "issue_decision_round"("project_id", "issue_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_decision_round_project_id_id_key" ON "issue_decision_round"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_dean_decision_decision_round_id_key" ON "issue_dean_decision"("decision_round_id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_dean_decision_project_id_id_key" ON "issue_dean_decision"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_dean_decision_project_id_decision_round_id_key" ON "issue_dean_decision"("project_id", "decision_round_id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_implementation_submission_decision_round_id_submissio_key" ON "issue_implementation_submission"("decision_round_id", "submission_no");

-- CreateIndex
CREATE UNIQUE INDEX "issue_implementation_submission_project_id_id_key" ON "issue_implementation_submission"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_implementation_review_implementation_submission_id_key" ON "issue_implementation_review"("implementation_submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_implementation_review_project_id_id_key" ON "issue_implementation_review"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_implementation_review_project_id_implementation_submi_key" ON "issue_implementation_review"("project_id", "implementation_submission_id");

-- CreateIndex
CREATE INDEX "issue_dean_review_transfer_decision_round_id_accepted_at_idx" ON "issue_dean_review_transfer"("decision_round_id", "accepted_at");

-- CreateIndex
CREATE UNIQUE INDEX "issue_dean_review_transfer_project_id_id_key" ON "issue_dean_review_transfer"("project_id", "id");

-- CreateIndex
CREATE INDEX "issue_shared_summary_issue_id_published_at_idx" ON "issue_shared_summary"("issue_id", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "issue_shared_summary_project_id_id_key" ON "issue_shared_summary"("project_id", "id");

-- CreateIndex
CREATE INDEX "collaboration_time_limit_setting_responsibility_type_idx" ON "collaboration_time_limit_setting"("responsibility_type");

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_time_limit_setting_project_id_responsibility__key" ON "collaboration_time_limit_setting"("project_id", "responsibility_type");

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_event_key_key" ON "notification_outbox"("event_key");

-- CreateIndex
CREATE INDEX "notification_outbox_status_next_attempt_at_idx" ON "notification_outbox"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_attempt_outbox_id_attempt_no_key" ON "notification_outbox_attempt"("outbox_id", "attempt_no");

-- CreateIndex
CREATE INDEX "attachment_draft_status_last_activity_at_idx" ON "attachment_draft"("status", "last_activity_at");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_draft_project_id_id_key" ON "attachment_draft"("project_id", "id");

-- CreateIndex
CREATE INDEX "attachment_upload_session_status_expires_at_idx" ON "attachment_upload_session"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_upload_session_project_id_id_key" ON "attachment_upload_session"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_upload_session_uploader_person_id_idempotency_key_key" ON "attachment_upload_session"("uploader_person_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "file_asset_storage_object_key_key" ON "file_asset"("storage_object_key");

-- CreateIndex
CREATE INDEX "file_asset_attachment_upload_session_id_status_idx" ON "file_asset"("attachment_upload_session_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "file_asset_project_id_id_key" ON "file_asset"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "business_attachment_file_asset_id_key" ON "business_attachment"("file_asset_id");

-- CreateIndex
CREATE INDEX "business_attachment_workflow_update_id_idx" ON "business_attachment"("workflow_update_id");

-- CreateIndex
CREATE INDEX "business_attachment_workflow_completion_submission_id_idx" ON "business_attachment"("workflow_completion_submission_id");

-- CreateIndex
CREATE INDEX "business_attachment_issue_id_idx" ON "business_attachment"("issue_id");

-- CreateIndex
CREATE INDEX "business_attachment_project_completion_submission_version_i_idx" ON "business_attachment"("project_completion_submission_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_attachment_project_id_id_key" ON "business_attachment"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "business_attachment_project_id_file_asset_id_key" ON "business_attachment"("project_id", "file_asset_id");

-- CreateIndex
CREATE INDEX "attachment_cleanup_run_started_at_idx" ON "attachment_cleanup_run"("started_at");

-- CreateIndex
CREATE INDEX "issue_project_completion_request_id_resolved_at_closed_at_idx" ON "issue"("project_completion_request_id", "resolved_at", "closed_at");

-- CreateIndex
CREATE UNIQUE INDEX "issue_activity_issue_id_sequence_no_key" ON "issue_activity"("issue_id", "sequence_no");

-- CreateIndex
CREATE UNIQUE INDEX "issue_handling_state_issue_id_responsibility_round_no_key" ON "issue_handling_state"("issue_id", "responsibility_round_no");

-- CreateIndex
CREATE INDEX "notification_recipient_person_id_read_status_created_at_idx" ON "notification"("recipient_person_id", "read_status", "created_at");

-- CreateIndex
CREATE INDEX "notification_recipient_person_id_action_status_created_at_idx" ON "notification"("recipient_person_id", "action_status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_completion_check_review_round_id_check_code_key" ON "project_completion_check"("review_round_id", "check_code");

-- CreateIndex
CREATE UNIQUE INDEX "project_completion_check_project_id_id_key" ON "project_completion_check"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "project_completion_request_current_submission_version_id_key" ON "project_completion_request"("current_submission_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_stage_template_template_version_id_id_key" ON "workflow_stage_template"("template_version_id", "id");

-- CreateIndex
CREATE INDEX "workflow_update_project_id_submitted_at_idx" ON "workflow_update"("project_id", "submitted_at");

-- AddForeignKey
ALTER TABLE "project_completion_request" ADD CONSTRAINT "project_completion_request_current_submission_version_id_fkey" FOREIGN KEY ("current_submission_version_id") REFERENCES "project_completion_submission_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_check" ADD CONSTRAINT "project_completion_check_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_check" ADD CONSTRAINT "project_completion_check_project_id_review_round_id_fkey" FOREIGN KEY ("project_id", "review_round_id") REFERENCES "project_completion_review_round"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_submission_version" ADD CONSTRAINT "project_completion_submission_version_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_submission_version" ADD CONSTRAINT "project_completion_submission_version_project_id_completio_fkey" FOREIGN KEY ("project_id", "completion_request_id") REFERENCES "project_completion_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_submission_version" ADD CONSTRAINT "project_completion_submission_version_submitted_by_person__fkey" FOREIGN KEY ("submitted_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_review_round" ADD CONSTRAINT "project_completion_review_round_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_review_round" ADD CONSTRAINT "project_completion_review_round_project_id_completion_requ_fkey" FOREIGN KEY ("project_id", "completion_request_id") REFERENCES "project_completion_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_review_round" ADD CONSTRAINT "project_completion_review_round_completed_by_person_id_fkey" FOREIGN KEY ("completed_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_supplement_round" ADD CONSTRAINT "project_completion_supplement_round_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_supplement_round" ADD CONSTRAINT "project_completion_supplement_round_project_id_completion__fkey" FOREIGN KEY ("project_id", "completion_request_id") REFERENCES "project_completion_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_supplement_round" ADD CONSTRAINT "project_completion_supplement_round_responsible_person_id_fkey" FOREIGN KEY ("responsible_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_block" ADD CONSTRAINT "project_completion_block_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_block" ADD CONSTRAINT "project_completion_block_project_id_completion_request_id_fkey" FOREIGN KEY ("project_id", "completion_request_id") REFERENCES "project_completion_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_block" ADD CONSTRAINT "project_completion_block_project_id_source_workflow_stage__fkey" FOREIGN KEY ("project_id", "source_workflow_stage_id") REFERENCES "project_workflow_stage"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_block" ADD CONSTRAINT "project_completion_block_project_id_source_issue_id_fkey" FOREIGN KEY ("project_id", "source_issue_id") REFERENCES "issue"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_archive_activity" ADD CONSTRAINT "project_archive_activity_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_archive_activity" ADD CONSTRAINT "project_archive_activity_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_stage_template" ADD CONSTRAINT "workflow_stage_template_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "lifecycle_template_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_stage_template_dependency" ADD CONSTRAINT "workflow_stage_template_dependency_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "lifecycle_template_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_stage_template_dependency" ADD CONSTRAINT "workflow_stage_template_dependency_template_version_id_pre_fkey" FOREIGN KEY ("template_version_id", "predecessor_workflow_stage_template_id") REFERENCES "workflow_stage_template"("template_version_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_stage_template_dependency" ADD CONSTRAINT "workflow_stage_template_dependency_template_version_id_suc_fkey" FOREIGN KEY ("template_version_id", "successor_workflow_stage_template_id") REFERENCES "workflow_stage_template"("template_version_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_workflow_stage_dependency_version" ADD CONSTRAINT "project_workflow_stage_dependency_version_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_workflow_stage_dependency_version" ADD CONSTRAINT "project_workflow_stage_dependency_version_project_plan_ver_fkey" FOREIGN KEY ("project_plan_version_id") REFERENCES "project_plan_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_workflow_stage_dependency_version" ADD CONSTRAINT "project_workflow_stage_dependency_version_project_id_prede_fkey" FOREIGN KEY ("project_id", "predecessor_workflow_stage_id") REFERENCES "project_workflow_stage"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_workflow_stage_dependency_version" ADD CONSTRAINT "project_workflow_stage_dependency_version_project_id_succe_fkey" FOREIGN KEY ("project_id", "successor_workflow_stage_id") REFERENCES "project_workflow_stage"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_update_correction" ADD CONSTRAINT "workflow_update_correction_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_update_correction" ADD CONSTRAINT "workflow_update_correction_workflow_update_id_project_id_fkey" FOREIGN KEY ("workflow_update_id", "project_id") REFERENCES "workflow_update"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_update_correction" ADD CONSTRAINT "workflow_update_correction_corrected_by_person_id_fkey" FOREIGN KEY ("corrected_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_request" ADD CONSTRAINT "workflow_completion_request_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_request" ADD CONSTRAINT "workflow_completion_request_project_id_project_workflow_st_fkey" FOREIGN KEY ("project_id", "project_workflow_stage_id") REFERENCES "project_workflow_stage"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_request" ADD CONSTRAINT "workflow_completion_request_submitted_plan_version_id_fkey" FOREIGN KEY ("submitted_plan_version_id") REFERENCES "project_plan_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_request" ADD CONSTRAINT "workflow_completion_request_current_submission_id_fkey" FOREIGN KEY ("current_submission_id") REFERENCES "workflow_completion_submission"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_request" ADD CONSTRAINT "workflow_completion_request_project_id_terminated_by_plan__fkey" FOREIGN KEY ("project_id", "terminated_by_plan_change_request_id") REFERENCES "project_plan_change_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_submission" ADD CONSTRAINT "workflow_completion_submission_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_submission" ADD CONSTRAINT "workflow_completion_submission_project_id_completion_reque_fkey" FOREIGN KEY ("project_id", "completion_request_id") REFERENCES "workflow_completion_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_submission" ADD CONSTRAINT "workflow_completion_submission_submitted_by_person_id_fkey" FOREIGN KEY ("submitted_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_supplement" ADD CONSTRAINT "workflow_completion_supplement_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_supplement" ADD CONSTRAINT "workflow_completion_supplement_project_id_completion_reque_fkey" FOREIGN KEY ("project_id", "completion_request_id") REFERENCES "workflow_completion_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_supplement" ADD CONSTRAINT "workflow_completion_supplement_project_id_submission_id_fkey" FOREIGN KEY ("project_id", "submission_id") REFERENCES "workflow_completion_submission"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_supplement" ADD CONSTRAINT "workflow_completion_supplement_added_by_person_id_fkey" FOREIGN KEY ("added_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_review_round" ADD CONSTRAINT "workflow_completion_review_round_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_review_round" ADD CONSTRAINT "workflow_completion_review_round_project_id_completion_req_fkey" FOREIGN KEY ("project_id", "completion_request_id") REFERENCES "workflow_completion_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_review_round" ADD CONSTRAINT "workflow_completion_review_round_completed_by_person_id_fkey" FOREIGN KEY ("completed_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_review_pause" ADD CONSTRAINT "workflow_completion_review_pause_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_review_pause" ADD CONSTRAINT "workflow_completion_review_pause_project_id_review_round_i_fkey" FOREIGN KEY ("project_id", "review_round_id") REFERENCES "workflow_completion_review_round"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_activity" ADD CONSTRAINT "workflow_completion_activity_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_activity" ADD CONSTRAINT "workflow_completion_activity_project_id_completion_request_fkey" FOREIGN KEY ("project_id", "completion_request_id") REFERENCES "workflow_completion_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_completion_activity" ADD CONSTRAINT "workflow_completion_activity_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_project_id_project_completion_request_id_fkey" FOREIGN KEY ("project_id", "project_completion_request_id") REFERENCES "project_completion_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_project_id_issue_id_decision_round_id_fkey" FOREIGN KEY ("project_id", "issue_id", "decision_round_id") REFERENCES "issue_decision_round"("project_id", "issue_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_decision_round" ADD CONSTRAINT "issue_decision_round_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_decision_round" ADD CONSTRAINT "issue_decision_round_project_id_issue_id_fkey" FOREIGN KEY ("project_id", "issue_id") REFERENCES "issue"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_decision_round" ADD CONSTRAINT "issue_decision_round_project_id_issue_id_current_handling__fkey" FOREIGN KEY ("project_id", "issue_id", "current_handling_state_id") REFERENCES "issue_handling_state"("project_id", "issue_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_dean_decision" ADD CONSTRAINT "issue_dean_decision_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_dean_decision" ADD CONSTRAINT "issue_dean_decision_project_id_decision_round_id_fkey" FOREIGN KEY ("project_id", "decision_round_id") REFERENCES "issue_decision_round"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_dean_decision" ADD CONSTRAINT "issue_dean_decision_decided_by_person_id_fkey" FOREIGN KEY ("decided_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_implementation_submission" ADD CONSTRAINT "issue_implementation_submission_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_implementation_submission" ADD CONSTRAINT "issue_implementation_submission_project_id_decision_round__fkey" FOREIGN KEY ("project_id", "decision_round_id") REFERENCES "issue_decision_round"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_implementation_submission" ADD CONSTRAINT "issue_implementation_submission_submitted_by_person_id_fkey" FOREIGN KEY ("submitted_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_implementation_review" ADD CONSTRAINT "issue_implementation_review_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_implementation_review" ADD CONSTRAINT "issue_implementation_review_project_id_implementation_subm_fkey" FOREIGN KEY ("project_id", "implementation_submission_id") REFERENCES "issue_implementation_submission"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_implementation_review" ADD CONSTRAINT "issue_implementation_review_reviewed_by_person_id_fkey" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_dean_review_transfer" ADD CONSTRAINT "issue_dean_review_transfer_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_dean_review_transfer" ADD CONSTRAINT "issue_dean_review_transfer_project_id_decision_round_id_fkey" FOREIGN KEY ("project_id", "decision_round_id") REFERENCES "issue_decision_round"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_dean_review_transfer" ADD CONSTRAINT "issue_dean_review_transfer_from_dean_person_id_fkey" FOREIGN KEY ("from_dean_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_dean_review_transfer" ADD CONSTRAINT "issue_dean_review_transfer_requested_by_pmo_person_id_fkey" FOREIGN KEY ("requested_by_pmo_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_dean_review_transfer" ADD CONSTRAINT "issue_dean_review_transfer_accepted_by_dean_person_id_fkey" FOREIGN KEY ("accepted_by_dean_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_shared_summary" ADD CONSTRAINT "issue_shared_summary_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_shared_summary" ADD CONSTRAINT "issue_shared_summary_project_id_issue_id_fkey" FOREIGN KEY ("project_id", "issue_id") REFERENCES "issue"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_shared_summary" ADD CONSTRAINT "issue_shared_summary_project_id_decision_round_id_fkey" FOREIGN KEY ("project_id", "decision_round_id") REFERENCES "issue_decision_round"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_shared_summary" ADD CONSTRAINT "issue_shared_summary_project_id_implementation_submission__fkey" FOREIGN KEY ("project_id", "implementation_submission_id") REFERENCES "issue_implementation_submission"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_shared_summary" ADD CONSTRAINT "issue_shared_summary_published_by_person_id_fkey" FOREIGN KEY ("published_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_workflow_completion_request_id_fkey" FOREIGN KEY ("project_id", "workflow_completion_request_id") REFERENCES "workflow_completion_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_workflow_completion_review_round_i_fkey" FOREIGN KEY ("project_id", "workflow_completion_review_round_id") REFERENCES "workflow_completion_review_round"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_issue_decision_round_id_fkey" FOREIGN KEY ("project_id", "issue_decision_round_id") REFERENCES "issue_decision_round"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_issue_implementation_submission_id_fkey" FOREIGN KEY ("project_id", "issue_implementation_submission_id") REFERENCES "issue_implementation_submission"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_project_completion_review_round_id_fkey" FOREIGN KEY ("project_id", "project_completion_review_round_id") REFERENCES "project_completion_review_round"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_issue_shared_summary_id_fkey" FOREIGN KEY ("project_id", "issue_shared_summary_id") REFERENCES "issue_shared_summary"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_project_archive_activity_id_fkey" FOREIGN KEY ("project_id", "project_archive_activity_id") REFERENCES "project_archive_activity"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "collaboration_time_limit_setting" ADD CONSTRAINT "collaboration_time_limit_setting_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "collaboration_time_limit_setting" ADD CONSTRAINT "collaboration_time_limit_setting_updated_by_person_id_fkey" FOREIGN KEY ("updated_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_person_id_fkey" FOREIGN KEY ("recipient_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification_outbox_attempt" ADD CONSTRAINT "notification_outbox_attempt_outbox_id_fkey" FOREIGN KEY ("outbox_id") REFERENCES "notification_outbox"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachment_draft" ADD CONSTRAINT "attachment_draft_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachment_draft" ADD CONSTRAINT "attachment_draft_uploader_person_id_fkey" FOREIGN KEY ("uploader_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachment_draft" ADD CONSTRAINT "attachment_draft_project_id_project_workflow_stage_id_fkey" FOREIGN KEY ("project_id", "project_workflow_stage_id") REFERENCES "project_workflow_stage"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachment_draft" ADD CONSTRAINT "attachment_draft_project_id_issue_id_fkey" FOREIGN KEY ("project_id", "issue_id") REFERENCES "issue"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachment_draft" ADD CONSTRAINT "attachment_draft_project_id_project_plan_change_request_id_fkey" FOREIGN KEY ("project_id", "project_plan_change_request_id") REFERENCES "project_plan_change_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachment_draft" ADD CONSTRAINT "attachment_draft_project_id_project_field_change_request_i_fkey" FOREIGN KEY ("project_id", "project_field_change_request_id") REFERENCES "project_field_change_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachment_draft" ADD CONSTRAINT "attachment_draft_project_id_project_completion_request_id_fkey" FOREIGN KEY ("project_id", "project_completion_request_id") REFERENCES "project_completion_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachment_upload_session" ADD CONSTRAINT "attachment_upload_session_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachment_upload_session" ADD CONSTRAINT "attachment_upload_session_project_id_attachment_draft_id_fkey" FOREIGN KEY ("project_id", "attachment_draft_id") REFERENCES "attachment_draft"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachment_upload_session" ADD CONSTRAINT "attachment_upload_session_uploader_person_id_fkey" FOREIGN KEY ("uploader_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_project_id_attachment_upload_session_id_fkey" FOREIGN KEY ("project_id", "attachment_upload_session_id") REFERENCES "attachment_upload_session"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_uploaded_by_person_id_fkey" FOREIGN KEY ("uploaded_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "business_attachment" ADD CONSTRAINT "business_attachment_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "business_attachment" ADD CONSTRAINT "business_attachment_project_id_file_asset_id_fkey" FOREIGN KEY ("project_id", "file_asset_id") REFERENCES "file_asset"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "business_attachment" ADD CONSTRAINT "business_attachment_attached_by_person_id_fkey" FOREIGN KEY ("attached_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "business_attachment" ADD CONSTRAINT "business_attachment_project_id_workflow_update_id_fkey" FOREIGN KEY ("project_id", "workflow_update_id") REFERENCES "workflow_update"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "business_attachment" ADD CONSTRAINT "business_attachment_project_id_workflow_completion_submiss_fkey" FOREIGN KEY ("project_id", "workflow_completion_submission_id") REFERENCES "workflow_completion_submission"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "business_attachment" ADD CONSTRAINT "business_attachment_project_id_workflow_completion_supplem_fkey" FOREIGN KEY ("project_id", "workflow_completion_supplement_id") REFERENCES "workflow_completion_supplement"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "business_attachment" ADD CONSTRAINT "business_attachment_project_id_issue_id_fkey" FOREIGN KEY ("project_id", "issue_id") REFERENCES "issue"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "business_attachment" ADD CONSTRAINT "business_attachment_project_id_issue_id_issue_activity_id_fkey" FOREIGN KEY ("project_id", "issue_id", "issue_activity_id") REFERENCES "issue_activity"("project_id", "issue_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "business_attachment" ADD CONSTRAINT "business_attachment_project_id_issue_dean_decision_id_fkey" FOREIGN KEY ("project_id", "issue_dean_decision_id") REFERENCES "issue_dean_decision"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "business_attachment" ADD CONSTRAINT "business_attachment_project_id_issue_implementation_submis_fkey" FOREIGN KEY ("project_id", "issue_implementation_submission_id") REFERENCES "issue_implementation_submission"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "business_attachment" ADD CONSTRAINT "business_attachment_project_id_project_plan_change_request_fkey" FOREIGN KEY ("project_id", "project_plan_change_request_id") REFERENCES "project_plan_change_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "business_attachment" ADD CONSTRAINT "business_attachment_project_plan_change_request_id_project_fkey" FOREIGN KEY ("project_plan_change_request_id", "project_plan_change_activity_id") REFERENCES "project_plan_change_activity"("request_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "business_attachment" ADD CONSTRAINT "business_attachment_project_id_project_field_change_reques_fkey" FOREIGN KEY ("project_id", "project_field_change_request_id") REFERENCES "project_field_change_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "business_attachment" ADD CONSTRAINT "business_attachment_project_field_change_request_id_projec_fkey" FOREIGN KEY ("project_field_change_request_id", "project_field_change_activity_id") REFERENCES "project_field_change_activity"("request_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "business_attachment" ADD CONSTRAINT "business_attachment_project_id_project_completion_submissi_fkey" FOREIGN KEY ("project_id", "project_completion_submission_version_id") REFERENCES "project_completion_submission_version"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Phase 2 constraints not expressible in Prisma Schema.
ALTER TABLE "workflow_stage_template_dependency"
  ADD CONSTRAINT "workflow_stage_template_dependency_no_self_check"
  CHECK ("predecessor_workflow_stage_template_id" <> "successor_workflow_stage_template_id");

ALTER TABLE "project_workflow_stage_dependency_version"
  ADD CONSTRAINT "project_workflow_stage_dependency_no_self_check"
  CHECK ("predecessor_workflow_stage_id" <> "successor_workflow_stage_id");

ALTER TABLE "workflow_update"
  ADD CONSTRAINT "workflow_update_budget_amount_positive_check"
  CHECK ("budget_amount_cny" IS NULL OR "budget_amount_cny" > 0);

ALTER TABLE "workflow_update_correction"
  ADD CONSTRAINT "workflow_update_correction_expected_date_mode_check"
  CHECK (
    ("revised_expected_date_mode" = 'SET' AND "revised_expected_date" IS NOT NULL)
    OR ("revised_expected_date_mode" IN ('KEEP', 'CLEAR') AND "revised_expected_date" IS NULL)
  ),
  ADD CONSTRAINT "workflow_update_correction_budget_mode_check"
  CHECK (
    ("budget_amount_mode" = 'SET' AND "revised_budget_amount_cny" > 0)
    OR ("budget_amount_mode" IN ('KEEP', 'CLEAR') AND "revised_budget_amount_cny" IS NULL)
  );

CREATE UNIQUE INDEX "workflow_completion_request_one_active_per_stage_key"
ON "workflow_completion_request" ("project_workflow_stage_id")
WHERE "status" IN (
  'WAITING_FOR_PREDECESSOR',
  'PENDING_PMO_REVIEW',
  'ISSUE_RESOLUTION_REQUIRED',
  'PREDECESSOR_RETURNED_CONFIRMATION',
  'RETURNED_FOR_RESUBMISSION'
);

CREATE UNIQUE INDEX "workflow_completion_review_round_one_active_key"
ON "workflow_completion_review_round" ("completion_request_id")
WHERE "status" IN ('ACTIVE', 'PAUSED');

CREATE UNIQUE INDEX "project_completion_request_one_active_key"
ON "project_completion_request" ("project_id")
WHERE "status" IN (
  'CLOSURE_BLOCKED',
  'CLOSURE_PENDING_PMO_REVIEW',
  'CLOSURE_RETURNED_FOR_SUPPLEMENT'
);

CREATE UNIQUE INDEX "project_completion_review_round_one_active_key"
ON "project_completion_review_round" ("completion_request_id")
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "project_completion_supplement_round_one_open_key"
ON "project_completion_supplement_round" ("completion_request_id")
WHERE "completed_at" IS NULL;

CREATE UNIQUE INDEX "project_completion_block_one_open_source_key"
ON "project_completion_block" (
  "completion_request_id",
  "block_type",
  "source_workflow_stage_id",
  "source_issue_id",
  "check_code"
) NULLS NOT DISTINCT
WHERE "cleared_at" IS NULL;

CREATE UNIQUE INDEX "collaboration_time_limit_global_scope_key"
ON "collaboration_time_limit_setting" ("responsibility_type")
WHERE "project_id" IS NULL;

ALTER TABLE "collaboration_time_limit_setting"
  ADD CONSTRAINT "collaboration_time_limit_positive_check"
  CHECK ("time_limit_days" > 0 AND "reminder_interval_days" > 0);

ALTER TABLE "notification"
  ADD CONSTRAINT "notification_read_state_check"
  CHECK (
    ("read_status" = 'UNREAD' AND "read_at" IS NULL)
    OR ("read_status" = 'READ' AND "read_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "notification_action_state_check"
  CHECK (
    ("message_kind" = 'INFORMATIONAL'
      AND "action_status" = 'NOT_APPLICABLE'
      AND "action_completed_at" IS NULL
      AND "action_completion_reason" IS NULL)
    OR ("message_kind" = 'ACTION' AND (
      ("action_status" = 'PENDING'
        AND "action_completed_at" IS NULL
        AND "action_completion_reason" IS NULL)
      OR ("action_status" = 'COMPLETED'
        AND "action_completed_at" IS NOT NULL
        AND "action_completion_reason" IS NOT NULL)
    ))
  );

ALTER TABLE "notification_outbox"
  ADD CONSTRAINT "notification_outbox_attempt_limit_check"
  CHECK ("max_attempts" > 0);

ALTER TABLE "issue_dean_decision"
  ADD CONSTRAINT "issue_dean_decision_role_check" CHECK ("decided_role_code" = 'DEAN'),
  ADD CONSTRAINT "issue_dean_decision_other_content_check"
  CHECK (
    "decision_code" <> 'OTHER'
    OR (NULLIF(BTRIM("decision_content"), '') IS NOT NULL
      AND NULLIF(BTRIM("pmo_implementation_instruction"), '') IS NOT NULL)
  );

ALTER TABLE "issue_implementation_submission"
  ADD CONSTRAINT "issue_implementation_submission_role_check"
  CHECK ("submitted_role_code" = 'PMO');

ALTER TABLE "project_completion_submission_version"
  ADD CONSTRAINT "project_completion_submission_role_check"
  CHECK ("submitted_role_code" = 'KEY_SUB_I'),
  ADD CONSTRAINT "project_completion_truth_confirmation_check"
  CHECK ("truth_confirmed");

ALTER TABLE "project_archive_activity"
  ADD CONSTRAINT "project_archive_activity_role_check" CHECK ("actor_role_code" = 'PMO'),
  ADD CONSTRAINT "project_archive_activity_reason_check" CHECK (NULLIF(BTRIM("reason"), '') IS NOT NULL);

ALTER TABLE "project"
  ADD CONSTRAINT "project_formal_not_cancelled_check"
  CHECK ("project_code" IS NULL OR "status" <> 'CANCELLED'),
  ADD CONSTRAINT "project_archive_state_check"
  CHECK (
    ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
    OR ("status" <> 'ARCHIVED' AND "archived_at" IS NULL)
  );

ALTER TABLE "attachment_draft"
  ADD CONSTRAINT "attachment_draft_context_check"
  CHECK (NUM_NONNULLS(
    "project_workflow_stage_id",
    "issue_id",
    "project_plan_change_request_id",
    "project_field_change_request_id",
    "project_completion_request_id"
  ) = 1),
  ADD CONSTRAINT "attachment_draft_expiry_check"
  CHECK ("expires_at" > "created_at" AND "last_activity_at" >= "created_at");

ALTER TABLE "attachment_upload_session"
  ADD CONSTRAINT "attachment_upload_session_expiry_check"
  CHECK ("expires_at" > "created_at" AND "last_activity_at" >= "created_at");

ALTER TABLE "file_asset"
  ADD CONSTRAINT "file_asset_size_check" CHECK ("size_bytes" >= 0),
  ADD CONSTRAINT "file_asset_state_check"
  CHECK (
    ("status" = 'UPLOADING'
      AND "available_at" IS NULL AND "rejected_at" IS NULL AND "removed_at" IS NULL)
    OR ("status" = 'AVAILABLE'
      AND "available_at" IS NOT NULL AND "rejected_at" IS NULL AND "removed_at" IS NULL)
    OR ("status" = 'REJECTED'
      AND "rejected_at" IS NOT NULL AND NULLIF(BTRIM("rejection_code"), '') IS NOT NULL
      AND "available_at" IS NULL AND "removed_at" IS NULL)
    OR ("status" = 'REMOVED'
      AND "removed_at" IS NOT NULL AND "removal_reason" IS NOT NULL)
  );

ALTER TABLE "business_attachment"
  ADD CONSTRAINT "business_attachment_exactly_one_parent_check"
  CHECK (NUM_NONNULLS(
    "workflow_update_id",
    "workflow_completion_submission_id",
    "workflow_completion_supplement_id",
    "issue_id",
    "issue_dean_decision_id",
    "issue_implementation_submission_id",
    "project_plan_change_request_id",
    "project_field_change_request_id",
    "project_completion_submission_version_id"
  ) = 1),
  ADD CONSTRAINT "business_attachment_parent_type_check"
  CHECK (
    ("parent_type" = 'WORKFLOW_UPDATE' AND "workflow_update_id" IS NOT NULL)
    OR ("parent_type" = 'WORKFLOW_COMPLETION_SUBMISSION' AND "workflow_completion_submission_id" IS NOT NULL)
    OR ("parent_type" = 'WORKFLOW_COMPLETION_SUPPLEMENT' AND "workflow_completion_supplement_id" IS NOT NULL)
    OR ("parent_type" = 'ISSUE' AND "issue_id" IS NOT NULL AND "issue_activity_id" IS NULL)
    OR ("parent_type" = 'ISSUE_ACTIVITY' AND "issue_id" IS NOT NULL AND "issue_activity_id" IS NOT NULL)
    OR ("parent_type" = 'ISSUE_DEAN_DECISION' AND "issue_dean_decision_id" IS NOT NULL)
    OR ("parent_type" = 'ISSUE_IMPLEMENTATION_SUBMISSION' AND "issue_implementation_submission_id" IS NOT NULL)
    OR ("parent_type" = 'PROJECT_PLAN_CHANGE_REQUEST' AND "project_plan_change_request_id" IS NOT NULL AND "project_plan_change_activity_id" IS NULL)
    OR ("parent_type" = 'PROJECT_PLAN_CHANGE_ACTIVITY' AND "project_plan_change_request_id" IS NOT NULL AND "project_plan_change_activity_id" IS NOT NULL)
    OR ("parent_type" = 'PROJECT_FIELD_CHANGE_REQUEST' AND "project_field_change_request_id" IS NOT NULL AND "project_field_change_activity_id" IS NULL)
    OR ("parent_type" = 'PROJECT_FIELD_CHANGE_ACTIVITY' AND "project_field_change_request_id" IS NOT NULL AND "project_field_change_activity_id" IS NOT NULL)
    OR ("parent_type" = 'PROJECT_COMPLETION_SUBMISSION_VERSION' AND "project_completion_submission_version_id" IS NOT NULL)
  );

-- Enforce scope that requires looking through stable parent rows.
CREATE OR REPLACE FUNCTION "validate_phase2_relation_scope"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'project_workflow_stage_dependency_version' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "project_workflow_stage_version" v
      JOIN "project_workflow_stage" s ON s."id" = v."project_workflow_stage_id"
      WHERE v."project_plan_version_id" = NEW."project_plan_version_id"
        AND s."project_id" = NEW."project_id"
        AND s."id" = NEW."predecessor_workflow_stage_id"
    ) OR NOT EXISTS (
      SELECT 1 FROM "project_workflow_stage_version" v
      JOIN "project_workflow_stage" s ON s."id" = v."project_workflow_stage_id"
      WHERE v."project_plan_version_id" = NEW."project_plan_version_id"
        AND s."project_id" = NEW."project_id"
        AND s."id" = NEW."successor_workflow_stage_id"
    ) THEN
      RAISE EXCEPTION 'PHASE2_DEPENDENCY_ENDPOINT_OUT_OF_PLAN_SCOPE';
    END IF;
  ELSIF TG_TABLE_NAME = 'workflow_completion_request' THEN
    IF NEW."current_submission_id" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "workflow_completion_submission" s
        WHERE s."id" = NEW."current_submission_id"
          AND s."project_id" = NEW."project_id"
          AND s."completion_request_id" = NEW."id"
      ) THEN
        RAISE EXCEPTION 'PHASE2_COMPLETION_CURRENT_SUBMISSION_SCOPE_MISMATCH';
    END IF;
  ELSIF TG_TABLE_NAME = 'project_completion_request' THEN
    IF NEW."current_submission_version_id" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "project_completion_submission_version" s
        WHERE s."id" = NEW."current_submission_version_id"
          AND s."project_id" = NEW."project_id"
          AND s."completion_request_id" = NEW."id"
      ) THEN
        RAISE EXCEPTION 'PHASE2_PROJECT_COMPLETION_CURRENT_SUBMISSION_SCOPE_MISMATCH';
    END IF;
  ELSIF TG_TABLE_NAME = 'attachment_upload_session' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "attachment_draft" d
      WHERE d."id" = NEW."attachment_draft_id"
        AND d."project_id" = NEW."project_id"
        AND d."uploader_person_id" = NEW."uploader_person_id"
    ) THEN
      RAISE EXCEPTION 'PHASE2_UPLOAD_SESSION_SCOPE_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "project_workflow_stage_dependency_scope_trigger"
BEFORE INSERT OR UPDATE ON "project_workflow_stage_dependency_version"
FOR EACH ROW EXECUTE FUNCTION "validate_phase2_relation_scope"();

CREATE TRIGGER "workflow_completion_current_submission_scope_trigger"
BEFORE INSERT OR UPDATE OF "current_submission_id" ON "workflow_completion_request"
FOR EACH ROW EXECUTE FUNCTION "validate_phase2_relation_scope"();

CREATE TRIGGER "project_completion_current_submission_scope_trigger"
BEFORE INSERT OR UPDATE OF "current_submission_version_id" ON "project_completion_request"
FOR EACH ROW EXECUTE FUNCTION "validate_phase2_relation_scope"();

CREATE TRIGGER "attachment_upload_session_scope_trigger"
BEFORE INSERT OR UPDATE ON "attachment_upload_session"
FOR EACH ROW EXECUTE FUNCTION "validate_phase2_relation_scope"();
