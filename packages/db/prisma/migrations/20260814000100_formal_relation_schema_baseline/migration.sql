-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('DEAN', 'PMO', 'KEY_SUB_I', 'CRC', 'STATISTICIAN', 'COLLABORATION_LEAD');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('INVITED', 'ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'PENDING_ESTABLISHMENT_REVIEW', 'RETURNED_FOR_REVISION', 'ON_HOLD', 'ACTIVE', 'CLOSING', 'COMPLETED', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EstablishmentDecision" AS ENUM ('PENDING', 'RETURNED', 'PAUSED', 'APPROVED');

-- CreateEnum
CREATE TYPE "CompletionRequestStatus" AS ENUM ('DRAFT', 'PENDING_PMO_REVIEW', 'RETURNED_FOR_REVISION', 'ON_HOLD', 'APPROVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CompletionCheckResult" AS ENUM ('PASSED', 'FAILED', 'EXCEPTION_DECLARED');

-- CreateEnum
CREATE TYPE "CompletionActivityType" AS ENUM ('SUBMITTED', 'RETURNED', 'RESUBMITTED', 'PAUSED', 'REVIEW_RESUMED', 'WITHDRAWN', 'TERMINATED_BY_PMO', 'APPROVED');

-- CreateEnum
CREATE TYPE "FieldChangeCategory" AS ENUM ('PROJECT_STATUS', 'ETHICS', 'REGISTRATION', 'CONTRACT', 'FUNDING_AND_BUDGET', 'TARGET_SAMPLE_SIZE');

-- CreateEnum
CREATE TYPE "FieldChangeRequestStatus" AS ENUM ('DRAFT', 'PENDING_PMO_REVIEW', 'RETURNED_FOR_REVISION', 'ON_HOLD', 'PENDING_DEAN_DECISION', 'PENDING_PMO_IMPLEMENTATION', 'PENDING_PMO_APPLICATION', 'DEAN_REJECTED_PENDING_PMO_DISPOSITION', 'APPLIED', 'STALE', 'CLOSED');

-- CreateEnum
CREATE TYPE "FieldChangeActivityType" AS ENUM ('SUBMITTED', 'RETURNED', 'RESUBMITTED', 'PAUSED', 'REVIEW_RESUMED', 'PMO_APPLIED', 'ESCALATED_TO_DEAN', 'DEAN_APPROVED', 'DEAN_RETURNED', 'DEAN_REJECTED', 'PMO_IMPLEMENTATION_PROGRESS_RECORDED', 'PMO_IMPLEMENTATION_CONFIRMED', 'APPLIED', 'MARKED_STALE', 'CLOSED', 'SUPERSEDED_BY_NEW_REQUEST');

-- CreateEnum
CREATE TYPE "LifecycleTemplateStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "LifecycleTemplateVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ProjectPlanVersionStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'SUPERSEDED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "PlanChangeRequestStatus" AS ENUM ('DRAFT', 'PENDING_PMO_REVIEW', 'PENDING_PRIMARY_KEY_SUB_I_REVIEW', 'RETURNED_FOR_REVISION', 'ON_HOLD', 'PENDING_DEAN_DECISION', 'PENDING_PMO_IMPLEMENTATION', 'PENDING_PMO_ACTIVATION', 'DEAN_REJECTED_PENDING_PMO_DISPOSITION', 'ACTIVATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PlanChangeActivityType" AS ENUM ('SUBMITTED', 'RETURNED', 'RESUBMITTED', 'PAUSED', 'REVIEW_RESUMED', 'PMO_APPROVED', 'PRIMARY_KEY_SUB_I_APPROVED', 'PRIMARY_KEY_SUB_I_RETURNED', 'ESCALATED_TO_DEAN', 'DEAN_APPROVED', 'DEAN_RETURNED', 'DEAN_REJECTED', 'PMO_IMPLEMENTATION_PROGRESS_RECORDED', 'PMO_IMPLEMENTATION_CONFIRMED', 'ACTIVATED', 'CLOSED', 'SUPERSEDED_BY_NEW_REQUEST');

-- CreateEnum
CREATE TYPE "WorkflowType" AS ENUM ('STANDARD', 'PROJECT_CUSTOM');

-- CreateEnum
CREATE TYPE "WorkflowExecutionStatus" AS ENUM ('NOT_STARTED', 'ACTIVE', 'PENDING_COMPLETION_CONFIRMATION', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WorkflowUpdateType" AS ENUM ('PROGRESS_UPDATE', 'COMPLETION_REQUEST', 'COMPLETION_RESUBMISSION', 'CORRECTION');

-- CreateEnum
CREATE TYPE "WorkflowReviewStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'RETURNED', 'APPROVED');

-- CreateEnum
CREATE TYPE "WorkflowReviewDecision" AS ENUM ('APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('NONE', 'RISK', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ResolutionMethod" AS ENUM ('REPORTER_CONFIRMED', 'PMO_PROXY_CONFIRMED');

-- CreateEnum
CREATE TYPE "InvalidCloseReason" AS ENUM ('DUPLICATE', 'INVALID', 'INCORRECT', 'OUT_OF_SCOPE', 'CREATED_BY_MISTAKE');

-- CreateEnum
CREATE TYPE "IssueHandlingStateCode" AS ENUM ('PMO_INITIAL_REVIEW', 'REPORTER_SUPPLEMENT', 'PMO_COORDINATION', 'DEAN_DECISION', 'PMO_DECISION_SUPPLEMENT', 'PMO_IMPLEMENTATION', 'DEAN_IMPLEMENTATION_CONFIRMATION', 'REPORTER_RESOLUTION_CONFIRMATION', 'RESOLVED', 'CLOSED_INVALID');

-- CreateEnum
CREATE TYPE "IssueActivityType" AS ENUM ('REPORTER_SUPPLEMENT', 'PMO_INTERNAL_NOTE', 'PMO_COORDINATION_UPDATE', 'PROCESSING_SUMMARY_SHARED', 'RISK_LEVEL_CHANGED', 'ISSUE_TYPE_CHANGED', 'DEAN_DECISION_RECORDED', 'PMO_IMPLEMENTATION_UPDATE', 'DEAN_IMPLEMENTATION_REVIEWED', 'REPORTER_RESOLUTION_RESPONSE', 'INVALID_CLOSURE_RECORDED', 'RELATED_ISSUE_CREATED');

-- CreateEnum
CREATE TYPE "IssueVisibilityScope" AS ENUM ('PMO_ONLY', 'PMO_AND_DEAN', 'ISSUE_PARTICIPANTS');

-- CreateEnum
CREATE TYPE "ExternalContactStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "IssueEmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'PARTIALLY_FAILED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailRecipientType" AS ENUM ('TO', 'CC');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailAttemptStatus" AS ENUM ('SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ISSUE_MESSAGE', 'WORKFLOW_FILL_REMINDER', 'MILESTONE_UPCOMING_REMINDER', 'MILESTONE_OVERDUE_REMINDER', 'PROJECT_REVIEW_NOTICE', 'WORKFLOW_REVIEW_NOTICE', 'SYSTEM_NOTICE');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "AuditStorageTier" AS ENUM ('ONLINE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExportType" AS ENUM ('PROJECT_LEDGER_XLSX', 'DEAN_ONE_PAGE_PDF');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReminderRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIALLY_FAILED', 'FAILED');

-- CreateTable
CREATE TABLE "person" (
    "id" UUID NOT NULL,
    "employee_no" TEXT,
    "display_name" TEXT NOT NULL,
    "login_name" TEXT NOT NULL,
    "work_email" TEXT,
    "mobile" TEXT,
    "password_hash" TEXT NOT NULL,
    "department_name" TEXT,
    "account_status" "AccountStatus" NOT NULL DEFAULT 'INVITED',
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "active_role_code" "RoleCode",
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_assignment" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "role_code" "RoleCode" NOT NULL,
    "project_id" UUID,
    "assignment_status" "AssignmentStatus" NOT NULL DEFAULT 'PROPOSED',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "granted_by_person_id" UUID NOT NULL,
    "proposed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" UUID NOT NULL,
    "project_code" TEXT,
    "project_name" TEXT NOT NULL,
    "project_summary" TEXT NOT NULL,
    "applicant_person_id" UUID NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "row_version" INTEGER NOT NULL DEFAULT 0,
    "lead_organization_name" TEXT,
    "sponsor_name" TEXT,
    "principal_investigator_display_text" TEXT,
    "contract_summary" TEXT,
    "disease_area_dictionary_code" TEXT NOT NULL DEFAULT 'DISEASE_AREA',
    "disease_area_option_id" UUID NOT NULL,
    "research_type_dictionary_code" TEXT NOT NULL DEFAULT 'RESEARCH_TYPE',
    "research_type_option_id" UUID NOT NULL,
    "priority_dictionary_code" TEXT NOT NULL DEFAULT 'PROJECT_PRIORITY',
    "priority_option_id" UUID NOT NULL,
    "planned_start_date" DATE,
    "planned_end_date" DATE,
    "target_sample_size" INTEGER,
    "enrolled_count" INTEGER,
    "contract_status_dictionary_code" TEXT NOT NULL DEFAULT 'CONTRACT_STATUS',
    "contract_status_option_id" UUID,
    "ethics_status_dictionary_code" TEXT NOT NULL DEFAULT 'ETHICS_STATUS',
    "ethics_status_option_id" UUID,
    "ethics_approval_number" TEXT,
    "registration_status_dictionary_code" TEXT NOT NULL DEFAULT 'REGISTRATION_STATUS',
    "registration_status_option_id" UUID,
    "registration_number" TEXT,
    "funding_status_dictionary_code" TEXT NOT NULL DEFAULT 'FUNDING_STATUS',
    "funding_status_option_id" UUID,
    "budget_total" DECIMAL(14,2),
    "budget_used" DECIMAL(14,2),
    "budget_currency_code" TEXT,
    "established_by_person_id" UUID,
    "established_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "pre_archive_status" "ProjectStatus",
    "cancelled_at" TIMESTAMPTZ(3),
    "cancellation_reason" TEXT,
    "cancelled_by_person_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_collaborating_center" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "center_name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_collaborating_center_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_establishment_review" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "submission_no" INTEGER NOT NULL,
    "submitted_by_person_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "decision" "EstablishmentDecision" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_person_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_comment" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_establishment_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_completion_request" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "previous_request_id" UUID,
    "status" "CompletionRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_by_person_id" UUID NOT NULL,
    "submitted_role_code" "RoleCode" NOT NULL DEFAULT 'KEY_SUB_I',
    "completion_summary" TEXT NOT NULL,
    "exception_statement" TEXT,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "reviewed_by_person_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_comment" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_completion_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_completion_check" (
    "id" UUID NOT NULL,
    "completion_request_id" UUID NOT NULL,
    "check_code" TEXT NOT NULL,
    "result" "CompletionCheckResult" NOT NULL,
    "result_summary" TEXT NOT NULL,
    "checked_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_completion_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_completion_activity" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "completion_request_id" UUID NOT NULL,
    "activity_type" "CompletionActivityType" NOT NULL,
    "actor_person_id" UUID NOT NULL,
    "actor_role_code" "RoleCode" NOT NULL,
    "content" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_completion_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_primary_key_sub_i_change" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "previous_role_assignment_id" UUID,
    "new_role_assignment_id" UUID NOT NULL,
    "change_reason" TEXT NOT NULL,
    "changed_by_person_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_primary_key_sub_i_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_field_change_request" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "previous_request_id" UUID,
    "change_category" "FieldChangeCategory" NOT NULL,
    "project_row_version_snapshot" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "FieldChangeRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_by_person_id" UUID NOT NULL,
    "submitted_role_code" "RoleCode" NOT NULL,
    "governance_escalation_required" BOOLEAN NOT NULL DEFAULT false,
    "governance_evaluation_summary" TEXT NOT NULL,
    "governance_setting_updated_at" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "applied_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_field_change_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_field_change_item" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "field_code" TEXT NOT NULL,
    "old_value_text" TEXT,
    "new_value_text" TEXT,
    "old_option_id" UUID,
    "new_option_id" UUID,
    "old_number_value" DECIMAL(18,4),
    "new_number_value" DECIMAL(18,4),
    "old_date_value" DATE,
    "new_date_value" DATE,

    CONSTRAINT "project_field_change_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_field_change_activity" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "activity_type" "FieldChangeActivityType" NOT NULL,
    "actor_person_id" UUID NOT NULL,
    "actor_role_code" "RoleCode" NOT NULL,
    "content" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_field_change_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_governance_setting" (
    "id" UUID NOT NULL,
    "suspension_days_threshold" INTEGER,
    "budget_change_ratio_threshold" DECIMAL(7,6),
    "budget_change_amount_threshold" DECIMAL(14,2),
    "sample_size_change_ratio_threshold" DECIMAL(7,6),
    "sample_size_change_amount_threshold" INTEGER,
    "updated_by_person_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_governance_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_template" (
    "id" UUID NOT NULL,
    "template_code" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "status" "LifecycleTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lifecycle_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_template_version" (
    "id" UUID NOT NULL,
    "lifecycle_template_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "status" "LifecycleTemplateVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "published_by_person_id" UUID,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lifecycle_template_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_template" (
    "id" UUID NOT NULL,
    "template_version_id" UUID NOT NULL,
    "stage_code" TEXT NOT NULL,
    "stage_name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "required_by_default" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "stage_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_template" (
    "id" UUID NOT NULL,
    "template_version_id" UUID NOT NULL,
    "workflow_code" TEXT NOT NULL,
    "workflow_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "required_by_default" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "workflow_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_stage_template" (
    "id" UUID NOT NULL,
    "workflow_template_id" UUID NOT NULL,
    "stage_template_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "default_task" TEXT NOT NULL,
    "default_owner_role" "RoleCode" NOT NULL,

    CONSTRAINT "workflow_stage_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_plan" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_plan_version" (
    "id" UUID NOT NULL,
    "project_plan_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "base_version_id" UUID,
    "template_version_id" UUID NOT NULL,
    "status" "ProjectPlanVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_person_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMPTZ(3),

    CONSTRAINT "project_plan_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_plan_change_request" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "project_plan_id" UUID NOT NULL,
    "candidate_plan_version_id" UUID NOT NULL,
    "previous_request_id" UUID,
    "change_reason" TEXT NOT NULL,
    "status" "PlanChangeRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_by_person_id" UUID NOT NULL,
    "submitted_role_code" "RoleCode" NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "activated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_plan_change_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_plan_change_activity" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "activity_type" "PlanChangeActivityType" NOT NULL,
    "actor_person_id" UUID NOT NULL,
    "actor_role_code" "RoleCode" NOT NULL,
    "content" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_plan_change_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_stage" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "project_plan_id" UUID NOT NULL,
    "source_stage_template_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_stage_version" (
    "id" UUID NOT NULL,
    "project_plan_version_id" UUID NOT NULL,
    "project_stage_id" UUID NOT NULL,
    "stage_code" TEXT NOT NULL,
    "stage_name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "planned_start_date" DATE NOT NULL,
    "planned_end_date" DATE NOT NULL,

    CONSTRAINT "project_stage_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_workflow" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "project_plan_id" UUID NOT NULL,
    "source_workflow_template_id" UUID,
    "workflow_type" "WorkflowType" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_workflow_version" (
    "id" UUID NOT NULL,
    "project_plan_version_id" UUID NOT NULL,
    "project_workflow_id" UUID NOT NULL,
    "workflow_code" TEXT NOT NULL,
    "workflow_name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "project_workflow_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_workflow_stage" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "project_plan_id" UUID NOT NULL,
    "project_workflow_id" UUID NOT NULL,
    "project_stage_id" UUID NOT NULL,
    "execution_status" "WorkflowExecutionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "next_update_due_date" DATE,
    "actual_start_at" TIMESTAMPTZ(3),
    "actual_end_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_workflow_stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_workflow_stage_version" (
    "id" UUID NOT NULL,
    "project_plan_version_id" UUID NOT NULL,
    "project_workflow_stage_id" UUID NOT NULL,
    "task_name" TEXT NOT NULL,
    "task_description" TEXT NOT NULL,
    "planned_start_date" DATE NOT NULL,
    "planned_end_date" DATE NOT NULL,
    "update_interval_days" INTEGER,
    "overdue_reminder_interval_days" INTEGER NOT NULL DEFAULT 7,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "project_workflow_stage_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_workflow_stage_role_version" (
    "id" UUID NOT NULL,
    "project_workflow_stage_version_id" UUID NOT NULL,
    "role_code" "RoleCode" NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "project_workflow_stage_role_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_workflow_stage_reminder_point_version" (
    "id" UUID NOT NULL,
    "project_workflow_stage_version_id" UUID NOT NULL,
    "days_before" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "project_workflow_stage_reminder_point_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_reminder_setting" (
    "project_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "fill_reminder_enabled" BOOLEAN NOT NULL DEFAULT true,
    "include_pmo_on_fill_reminder" BOOLEAN NOT NULL DEFAULT false,
    "milestone_upcoming_enabled" BOOLEAN NOT NULL DEFAULT true,
    "milestone_overdue_enabled" BOOLEAN NOT NULL DEFAULT true,
    "include_pmo_on_overdue" BOOLEAN NOT NULL DEFAULT true,
    "exception_digest_enabled" BOOLEAN NOT NULL DEFAULT true,
    "exception_digest_weekday" INTEGER,
    "exception_digest_time" TIME(0),
    "include_dean_on_blocked_digest" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_person_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_reminder_setting_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "workflow_update" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "project_workflow_stage_id" UUID NOT NULL,
    "submitted_by_person_id" UUID NOT NULL,
    "submitted_role_code" "RoleCode" NOT NULL,
    "update_type" "WorkflowUpdateType" NOT NULL,
    "progress_summary" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "expected_completion_date" DATE,
    "review_status" "WorkflowReviewStatus" NOT NULL,
    "source_update_id" UUID,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workflow_update_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_update_review" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "workflow_update_id" UUID NOT NULL,
    "decision" "WorkflowReviewDecision" NOT NULL,
    "reviewed_by_person_id" UUID NOT NULL,
    "reviewed_role_code" "RoleCode" NOT NULL,
    "review_comment" TEXT NOT NULL,
    "reviewed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workflow_update_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue" (
    "id" UUID NOT NULL,
    "issue_no" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "project_workflow_stage_id" UUID NOT NULL,
    "reported_by_person_id" UUID NOT NULL,
    "reported_role_code" "RoleCode" NOT NULL,
    "issue_type_code" TEXT NOT NULL DEFAULT 'ISSUE_TYPE',
    "issue_type_option_id" UUID NOT NULL,
    "issue_type_other_text" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "current_risk_level" "RiskLevel" NOT NULL DEFAULT 'NONE',
    "expected_support" TEXT NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    "resolution_method" "ResolutionMethod",
    "resolved_by_person_id" UUID,
    "proxy_confirmation_reason" TEXT,
    "proxy_confirmation_basis" TEXT,
    "confirmation_requested_at" TIMESTAMPTZ(3),
    "confirmation_due_at" TIMESTAMPTZ(3),
    "confirmation_round_no" INTEGER NOT NULL DEFAULT 0,
    "confirmation_wait_days_snapshot" INTEGER,
    "confirmation_reminder_interval_days_snapshot" INTEGER,
    "closed_at" TIMESTAMPTZ(3),
    "invalid_close_reason_code" "InvalidCloseReason",
    "invalid_close_explanation" TEXT,
    "duplicate_issue_id" UUID,
    "related_closed_issue_id" UUID,
    "recurrence_of_issue_id" UUID,

    CONSTRAINT "issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_handling_state" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "state_code" "IssueHandlingStateCode" NOT NULL,
    "required_role_code" "RoleCode",
    "required_person_id" UUID,
    "entered_by_person_id" UUID NOT NULL,
    "entered_by_role_code" "RoleCode" NOT NULL,
    "entered_at" TIMESTAMPTZ(3) NOT NULL,
    "exited_at" TIMESTAMPTZ(3),
    "transition_reason" TEXT,

    CONSTRAINT "issue_handling_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_confirmation_setting" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "reporter_confirmation_wait_days" INTEGER NOT NULL,
    "reminder_interval_days" INTEGER NOT NULL,
    "updated_by_person_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "issue_confirmation_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_activity" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "handling_state_id" UUID,
    "activity_type" "IssueActivityType" NOT NULL,
    "action_code" TEXT,
    "performed_by_person_id" UUID NOT NULL,
    "performed_role_code" "RoleCode" NOT NULL,
    "detail" TEXT NOT NULL,
    "visibility_scope" "IssueVisibilityScope" NOT NULL,
    "from_risk_level" "RiskLevel",
    "to_risk_level" "RiskLevel",
    "risk_change_reason" TEXT,
    "from_issue_type_option_id" UUID,
    "to_issue_type_option_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_contact" (
    "id" UUID NOT NULL,
    "contact_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "category_code" TEXT NOT NULL,
    "organization_name" TEXT,
    "status" "ExternalContactStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "external_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_email" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "sent_by_person_id" UUID NOT NULL,
    "sent_by_role_code" "RoleCode" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "IssueEmailStatus" NOT NULL DEFAULT 'PENDING',
    "visibility_scope" "IssueVisibilityScope" NOT NULL DEFAULT 'PMO_ONLY',
    "idempotency_key" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),

    CONSTRAINT "issue_email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_email_recipient" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "issue_email_id" UUID NOT NULL,
    "person_id" UUID,
    "external_contact_id" UUID,
    "recipient_type" "EmailRecipientType" NOT NULL,
    "recipient_name_snapshot" TEXT NOT NULL,
    "recipient_email_snapshot" TEXT NOT NULL,
    "delivery_status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "issue_email_recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_delivery_attempt" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "issue_email_recipient_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "status" "EmailAttemptStatus" NOT NULL,
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "attempted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_delivery_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "recipient_person_id" UUID NOT NULL,
    "recipient_role_code" "RoleCode",
    "notification_type" "NotificationType" NOT NULL,
    "event_code" TEXT NOT NULL,
    "triggered_by_person_id" UUID,
    "triggered_by_role_code" "RoleCode",
    "issue_id" UUID,
    "issue_handling_state_id" UUID,
    "issue_activity_id" UUID,
    "project_workflow_stage_id" UUID,
    "project_id" UUID,
    "project_establishment_review_id" UUID,
    "project_plan_change_request_id" UUID,
    "project_plan_change_activity_id" UUID,
    "project_field_change_request_id" UUID,
    "project_field_change_activity_id" UUID,
    "project_completion_request_id" UUID,
    "project_completion_activity_id" UUID,
    "workflow_update_id" UUID,
    "workflow_update_review_id" UUID,
    "reminder_run_id" UUID,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary" (
    "id" UUID NOT NULL,
    "dictionary_code" TEXT NOT NULL,
    "dictionary_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dictionary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_option" (
    "id" UUID NOT NULL,
    "dictionary_id" UUID NOT NULL,
    "dictionary_code" TEXT NOT NULL,
    "option_code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dictionary_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_person_id" UUID,
    "actor_role_code" "RoleCode",
    "session_id" UUID,
    "actor_identifier_masked" TEXT,
    "action_code" TEXT NOT NULL,
    "result" "AuditResult" NOT NULL,
    "project_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "entity_business_code" TEXT,
    "summary" TEXT NOT NULL,
    "changed_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "before_snapshot" JSONB,
    "after_snapshot" JSONB,
    "failure_code" TEXT,
    "ip_address" INET,
    "user_agent" TEXT,
    "correlation_id" TEXT NOT NULL,
    "storage_tier" "AuditStorageTier" NOT NULL DEFAULT 'ONLINE',
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_job" (
    "id" UUID NOT NULL,
    "requested_by_person_id" UUID NOT NULL,
    "requested_role_code" "RoleCode" NOT NULL,
    "export_type" "ExportType" NOT NULL,
    "filter_snapshot" JSONB NOT NULL,
    "field_set_code" TEXT NOT NULL,
    "permission_scope_snapshot" JSONB NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "row_count" INTEGER,
    "file_storage_key" TEXT,
    "file_sha256" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "failure_code" TEXT,

    CONSTRAINT "export_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_run" (
    "id" UUID NOT NULL,
    "scheduled_for" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "status" "ReminderRunStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "candidate_count" INTEGER NOT NULL DEFAULT 0,
    "notification_created_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reminder_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "person_employee_no_key" ON "person"("employee_no");

-- CreateIndex
CREATE UNIQUE INDEX "person_login_name_key" ON "person"("login_name");

-- CreateIndex
CREATE UNIQUE INDEX "person_work_email_key" ON "person"("work_email");

-- CreateIndex
CREATE INDEX "person_account_status_idx" ON "person"("account_status");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE INDEX "session_person_id_expires_at_idx" ON "session"("person_id", "expires_at");

-- CreateIndex
CREATE INDEX "role_assignment_person_id_assignment_status_idx" ON "role_assignment"("person_id", "assignment_status");

-- CreateIndex
CREATE INDEX "role_assignment_project_id_role_code_assignment_status_idx" ON "role_assignment"("project_id", "role_code", "assignment_status");

-- CreateIndex
CREATE UNIQUE INDEX "role_assignment_project_id_id_key" ON "role_assignment"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "project_project_code_key" ON "project"("project_code");

-- CreateIndex
CREATE INDEX "project_status_created_at_idx" ON "project"("status", "created_at");

-- CreateIndex
CREATE INDEX "project_project_code_idx" ON "project"("project_code");

-- CreateIndex
CREATE UNIQUE INDEX "project_id_row_version_key" ON "project"("id", "row_version");

-- CreateIndex
CREATE INDEX "project_collaborating_center_project_id_sort_order_idx" ON "project_collaborating_center"("project_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "project_collaborating_center_project_id_center_name_key" ON "project_collaborating_center"("project_id", "center_name");

-- CreateIndex
CREATE INDEX "project_establishment_review_decision_submitted_at_idx" ON "project_establishment_review"("decision", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_establishment_review_project_id_submission_no_key" ON "project_establishment_review"("project_id", "submission_no");

-- CreateIndex
CREATE UNIQUE INDEX "project_establishment_review_project_id_id_key" ON "project_establishment_review"("project_id", "id");

-- CreateIndex
CREATE INDEX "project_completion_request_project_id_status_idx" ON "project_completion_request"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_completion_request_id_project_id_key" ON "project_completion_request"("id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_completion_check_completion_request_id_check_code_key" ON "project_completion_check"("completion_request_id", "check_code");

-- CreateIndex
CREATE INDEX "project_completion_activity_completion_request_id_created_a_idx" ON "project_completion_activity"("completion_request_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_completion_activity_project_id_completion_request_i_key" ON "project_completion_activity"("project_id", "completion_request_id", "id");

-- CreateIndex
CREATE INDEX "project_primary_key_sub_i_change_project_id_changed_at_idx" ON "project_primary_key_sub_i_change"("project_id", "changed_at");

-- CreateIndex
CREATE INDEX "project_field_change_request_project_id_status_submitted_at_idx" ON "project_field_change_request"("project_id", "status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_field_change_request_id_project_id_key" ON "project_field_change_request"("id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_field_change_item_request_id_field_code_key" ON "project_field_change_item"("request_id", "field_code");

-- CreateIndex
CREATE INDEX "project_field_change_activity_request_id_created_at_idx" ON "project_field_change_activity"("request_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_field_change_activity_request_id_id_key" ON "project_field_change_activity"("request_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lifecycle_template_template_code_key" ON "lifecycle_template"("template_code");

-- CreateIndex
CREATE UNIQUE INDEX "lifecycle_template_version_lifecycle_template_id_version_no_key" ON "lifecycle_template_version"("lifecycle_template_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "stage_template_template_version_id_stage_code_key" ON "stage_template"("template_version_id", "stage_code");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_template_template_version_id_workflow_code_key" ON "workflow_template"("template_version_id", "workflow_code");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_stage_template_workflow_template_id_stage_template_key" ON "workflow_stage_template"("workflow_template_id", "stage_template_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_plan_project_id_key" ON "project_plan"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_plan_project_id_id_key" ON "project_plan"("project_id", "id");

-- CreateIndex
CREATE INDEX "project_plan_version_project_plan_id_status_idx" ON "project_plan_version"("project_plan_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_plan_version_project_plan_id_version_no_key" ON "project_plan_version"("project_plan_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "project_plan_version_id_project_plan_id_key" ON "project_plan_version"("id", "project_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_plan_change_request_candidate_plan_version_id_key" ON "project_plan_change_request"("candidate_plan_version_id");

-- CreateIndex
CREATE INDEX "project_plan_change_request_project_id_status_submitted_at_idx" ON "project_plan_change_request"("project_id", "status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_plan_change_request_id_project_id_key" ON "project_plan_change_request"("id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_plan_change_request_id_project_plan_id_key" ON "project_plan_change_request"("id", "project_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_plan_change_request_candidate_plan_version_id_proje_key" ON "project_plan_change_request"("candidate_plan_version_id", "project_plan_id");

-- CreateIndex
CREATE INDEX "project_plan_change_activity_request_id_created_at_idx" ON "project_plan_change_activity"("request_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_plan_change_activity_request_id_id_key" ON "project_plan_change_activity"("request_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "project_stage_project_id_project_plan_id_id_key" ON "project_stage"("project_id", "project_plan_id", "id");

-- CreateIndex
CREATE INDEX "project_stage_version_project_plan_version_id_sort_order_idx" ON "project_stage_version"("project_plan_version_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "project_stage_version_project_plan_version_id_project_stage_key" ON "project_stage_version"("project_plan_version_id", "project_stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_workflow_project_id_project_plan_id_id_key" ON "project_workflow"("project_id", "project_plan_id", "id");

-- CreateIndex
CREATE INDEX "project_workflow_version_project_plan_version_id_sort_order_idx" ON "project_workflow_version"("project_plan_version_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "project_workflow_version_project_plan_version_id_project_wo_key" ON "project_workflow_version"("project_plan_version_id", "project_workflow_id");

-- CreateIndex
CREATE INDEX "project_workflow_stage_project_id_execution_status_idx" ON "project_workflow_stage"("project_id", "execution_status");

-- CreateIndex
CREATE INDEX "project_workflow_stage_next_update_due_date_execution_statu_idx" ON "project_workflow_stage"("next_update_due_date", "execution_status");

-- CreateIndex
CREATE UNIQUE INDEX "project_workflow_stage_project_workflow_id_project_stage_id_key" ON "project_workflow_stage"("project_workflow_id", "project_stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_workflow_stage_project_id_id_key" ON "project_workflow_stage"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "project_workflow_stage_project_id_project_plan_id_id_key" ON "project_workflow_stage"("project_id", "project_plan_id", "id");

-- CreateIndex
CREATE INDEX "project_workflow_stage_version_project_plan_version_id_sort_idx" ON "project_workflow_stage_version"("project_plan_version_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "project_workflow_stage_version_project_plan_version_id_proj_key" ON "project_workflow_stage_version"("project_plan_version_id", "project_workflow_stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_workflow_stage_role_version_project_workflow_stage__key" ON "project_workflow_stage_role_version"("project_workflow_stage_version_id", "role_code");

-- CreateIndex
CREATE UNIQUE INDEX "project_workflow_stage_reminder_point_version_project_workf_key" ON "project_workflow_stage_reminder_point_version"("project_workflow_stage_version_id", "days_before");

-- CreateIndex
CREATE INDEX "workflow_update_project_workflow_stage_id_submitted_at_idx" ON "workflow_update"("project_workflow_stage_id", "submitted_at");

-- CreateIndex
CREATE INDEX "workflow_update_review_status_submitted_at_idx" ON "workflow_update"("review_status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_update_id_project_id_key" ON "workflow_update"("id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_update_review_workflow_update_id_key" ON "workflow_update_review"("workflow_update_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_update_review_project_id_id_key" ON "workflow_update_review"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_update_review_workflow_update_id_project_id_key" ON "workflow_update_review"("workflow_update_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_issue_no_key" ON "issue"("issue_no");

-- CreateIndex
CREATE INDEX "issue_project_id_opened_at_idx" ON "issue"("project_id", "opened_at");

-- CreateIndex
CREATE INDEX "issue_current_risk_level_resolved_at_closed_at_idx" ON "issue"("current_risk_level", "resolved_at", "closed_at");

-- CreateIndex
CREATE INDEX "issue_confirmation_due_at_idx" ON "issue"("confirmation_due_at");

-- CreateIndex
CREATE UNIQUE INDEX "issue_project_id_id_key" ON "issue"("project_id", "id");

-- CreateIndex
CREATE INDEX "issue_handling_state_issue_id_entered_at_idx" ON "issue_handling_state"("issue_id", "entered_at");

-- CreateIndex
CREATE INDEX "issue_handling_state_required_role_code_exited_at_idx" ON "issue_handling_state"("required_role_code", "exited_at");

-- CreateIndex
CREATE INDEX "issue_handling_state_required_person_id_exited_at_idx" ON "issue_handling_state"("required_person_id", "exited_at");

-- CreateIndex
CREATE UNIQUE INDEX "issue_handling_state_project_id_issue_id_id_key" ON "issue_handling_state"("project_id", "issue_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_handling_state_project_id_id_key" ON "issue_handling_state"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_confirmation_setting_project_id_key" ON "issue_confirmation_setting"("project_id");

-- CreateIndex
CREATE INDEX "issue_activity_issue_id_created_at_idx" ON "issue_activity"("issue_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "issue_activity_project_id_issue_id_id_key" ON "issue_activity"("project_id", "issue_id", "id");

-- CreateIndex
CREATE INDEX "external_contact_status_category_code_idx" ON "external_contact"("status", "category_code");

-- CreateIndex
CREATE UNIQUE INDEX "external_contact_email_category_code_key" ON "external_contact"("email", "category_code");

-- CreateIndex
CREATE UNIQUE INDEX "issue_email_idempotency_key_key" ON "issue_email"("idempotency_key");

-- CreateIndex
CREATE INDEX "issue_email_issue_id_requested_at_idx" ON "issue_email"("issue_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "issue_email_project_id_issue_id_id_key" ON "issue_email"("project_id", "issue_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_email_project_id_id_key" ON "issue_email"("project_id", "id");

-- CreateIndex
CREATE INDEX "issue_email_recipient_issue_email_id_recipient_type_idx" ON "issue_email_recipient"("issue_email_id", "recipient_type");

-- CreateIndex
CREATE UNIQUE INDEX "issue_email_recipient_project_id_issue_email_id_id_key" ON "issue_email_recipient"("project_id", "issue_email_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "issue_email_recipient_project_id_id_key" ON "issue_email_recipient"("project_id", "id");

-- CreateIndex
CREATE INDEX "email_delivery_attempt_project_id_attempted_at_idx" ON "email_delivery_attempt"("project_id", "attempted_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_delivery_attempt_issue_email_recipient_id_attempt_no_key" ON "email_delivery_attempt"("issue_email_recipient_id", "attempt_no");

-- CreateIndex
CREATE INDEX "notification_recipient_person_id_status_created_at_idx" ON "notification"("recipient_person_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "notification_project_id_notification_type_created_at_idx" ON "notification"("project_id", "notification_type", "created_at");

-- CreateIndex
CREATE INDEX "notification_issue_id_created_at_idx" ON "notification"("issue_id", "created_at");

-- CreateIndex
-- CreateIndex
CREATE UNIQUE INDEX "dictionary_dictionary_code_key" ON "dictionary"("dictionary_code");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_id_dictionary_code_key" ON "dictionary"("id", "dictionary_code");

-- CreateIndex
CREATE INDEX "dictionary_option_dictionary_id_enabled_sort_order_idx" ON "dictionary_option"("dictionary_id", "enabled", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_option_dictionary_code_id_key" ON "dictionary_option"("dictionary_code", "id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_option_dictionary_code_option_code_key" ON "dictionary_option"("dictionary_code", "option_code");

-- CreateIndex
CREATE INDEX "audit_log_project_id_occurred_at_idx" ON "audit_log"("project_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_occurred_at_idx" ON "audit_log"("entity_type", "entity_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_person_id_occurred_at_idx" ON "audit_log"("actor_person_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_action_code_occurred_at_idx" ON "audit_log"("action_code", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_storage_tier_occurred_at_idx" ON "audit_log"("storage_tier", "occurred_at");

-- CreateIndex
CREATE INDEX "export_job_requested_by_person_id_created_at_idx" ON "export_job"("requested_by_person_id", "created_at");

-- CreateIndex
CREATE INDEX "export_job_status_created_at_idx" ON "export_job"("status", "created_at");

-- CreateIndex
CREATE INDEX "export_job_expires_at_status_idx" ON "export_job"("expires_at", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_run_scheduled_for_key" ON "reminder_run"("scheduled_for");

-- CreateIndex
CREATE INDEX "reminder_run_status_scheduled_for_idx" ON "reminder_run"("status", "scheduled_for");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_granted_by_person_id_fkey" FOREIGN KEY ("granted_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_applicant_person_id_fkey" FOREIGN KEY ("applicant_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_established_by_person_id_fkey" FOREIGN KEY ("established_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_cancelled_by_person_id_fkey" FOREIGN KEY ("cancelled_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_disease_area_dictionary_code_disease_area_option_i_fkey" FOREIGN KEY ("disease_area_dictionary_code", "disease_area_option_id") REFERENCES "dictionary_option"("dictionary_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_research_type_dictionary_code_research_type_option_fkey" FOREIGN KEY ("research_type_dictionary_code", "research_type_option_id") REFERENCES "dictionary_option"("dictionary_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_priority_dictionary_code_priority_option_id_fkey" FOREIGN KEY ("priority_dictionary_code", "priority_option_id") REFERENCES "dictionary_option"("dictionary_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_contract_status_dictionary_code_contract_status_op_fkey" FOREIGN KEY ("contract_status_dictionary_code", "contract_status_option_id") REFERENCES "dictionary_option"("dictionary_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_ethics_status_dictionary_code_ethics_status_option_fkey" FOREIGN KEY ("ethics_status_dictionary_code", "ethics_status_option_id") REFERENCES "dictionary_option"("dictionary_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_registration_status_dictionary_code_registration_s_fkey" FOREIGN KEY ("registration_status_dictionary_code", "registration_status_option_id") REFERENCES "dictionary_option"("dictionary_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_funding_status_dictionary_code_funding_status_opti_fkey" FOREIGN KEY ("funding_status_dictionary_code", "funding_status_option_id") REFERENCES "dictionary_option"("dictionary_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_collaborating_center" ADD CONSTRAINT "project_collaborating_center_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_establishment_review" ADD CONSTRAINT "project_establishment_review_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_establishment_review" ADD CONSTRAINT "project_establishment_review_submitted_by_person_id_fkey" FOREIGN KEY ("submitted_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_establishment_review" ADD CONSTRAINT "project_establishment_review_reviewed_by_person_id_fkey" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_request" ADD CONSTRAINT "project_completion_request_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_request" ADD CONSTRAINT "project_completion_request_previous_request_id_project_id_fkey" FOREIGN KEY ("previous_request_id", "project_id") REFERENCES "project_completion_request"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_request" ADD CONSTRAINT "project_completion_request_submitted_by_person_id_fkey" FOREIGN KEY ("submitted_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_request" ADD CONSTRAINT "project_completion_request_reviewed_by_person_id_fkey" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_check" ADD CONSTRAINT "project_completion_check_completion_request_id_fkey" FOREIGN KEY ("completion_request_id") REFERENCES "project_completion_request"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_activity" ADD CONSTRAINT "project_completion_activity_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_activity" ADD CONSTRAINT "project_completion_activity_completion_request_id_project__fkey" FOREIGN KEY ("completion_request_id", "project_id") REFERENCES "project_completion_request"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_completion_activity" ADD CONSTRAINT "project_completion_activity_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_primary_key_sub_i_change" ADD CONSTRAINT "project_primary_key_sub_i_change_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_primary_key_sub_i_change" ADD CONSTRAINT "project_primary_key_sub_i_change_project_id_previous_role__fkey" FOREIGN KEY ("project_id", "previous_role_assignment_id") REFERENCES "role_assignment"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_primary_key_sub_i_change" ADD CONSTRAINT "project_primary_key_sub_i_change_project_id_new_role_assig_fkey" FOREIGN KEY ("project_id", "new_role_assignment_id") REFERENCES "role_assignment"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_primary_key_sub_i_change" ADD CONSTRAINT "project_primary_key_sub_i_change_changed_by_person_id_fkey" FOREIGN KEY ("changed_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_field_change_request" ADD CONSTRAINT "project_field_change_request_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_field_change_request" ADD CONSTRAINT "project_field_change_request_previous_request_id_project_i_fkey" FOREIGN KEY ("previous_request_id", "project_id") REFERENCES "project_field_change_request"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_field_change_request" ADD CONSTRAINT "project_field_change_request_submitted_by_person_id_fkey" FOREIGN KEY ("submitted_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_field_change_item" ADD CONSTRAINT "project_field_change_item_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "project_field_change_request"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_field_change_item" ADD CONSTRAINT "project_field_change_item_old_option_id_fkey" FOREIGN KEY ("old_option_id") REFERENCES "dictionary_option"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_field_change_item" ADD CONSTRAINT "project_field_change_item_new_option_id_fkey" FOREIGN KEY ("new_option_id") REFERENCES "dictionary_option"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_field_change_activity" ADD CONSTRAINT "project_field_change_activity_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "project_field_change_request"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_field_change_activity" ADD CONSTRAINT "project_field_change_activity_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_governance_setting" ADD CONSTRAINT "project_governance_setting_updated_by_person_id_fkey" FOREIGN KEY ("updated_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lifecycle_template_version" ADD CONSTRAINT "lifecycle_template_version_lifecycle_template_id_fkey" FOREIGN KEY ("lifecycle_template_id") REFERENCES "lifecycle_template"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lifecycle_template_version" ADD CONSTRAINT "lifecycle_template_version_published_by_person_id_fkey" FOREIGN KEY ("published_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "stage_template" ADD CONSTRAINT "stage_template_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "lifecycle_template_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_template" ADD CONSTRAINT "workflow_template_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "lifecycle_template_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_stage_template" ADD CONSTRAINT "workflow_stage_template_workflow_template_id_fkey" FOREIGN KEY ("workflow_template_id") REFERENCES "workflow_template"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_stage_template" ADD CONSTRAINT "workflow_stage_template_stage_template_id_fkey" FOREIGN KEY ("stage_template_id") REFERENCES "stage_template"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_plan" ADD CONSTRAINT "project_plan_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_plan_version" ADD CONSTRAINT "project_plan_version_project_plan_id_fkey" FOREIGN KEY ("project_plan_id") REFERENCES "project_plan"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_plan_version" ADD CONSTRAINT "project_plan_version_base_version_id_project_plan_id_fkey" FOREIGN KEY ("base_version_id", "project_plan_id") REFERENCES "project_plan_version"("id", "project_plan_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_plan_version" ADD CONSTRAINT "project_plan_version_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "lifecycle_template_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_plan_version" ADD CONSTRAINT "project_plan_version_created_by_person_id_fkey" FOREIGN KEY ("created_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_plan_change_request" ADD CONSTRAINT "project_plan_change_request_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_plan_change_request" ADD CONSTRAINT "project_plan_change_request_project_id_project_plan_id_fkey" FOREIGN KEY ("project_id", "project_plan_id") REFERENCES "project_plan"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_plan_change_request" ADD CONSTRAINT "project_plan_change_request_candidate_plan_version_id_proj_fkey" FOREIGN KEY ("candidate_plan_version_id", "project_plan_id") REFERENCES "project_plan_version"("id", "project_plan_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_plan_change_request" ADD CONSTRAINT "project_plan_change_request_previous_request_id_project_pl_fkey" FOREIGN KEY ("previous_request_id", "project_plan_id") REFERENCES "project_plan_change_request"("id", "project_plan_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_plan_change_request" ADD CONSTRAINT "project_plan_change_request_submitted_by_person_id_fkey" FOREIGN KEY ("submitted_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_plan_change_activity" ADD CONSTRAINT "project_plan_change_activity_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "project_plan_change_request"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_plan_change_activity" ADD CONSTRAINT "project_plan_change_activity_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_stage" ADD CONSTRAINT "project_stage_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_stage" ADD CONSTRAINT "project_stage_project_id_project_plan_id_fkey" FOREIGN KEY ("project_id", "project_plan_id") REFERENCES "project_plan"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_stage" ADD CONSTRAINT "project_stage_source_stage_template_id_fkey" FOREIGN KEY ("source_stage_template_id") REFERENCES "stage_template"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_stage_version" ADD CONSTRAINT "project_stage_version_project_plan_version_id_fkey" FOREIGN KEY ("project_plan_version_id") REFERENCES "project_plan_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_stage_version" ADD CONSTRAINT "project_stage_version_project_stage_id_fkey" FOREIGN KEY ("project_stage_id") REFERENCES "project_stage"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_workflow" ADD CONSTRAINT "project_workflow_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_workflow" ADD CONSTRAINT "project_workflow_project_id_project_plan_id_fkey" FOREIGN KEY ("project_id", "project_plan_id") REFERENCES "project_plan"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_workflow" ADD CONSTRAINT "project_workflow_source_workflow_template_id_fkey" FOREIGN KEY ("source_workflow_template_id") REFERENCES "workflow_template"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_workflow_version" ADD CONSTRAINT "project_workflow_version_project_plan_version_id_fkey" FOREIGN KEY ("project_plan_version_id") REFERENCES "project_plan_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_workflow_version" ADD CONSTRAINT "project_workflow_version_project_workflow_id_fkey" FOREIGN KEY ("project_workflow_id") REFERENCES "project_workflow"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_workflow_stage" ADD CONSTRAINT "project_workflow_stage_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_workflow_stage" ADD CONSTRAINT "project_workflow_stage_project_id_project_plan_id_fkey" FOREIGN KEY ("project_id", "project_plan_id") REFERENCES "project_plan"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_workflow_stage" ADD CONSTRAINT "project_workflow_stage_workflow_fkey" FOREIGN KEY ("project_id", "project_plan_id", "project_workflow_id") REFERENCES "project_workflow"("project_id", "project_plan_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_workflow_stage" ADD CONSTRAINT "project_workflow_stage_stage_fkey" FOREIGN KEY ("project_id", "project_plan_id", "project_stage_id") REFERENCES "project_stage"("project_id", "project_plan_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_workflow_stage_version" ADD CONSTRAINT "project_workflow_stage_version_project_plan_version_id_fkey" FOREIGN KEY ("project_plan_version_id") REFERENCES "project_plan_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_workflow_stage_version" ADD CONSTRAINT "project_workflow_stage_version_project_workflow_stage_id_fkey" FOREIGN KEY ("project_workflow_stage_id") REFERENCES "project_workflow_stage"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_workflow_stage_role_version" ADD CONSTRAINT "project_workflow_stage_role_version_project_workflow_stage_fkey" FOREIGN KEY ("project_workflow_stage_version_id") REFERENCES "project_workflow_stage_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_workflow_stage_reminder_point_version" ADD CONSTRAINT "project_workflow_stage_reminder_point_version_project_work_fkey" FOREIGN KEY ("project_workflow_stage_version_id") REFERENCES "project_workflow_stage_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_reminder_setting" ADD CONSTRAINT "project_reminder_setting_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_reminder_setting" ADD CONSTRAINT "project_reminder_setting_updated_by_person_id_fkey" FOREIGN KEY ("updated_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_update" ADD CONSTRAINT "workflow_update_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_update" ADD CONSTRAINT "workflow_update_project_id_project_workflow_stage_id_fkey" FOREIGN KEY ("project_id", "project_workflow_stage_id") REFERENCES "project_workflow_stage"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_update" ADD CONSTRAINT "workflow_update_submitted_by_person_id_fkey" FOREIGN KEY ("submitted_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_update" ADD CONSTRAINT "workflow_update_source_update_id_project_id_fkey" FOREIGN KEY ("source_update_id", "project_id") REFERENCES "workflow_update"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_update_review" ADD CONSTRAINT "workflow_update_review_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_update_review" ADD CONSTRAINT "workflow_update_review_workflow_update_id_project_id_fkey" FOREIGN KEY ("workflow_update_id", "project_id") REFERENCES "workflow_update"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "workflow_update_review" ADD CONSTRAINT "workflow_update_review_reviewed_by_person_id_fkey" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_project_id_project_workflow_stage_id_fkey" FOREIGN KEY ("project_id", "project_workflow_stage_id") REFERENCES "project_workflow_stage"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_reported_by_person_id_fkey" FOREIGN KEY ("reported_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_resolved_by_person_id_fkey" FOREIGN KEY ("resolved_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_issue_type_code_issue_type_option_id_fkey" FOREIGN KEY ("issue_type_code", "issue_type_option_id") REFERENCES "dictionary_option"("dictionary_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_project_id_duplicate_issue_id_fkey" FOREIGN KEY ("project_id", "duplicate_issue_id") REFERENCES "issue"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_project_id_related_closed_issue_id_fkey" FOREIGN KEY ("project_id", "related_closed_issue_id") REFERENCES "issue"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_project_id_recurrence_of_issue_id_fkey" FOREIGN KEY ("project_id", "recurrence_of_issue_id") REFERENCES "issue"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_handling_state" ADD CONSTRAINT "issue_handling_state_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_handling_state" ADD CONSTRAINT "issue_handling_state_project_id_issue_id_fkey" FOREIGN KEY ("project_id", "issue_id") REFERENCES "issue"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_handling_state" ADD CONSTRAINT "issue_handling_state_required_person_id_fkey" FOREIGN KEY ("required_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_handling_state" ADD CONSTRAINT "issue_handling_state_entered_by_person_id_fkey" FOREIGN KEY ("entered_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_confirmation_setting" ADD CONSTRAINT "issue_confirmation_setting_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_confirmation_setting" ADD CONSTRAINT "issue_confirmation_setting_updated_by_person_id_fkey" FOREIGN KEY ("updated_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_project_id_issue_id_fkey" FOREIGN KEY ("project_id", "issue_id") REFERENCES "issue"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_project_id_issue_id_handling_state_id_fkey" FOREIGN KEY ("project_id", "issue_id", "handling_state_id") REFERENCES "issue_handling_state"("project_id", "issue_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_performed_by_person_id_fkey" FOREIGN KEY ("performed_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_from_issue_type_option_id_fkey" FOREIGN KEY ("from_issue_type_option_id") REFERENCES "dictionary_option"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_to_issue_type_option_id_fkey" FOREIGN KEY ("to_issue_type_option_id") REFERENCES "dictionary_option"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_email" ADD CONSTRAINT "issue_email_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_email" ADD CONSTRAINT "issue_email_project_id_issue_id_fkey" FOREIGN KEY ("project_id", "issue_id") REFERENCES "issue"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_email" ADD CONSTRAINT "issue_email_sent_by_person_id_fkey" FOREIGN KEY ("sent_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_email_recipient" ADD CONSTRAINT "issue_email_recipient_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_email_recipient" ADD CONSTRAINT "issue_email_recipient_project_id_issue_email_id_fkey" FOREIGN KEY ("project_id", "issue_email_id") REFERENCES "issue_email"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_email_recipient" ADD CONSTRAINT "issue_email_recipient_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "issue_email_recipient" ADD CONSTRAINT "issue_email_recipient_external_contact_id_fkey" FOREIGN KEY ("external_contact_id") REFERENCES "external_contact"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "email_delivery_attempt" ADD CONSTRAINT "email_delivery_attempt_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "email_delivery_attempt" ADD CONSTRAINT "email_delivery_attempt_project_id_issue_email_recipient_id_fkey" FOREIGN KEY ("project_id", "issue_email_recipient_id") REFERENCES "issue_email_recipient"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_person_id_fkey" FOREIGN KEY ("recipient_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_triggered_by_person_id_fkey" FOREIGN KEY ("triggered_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_issue_id_fkey" FOREIGN KEY ("project_id", "issue_id") REFERENCES "issue"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_issue_id_issue_handling_state_id_fkey" FOREIGN KEY ("project_id", "issue_id", "issue_handling_state_id") REFERENCES "issue_handling_state"("project_id", "issue_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_issue_id_issue_activity_id_fkey" FOREIGN KEY ("project_id", "issue_id", "issue_activity_id") REFERENCES "issue_activity"("project_id", "issue_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_project_workflow_stage_id_fkey" FOREIGN KEY ("project_id", "project_workflow_stage_id") REFERENCES "project_workflow_stage"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_project_establishment_review_id_fkey" FOREIGN KEY ("project_id", "project_establishment_review_id") REFERENCES "project_establishment_review"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_project_plan_change_request_id_fkey" FOREIGN KEY ("project_id", "project_plan_change_request_id") REFERENCES "project_plan_change_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_plan_change_request_id_project_plan_c_fkey" FOREIGN KEY ("project_plan_change_request_id", "project_plan_change_activity_id") REFERENCES "project_plan_change_activity"("request_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_project_field_change_request_id_fkey" FOREIGN KEY ("project_id", "project_field_change_request_id") REFERENCES "project_field_change_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_field_change_request_id_project_field_fkey" FOREIGN KEY ("project_field_change_request_id", "project_field_change_activity_id") REFERENCES "project_field_change_activity"("request_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_project_completion_request_id_fkey" FOREIGN KEY ("project_id", "project_completion_request_id") REFERENCES "project_completion_request"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_project_completion_request_id_proj_fkey" FOREIGN KEY ("project_id", "project_completion_request_id", "project_completion_activity_id") REFERENCES "project_completion_activity"("project_id", "completion_request_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_workflow_update_id_fkey" FOREIGN KEY ("project_id", "workflow_update_id") REFERENCES "workflow_update"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_workflow_update_review_id_fkey" FOREIGN KEY ("project_id", "workflow_update_review_id") REFERENCES "workflow_update_review"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_reminder_run_id_fkey" FOREIGN KEY ("reminder_run_id") REFERENCES "reminder_run"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "dictionary_option" ADD CONSTRAINT "dictionary_option_dictionary_id_dictionary_code_fkey" FOREIGN KEY ("dictionary_id", "dictionary_code") REFERENCES "dictionary"("id", "dictionary_code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "export_job" ADD CONSTRAINT "export_job_requested_by_person_id_fkey" FOREIGN KEY ("requested_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Formal schema constraints that Prisma cannot express.

-- Project codes are allocated only when a project is formally established.
CREATE SEQUENCE "project_code_sequence" START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

-- Current/effective row uniqueness.
CREATE UNIQUE INDEX "role_assignment_active_project_role_person_key"
ON "role_assignment" ("person_id", "project_id", "role_code")
WHERE "assignment_status" = 'ACTIVE' AND "project_id" IS NOT NULL;

CREATE UNIQUE INDEX "role_assignment_active_global_role_person_key"
ON "role_assignment" ("person_id", "role_code")
WHERE "assignment_status" = 'ACTIVE' AND "project_id" IS NULL;

CREATE UNIQUE INDEX "role_assignment_active_primary_key_sub_i_key"
ON "role_assignment" ("project_id")
WHERE "assignment_status" = 'ACTIVE' AND "role_code" = 'KEY_SUB_I' AND "is_primary" = true;

CREATE UNIQUE INDEX "project_plan_version_one_active_key"
ON "project_plan_version" ("project_plan_id")
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "issue_handling_state_one_current_key"
ON "issue_handling_state" ("issue_id")
WHERE "exited_at" IS NULL;

CREATE UNIQUE INDEX "project_completion_request_one_active_key"
ON "project_completion_request" ("project_id")
WHERE "status" IN ('DRAFT', 'PENDING_PMO_REVIEW', 'ON_HOLD');

CREATE UNIQUE INDEX "project_plan_change_request_one_active_key"
ON "project_plan_change_request" ("project_plan_id")
WHERE "status" IN (
  'DRAFT', 'PENDING_PMO_REVIEW', 'PENDING_PRIMARY_KEY_SUB_I_REVIEW', 'ON_HOLD',
  'PENDING_DEAN_DECISION', 'PENDING_PMO_IMPLEMENTATION',
  'PENDING_PMO_ACTIVATION', 'DEAN_REJECTED_PENDING_PMO_DISPOSITION'
);

CREATE UNIQUE INDEX "project_field_change_request_one_active_category_key"
ON "project_field_change_request" ("project_id", "change_category")
WHERE "status" IN (
  'DRAFT', 'PENDING_PMO_REVIEW', 'ON_HOLD',
  'PENDING_DEAN_DECISION', 'PENDING_PMO_IMPLEMENTATION',
  'PENDING_PMO_APPLICATION', 'DEAN_REJECTED_PENDING_PMO_DISPOSITION'
);

CREATE UNIQUE INDEX "workflow_update_one_pending_completion_key"
ON "workflow_update" ("project_workflow_stage_id")
WHERE "review_status" = 'PENDING'
  AND "update_type" IN ('COMPLETION_REQUEST', 'COMPLETION_RESUBMISSION');

CREATE UNIQUE INDEX "notification_event_recipient_role_key"
ON "notification" ("event_key", "recipient_person_id", "recipient_role_code") NULLS NOT DISTINCT;

CREATE UNIQUE INDEX "issue_confirmation_setting_one_global_key"
ON "issue_confirmation_setting" ((true))
WHERE "project_id" IS NULL;

CREATE UNIQUE INDEX "project_governance_setting_singleton_key"
ON "project_governance_setting" ((true));

-- Query indexes that require a predicate or descending order.
CREATE INDEX "project_status_updated_at_desc_idx"
ON "project" ("status", "updated_at" DESC);

CREATE INDEX "project_applicant_person_id_status_idx"
ON "project" ("applicant_person_id", "status");

CREATE INDEX "project_disease_area_option_id_status_idx"
ON "project" ("disease_area_option_id", "status");

CREATE INDEX "project_research_type_option_id_status_idx"
ON "project" ("research_type_option_id", "status");

CREATE INDEX "project_plan_version_version_no_desc_idx"
ON "project_plan_version" ("project_plan_id", "version_no" DESC);

CREATE INDEX "project_workflow_stage_next_update_due_idx"
ON "project_workflow_stage" ("next_update_due_date")
WHERE "next_update_due_date" IS NOT NULL;

CREATE INDEX "issue_open_risk_idx"
ON "issue" ("project_id", "closed_at", "current_risk_level");

CREATE INDEX "issue_confirmation_due_open_idx"
ON "issue" ("confirmation_due_at")
WHERE "confirmation_due_at" IS NOT NULL AND "resolved_at" IS NULL AND "closed_at" IS NULL;

CREATE INDEX "issue_handling_state_required_role_current_idx"
ON "issue_handling_state" ("required_role_code", "entered_at")
WHERE "exited_at" IS NULL AND "required_role_code" IS NOT NULL;

CREATE INDEX "issue_handling_state_required_person_current_idx"
ON "issue_handling_state" ("required_person_id", "entered_at")
WHERE "exited_at" IS NULL AND "required_person_id" IS NOT NULL;

-- Fixed category, lifecycle, numeric and state/timestamp checks.
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_scope_check" CHECK (
  (("role_code" IN ('DEAN', 'PMO')) AND "project_id" IS NULL AND "is_primary" = false)
  OR (("role_code" IN ('KEY_SUB_I', 'CRC', 'STATISTICIAN', 'COLLABORATION_LEAD')) AND "project_id" IS NOT NULL)
);

ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_primary_check" CHECK (
  "is_primary" = false
  OR ("role_code" = 'KEY_SUB_I' AND "assignment_status" = 'ACTIVE')
);

ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_status_time_check" CHECK (
  ("assignment_status" = 'PROPOSED' AND "activated_at" IS NULL AND "ended_at" IS NULL)
  OR ("assignment_status" = 'ACTIVE' AND "activated_at" IS NOT NULL AND "ended_at" IS NULL)
  OR ("assignment_status" = 'ENDED' AND "ended_at" IS NOT NULL)
);

ALTER TABLE "project" ADD CONSTRAINT "project_date_range_check" CHECK (
  "planned_start_date" IS NULL OR "planned_end_date" IS NULL OR "planned_start_date" <= "planned_end_date"
);

ALTER TABLE "project" ADD CONSTRAINT "project_nonnegative_values_check" CHECK (
  "row_version" >= 0
  AND ("target_sample_size" IS NULL OR "target_sample_size" >= 0)
  AND ("enrolled_count" IS NULL OR "enrolled_count" >= 0)
  AND ("budget_total" IS NULL OR "budget_total" >= 0)
  AND ("budget_used" IS NULL OR "budget_used" >= 0)
);

ALTER TABLE "project" ADD CONSTRAINT "project_dictionary_categories_check" CHECK (
  "disease_area_dictionary_code" = 'DISEASE_AREA'
  AND "research_type_dictionary_code" = 'RESEARCH_TYPE'
  AND "priority_dictionary_code" = 'PROJECT_PRIORITY'
  AND "contract_status_dictionary_code" = 'CONTRACT_STATUS'
  AND "ethics_status_dictionary_code" = 'ETHICS_STATUS'
  AND "registration_status_dictionary_code" = 'REGISTRATION_STATUS'
  AND "funding_status_dictionary_code" = 'FUNDING_STATUS'
);

ALTER TABLE "project" ADD CONSTRAINT "project_budget_currency_check" CHECK (
  ("budget_total" IS NULL AND "budget_used" IS NULL)
  OR "budget_currency_code" = 'CNY'
);

ALTER TABLE "project" ADD CONSTRAINT "project_code_establishment_check" CHECK (
  ("established_at" IS NULL AND "project_code" IS NULL)
  OR ("established_at" IS NOT NULL AND "project_code" ~ '^N-IIT-[0-9]{3,}$')
);

ALTER TABLE "project" ADD CONSTRAINT "project_status_timestamps_check" CHECK (
  ("completed_at" IS NULL OR "status" IN ('COMPLETED', 'ARCHIVED'))
  AND ("status" NOT IN ('COMPLETED', 'ARCHIVED') OR "completed_at" IS NOT NULL)
  AND (("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL AND "pre_archive_status" IS NOT NULL)
       OR ("status" <> 'ARCHIVED' AND "archived_at" IS NULL AND "pre_archive_status" IS NULL))
  AND (("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "cancellation_reason" IS NOT NULL)
       OR ("status" <> 'CANCELLED' AND "cancelled_at" IS NULL))
);

ALTER TABLE "project_stage_version" ADD CONSTRAINT "project_stage_version_values_check" CHECK (
  "sort_order" >= 0 AND "planned_start_date" <= "planned_end_date"
);

ALTER TABLE "project_workflow_version" ADD CONSTRAINT "project_workflow_version_values_check" CHECK (
  "sort_order" >= 0
);

ALTER TABLE "project_workflow_stage_version" ADD CONSTRAINT "project_workflow_stage_version_values_check" CHECK (
  "sort_order" >= 0
  AND "planned_start_date" <= "planned_end_date"
  AND ("update_interval_days" IS NULL OR "update_interval_days" > 0)
  AND "overdue_reminder_interval_days" > 0
);

ALTER TABLE "project_workflow_stage_role_version" ADD CONSTRAINT "project_workflow_stage_role_version_sort_check" CHECK ("sort_order" >= 0);

ALTER TABLE "project_workflow_stage_reminder_point_version" ADD CONSTRAINT "project_workflow_stage_reminder_point_values_check" CHECK (
  "days_before" > 0 AND "sort_order" >= 0
);

ALTER TABLE "lifecycle_template_version" ADD CONSTRAINT "lifecycle_template_version_no_check" CHECK ("version_no" > 0);
ALTER TABLE "project_plan_version" ADD CONSTRAINT "project_plan_version_no_check" CHECK ("version_no" > 0);
ALTER TABLE "stage_template" ADD CONSTRAINT "stage_template_sort_check" CHECK ("sort_order" >= 0);
ALTER TABLE "workflow_stage_template" ADD CONSTRAINT "workflow_stage_template_sort_check" CHECK ("sort_order" >= 0);

ALTER TABLE "project_governance_setting" ADD CONSTRAINT "project_governance_setting_values_check" CHECK (
  ("suspension_days_threshold" IS NULL OR "suspension_days_threshold" > 0)
  AND ("budget_change_ratio_threshold" IS NULL OR "budget_change_ratio_threshold" BETWEEN 0 AND 1)
  AND ("budget_change_amount_threshold" IS NULL OR "budget_change_amount_threshold" >= 0)
  AND ("sample_size_change_ratio_threshold" IS NULL OR "sample_size_change_ratio_threshold" BETWEEN 0 AND 1)
  AND ("sample_size_change_amount_threshold" IS NULL OR "sample_size_change_amount_threshold" >= 0)
);

ALTER TABLE "project_reminder_setting" ADD CONSTRAINT "project_reminder_setting_values_check" CHECK (
  "exception_digest_weekday" IS NULL OR "exception_digest_weekday" BETWEEN 1 AND 7
);

ALTER TABLE "issue_confirmation_setting" ADD CONSTRAINT "issue_confirmation_setting_values_check" CHECK (
  "reporter_confirmation_wait_days" > 0 AND "reminder_interval_days" > 0
);

ALTER TABLE "issue" ADD CONSTRAINT "issue_confirmation_values_check" CHECK (
  "confirmation_round_no" >= 0
  AND ("confirmation_wait_days_snapshot" IS NULL OR "confirmation_wait_days_snapshot" > 0)
  AND ("confirmation_reminder_interval_days_snapshot" IS NULL OR "confirmation_reminder_interval_days_snapshot" > 0)
);

ALTER TABLE "issue" ADD CONSTRAINT "issue_resolution_method_check" CHECK (
  ("resolution_method" IS NULL AND "resolved_at" IS NULL AND "resolved_by_person_id" IS NULL
      AND "proxy_confirmation_reason" IS NULL AND "proxy_confirmation_basis" IS NULL)
  OR ("resolution_method" = 'REPORTER_CONFIRMED' AND "resolved_at" IS NOT NULL AND "resolved_by_person_id" IS NOT NULL
      AND "proxy_confirmation_reason" IS NULL AND "proxy_confirmation_basis" IS NULL)
  OR ("resolution_method" = 'PMO_PROXY_CONFIRMED' AND "resolved_at" IS NOT NULL AND "resolved_by_person_id" IS NOT NULL
      AND "proxy_confirmation_reason" IS NOT NULL AND "proxy_confirmation_basis" IS NOT NULL)
);

ALTER TABLE "issue" ADD CONSTRAINT "issue_invalid_close_check" CHECK (
  (("invalid_close_reason_code" = 'DUPLICATE' AND "duplicate_issue_id" IS NOT NULL)
    OR ("invalid_close_reason_code" IS DISTINCT FROM 'DUPLICATE' AND "duplicate_issue_id" IS NULL))
  AND ("invalid_close_reason_code" IS NULL OR ("closed_at" IS NOT NULL AND "invalid_close_explanation" IS NOT NULL))
  AND "id" IS DISTINCT FROM "duplicate_issue_id"
  AND "id" IS DISTINCT FROM "related_closed_issue_id"
  AND "id" IS DISTINCT FROM "recurrence_of_issue_id"
);

ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_risk_change_check" CHECK (
  ("activity_type" = 'RISK_LEVEL_CHANGED' AND "from_risk_level" IS NOT NULL AND "to_risk_level" IS NOT NULL AND "risk_change_reason" IS NOT NULL)
  OR ("activity_type" <> 'RISK_LEVEL_CHANGED' AND "from_risk_level" IS NULL AND "to_risk_level" IS NULL AND "risk_change_reason" IS NULL)
);

ALTER TABLE "issue_email_recipient" ADD CONSTRAINT "issue_email_recipient_source_check" CHECK (
  (("person_id" IS NOT NULL)::int + ("external_contact_id" IS NOT NULL)::int) = 1
);

ALTER TABLE "email_delivery_attempt" ADD CONSTRAINT "email_delivery_attempt_result_check" CHECK (
  ("status" = 'SENT' AND "error_code" IS NULL AND "error_message" IS NULL)
  OR ("status" = 'FAILED' AND ("error_code" IS NOT NULL OR "error_message" IS NOT NULL))
);

ALTER TABLE "notification" ADD CONSTRAINT "notification_read_state_check" CHECK (
  ("status" = 'UNREAD' AND "read_at" IS NULL)
  OR ("status" = 'READ' AND "read_at" IS NOT NULL)
);

ALTER TABLE "notification" ADD CONSTRAINT "notification_project_scope_check" CHECK (
  "notification_type" = 'SYSTEM_NOTICE' OR "project_id" IS NOT NULL
);

ALTER TABLE "notification" ADD CONSTRAINT "notification_type_source_check" CHECK (
  ("notification_type" = 'ISSUE_MESSAGE' AND "issue_id" IS NOT NULL AND "event_code" LIKE 'ISSUE_%')
  OR ("notification_type" = 'WORKFLOW_REVIEW_NOTICE' AND "workflow_update_id" IS NOT NULL AND "event_code" LIKE 'WORKFLOW_COMPLETION_%')
  OR ("notification_type" = 'PROJECT_REVIEW_NOTICE' AND "project_id" IS NOT NULL AND "event_code" LIKE 'PROJECT_%'
      AND num_nonnulls("project_establishment_review_id", "project_plan_change_request_id", "project_field_change_request_id", "project_completion_request_id") = 1)
  OR ("notification_type" = 'WORKFLOW_FILL_REMINDER' AND "project_workflow_stage_id" IS NOT NULL AND "event_code" IN ('WORKFLOW_UPDATE_DUE', 'WORKFLOW_MANUAL_REMINDER_SENT'))
  OR ("notification_type" = 'MILESTONE_UPCOMING_REMINDER' AND "project_workflow_stage_id" IS NOT NULL AND "event_code" = 'MILESTONE_UPCOMING')
  OR ("notification_type" = 'MILESTONE_OVERDUE_REMINDER' AND "project_workflow_stage_id" IS NOT NULL AND "event_code" = 'MILESTONE_OVERDUE')
  OR ("notification_type" = 'SYSTEM_NOTICE' AND "event_code" = 'WORKFLOW_EXCEPTION_DIGEST')
);

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_result_check" CHECK (
  ("result" = 'SUCCESS' AND "failure_code" IS NULL)
  OR ("result" = 'FAILURE' AND "failure_code" IS NOT NULL)
);

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_check" CHECK (
  "actor_person_id" IS NULL OR "actor_role_code" IS NOT NULL
);

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_storage_tier_check" CHECK (
  ("storage_tier" = 'ONLINE' AND "archived_at" IS NULL)
  OR ("storage_tier" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
);

ALTER TABLE "export_job" ADD CONSTRAINT "export_job_values_check" CHECK (
  ("row_count" IS NULL OR "row_count" >= 0)
  AND ("status" <> 'COMPLETED' OR ("file_storage_key" IS NOT NULL AND "file_sha256" IS NOT NULL AND "completed_at" IS NOT NULL AND "expires_at" IS NOT NULL AND "failure_code" IS NULL))
  AND ("status" <> 'FAILED' OR "failure_code" IS NOT NULL)
  AND ("status" <> 'EXPIRED' OR ("completed_at" IS NOT NULL AND "expires_at" IS NOT NULL))
);

ALTER TABLE "export_job" ADD CONSTRAINT "export_job_role_type_check" CHECK (
  "requested_role_code" IN ('PMO', 'DEAN')
  AND (("export_type" = 'DEAN_ONE_PAGE_PDF' AND "field_set_code" = 'DEAN_ONE_PAGE_V1')
       OR ("export_type" = 'PROJECT_LEDGER_XLSX' AND "requested_role_code" = 'PMO' AND "field_set_code" = 'PMO_PROJECT_LEDGER_V1')
       OR ("export_type" = 'PROJECT_LEDGER_XLSX' AND "requested_role_code" = 'DEAN' AND "field_set_code" = 'DEAN_PROJECT_LEDGER_V1'))
);

ALTER TABLE "reminder_run" ADD CONSTRAINT "reminder_run_values_check" CHECK (
  "timezone" = 'Asia/Shanghai'
  AND "attempt_count" >= 0
  AND "candidate_count" >= 0
  AND "notification_created_count" >= 0
  AND "skipped_count" >= 0
);

-- Immutable identifiers that must not drift after creation.
CREATE FUNCTION "prevent_formal_identifier_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'project' AND OLD."project_code" IS NOT NULL AND NEW."project_code" IS DISTINCT FROM OLD."project_code" THEN
    RAISE EXCEPTION 'project_code is immutable once assigned';
  ELSIF TG_TABLE_NAME = 'dictionary' AND NEW."dictionary_code" IS DISTINCT FROM OLD."dictionary_code" THEN
    RAISE EXCEPTION 'dictionary_code is immutable';
  ELSIF TG_TABLE_NAME = 'dictionary_option' AND (NEW."dictionary_code" IS DISTINCT FROM OLD."dictionary_code" OR NEW."option_code" IS DISTINCT FROM OLD."option_code") THEN
    RAISE EXCEPTION 'dictionary option codes are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "project_code_immutable"
BEFORE UPDATE ON "project"
FOR EACH ROW EXECUTE FUNCTION "prevent_formal_identifier_change"();

CREATE TRIGGER "dictionary_code_immutable"
BEFORE UPDATE ON "dictionary"
FOR EACH ROW EXECUTE FUNCTION "prevent_formal_identifier_change"();

CREATE TRIGGER "dictionary_option_code_immutable"
BEFORE UPDATE ON "dictionary_option"
FOR EACH ROW EXECUTE FUNCTION "prevent_formal_identifier_change"();

-- Same-plan history ordering that cannot be represented in Prisma.
CREATE FUNCTION "validate_plan_version_base"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  base_version_no integer;
BEGIN
  IF NEW."base_version_id" IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."base_version_id" = NEW."id" THEN
    RAISE EXCEPTION 'base plan version cannot reference itself';
  END IF;
  SELECT "version_no" INTO base_version_no
  FROM "project_plan_version"
  WHERE "id" = NEW."base_version_id" AND "project_plan_id" = NEW."project_plan_id";
  IF base_version_no IS NULL OR base_version_no >= NEW."version_no" THEN
    RAISE EXCEPTION 'base plan version must be an earlier version in the same plan';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "project_plan_version_base_order"
BEFORE INSERT OR UPDATE OF "base_version_id", "version_no" ON "project_plan_version"
FOR EACH ROW EXECUTE FUNCTION "validate_plan_version_base"();

-- Version property rows must belong to the same stable project plan.
CREATE FUNCTION "validate_project_version_scope"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  version_plan_id uuid;
  stable_plan_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'project_stage_version' THEN
    SELECT "project_plan_id" INTO version_plan_id FROM "project_plan_version" WHERE "id" = NEW."project_plan_version_id";
    SELECT "project_plan_id" INTO stable_plan_id FROM "project_stage" WHERE "id" = NEW."project_stage_id";
  ELSIF TG_TABLE_NAME = 'project_workflow_version' THEN
    SELECT "project_plan_id" INTO version_plan_id FROM "project_plan_version" WHERE "id" = NEW."project_plan_version_id";
    SELECT "project_plan_id" INTO stable_plan_id FROM "project_workflow" WHERE "id" = NEW."project_workflow_id";
  ELSE
    SELECT "project_plan_id" INTO version_plan_id FROM "project_plan_version" WHERE "id" = NEW."project_plan_version_id";
    SELECT "project_plan_id" INTO stable_plan_id FROM "project_workflow_stage" WHERE "id" = NEW."project_workflow_stage_id";
  END IF;

  IF version_plan_id IS NOT NULL AND stable_plan_id IS NOT NULL AND version_plan_id <> stable_plan_id THEN
    RAISE EXCEPTION 'version property row must use a stable identity from the same project plan';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "project_stage_version_scope"
BEFORE INSERT OR UPDATE OF "project_plan_version_id", "project_stage_id" ON "project_stage_version"
FOR EACH ROW EXECUTE FUNCTION "validate_project_version_scope"();

CREATE TRIGGER "project_workflow_version_scope"
BEFORE INSERT OR UPDATE OF "project_plan_version_id", "project_workflow_id" ON "project_workflow_version"
FOR EACH ROW EXECUTE FUNCTION "validate_project_version_scope"();

CREATE TRIGGER "project_workflow_stage_version_scope"
BEFORE INSERT OR UPDATE OF "project_plan_version_id", "project_workflow_stage_id" ON "project_workflow_stage_version"
FOR EACH ROW EXECUTE FUNCTION "validate_project_version_scope"();

-- Self-referential history links must point to earlier records in the same business chain.
CREATE FUNCTION "validate_workflow_update_source"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  source_stage_id uuid;
  source_submitted_at timestamptz;
BEGIN
  IF NEW."source_update_id" IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."source_update_id" = NEW."id" THEN
    RAISE EXCEPTION 'workflow update cannot reference itself';
  END IF;
  SELECT "project_workflow_stage_id", "submitted_at" INTO source_stage_id, source_submitted_at
  FROM "workflow_update"
  WHERE "id" = NEW."source_update_id" AND "project_id" = NEW."project_id";
  IF source_stage_id IS NULL OR source_stage_id <> NEW."project_workflow_stage_id" OR source_submitted_at > NEW."submitted_at" THEN
    RAISE EXCEPTION 'source workflow update must be an earlier update for the same stable node';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "workflow_update_source_history"
BEFORE INSERT OR UPDATE OF "source_update_id", "submitted_at" ON "workflow_update"
FOR EACH ROW EXECUTE FUNCTION "validate_workflow_update_source"();

CREATE FUNCTION "validate_previous_request"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  previous_submitted_at timestamptz;
BEGIN
  IF NEW."previous_request_id" IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."previous_request_id" = NEW."id" THEN
    RAISE EXCEPTION 'request cannot reference itself';
  END IF;

  IF TG_TABLE_NAME = 'project_completion_request' THEN
    SELECT "submitted_at" INTO previous_submitted_at FROM "project_completion_request"
    WHERE "id" = NEW."previous_request_id" AND "project_id" = NEW."project_id";
  ELSIF TG_TABLE_NAME = 'project_field_change_request' THEN
    SELECT "submitted_at" INTO previous_submitted_at FROM "project_field_change_request"
    WHERE "id" = NEW."previous_request_id" AND "project_id" = NEW."project_id";
  ELSE
    SELECT "submitted_at" INTO previous_submitted_at FROM "project_plan_change_request"
    WHERE "id" = NEW."previous_request_id" AND "project_id" = NEW."project_id" AND "project_plan_id" = NEW."project_plan_id";
  END IF;

  IF previous_submitted_at IS NULL OR previous_submitted_at > NEW."submitted_at" THEN
    RAISE EXCEPTION 'previous request must be an earlier request in the same business chain';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "project_completion_request_history"
BEFORE INSERT OR UPDATE OF "previous_request_id", "submitted_at" ON "project_completion_request"
FOR EACH ROW EXECUTE FUNCTION "validate_previous_request"();

CREATE TRIGGER "project_field_change_request_history"
BEFORE INSERT OR UPDATE OF "previous_request_id", "submitted_at" ON "project_field_change_request"
FOR EACH ROW EXECUTE FUNCTION "validate_previous_request"();

CREATE TRIGGER "project_plan_change_request_history"
BEFORE INSERT OR UPDATE OF "previous_request_id", "submitted_at" ON "project_plan_change_request"
FOR EACH ROW EXECUTE FUNCTION "validate_previous_request"();

-- Typed field changes use exactly one value family and must actually change value.
ALTER TABLE "project_field_change_item" ADD CONSTRAINT "project_field_change_item_value_family_check" CHECK (
  num_nonnulls("old_value_text", "new_value_text") > 0
    AND "old_value_text" IS DISTINCT FROM "new_value_text"
    AND num_nonnulls("old_option_id", "new_option_id", "old_number_value", "new_number_value", "old_date_value", "new_date_value") = 0
  OR num_nonnulls("old_option_id", "new_option_id") > 0
    AND "old_option_id" IS DISTINCT FROM "new_option_id"
    AND num_nonnulls("old_value_text", "new_value_text", "old_number_value", "new_number_value", "old_date_value", "new_date_value") = 0
  OR num_nonnulls("old_number_value", "new_number_value") > 0
    AND "old_number_value" IS DISTINCT FROM "new_number_value"
    AND num_nonnulls("old_value_text", "new_value_text", "old_option_id", "new_option_id", "old_date_value", "new_date_value") = 0
  OR num_nonnulls("old_date_value", "new_date_value") > 0
    AND "old_date_value" IS DISTINCT FROM "new_date_value"
    AND num_nonnulls("old_value_text", "new_value_text", "old_option_id", "new_option_id", "old_number_value", "new_number_value") = 0
);

ALTER TABLE "project_completion_check" ADD CONSTRAINT "project_completion_check_exception_check" CHECK (
  btrim("result_summary") <> ''
  AND NOT ("check_code" = 'NO_PATIENT_LEVEL_DATA' AND "result" = 'EXCEPTION_DECLARED')
);

-- The OTHER issue type is the only type that accepts free-text clarification.
CREATE FUNCTION "validate_issue_type_other"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  selected_option_code text;
BEGIN
  SELECT "option_code" INTO selected_option_code
  FROM "dictionary_option"
  WHERE "dictionary_code" = NEW."issue_type_code" AND "id" = NEW."issue_type_option_id";

  IF selected_option_code = 'OTHER' AND NULLIF(btrim(NEW."issue_type_other_text"), '') IS NULL THEN
    RAISE EXCEPTION 'OTHER issue type requires issue_type_other_text';
  ELSIF selected_option_code IS DISTINCT FROM 'OTHER' AND NEW."issue_type_other_text" IS NOT NULL THEN
    RAISE EXCEPTION 'issue_type_other_text is only allowed for OTHER issue type';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "issue_type_other_text_consistency"
BEFORE INSERT OR UPDATE OF "issue_type_option_id", "issue_type_other_text" ON "issue"
FOR EACH ROW EXECUTE FUNCTION "validate_issue_type_other"();

-- A primary-owner change may reference only active Key Sub-I assignments in the same project.
CREATE FUNCTION "validate_primary_key_sub_i_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  new_role "RoleCode";
  new_status "AssignmentStatus";
  previous_role "RoleCode";
BEGIN
  SELECT "role_code", "assignment_status" INTO new_role, new_status
  FROM "role_assignment"
  WHERE "project_id" = NEW."project_id" AND "id" = NEW."new_role_assignment_id";
  IF new_role IS DISTINCT FROM 'KEY_SUB_I' OR new_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'new primary assignment must be an active Key Sub-I in the same project';
  END IF;

  IF NEW."previous_role_assignment_id" IS NOT NULL THEN
    SELECT "role_code" INTO previous_role
    FROM "role_assignment"
    WHERE "project_id" = NEW."project_id" AND "id" = NEW."previous_role_assignment_id";
    IF previous_role IS DISTINCT FROM 'KEY_SUB_I' THEN
      RAISE EXCEPTION 'previous primary assignment must be a Key Sub-I in the same project';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "project_primary_key_sub_i_change_scope"
BEFORE INSERT ON "project_primary_key_sub_i_change"
FOR EACH ROW EXECUTE FUNCTION "validate_primary_key_sub_i_change"();

-- Issue terminal fields and the current handling state are checked at commit.
CREATE FUNCTION "validate_issue_terminal_state"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_project_id uuid;
  target_issue_id uuid;
  current_state "IssueHandlingStateCode";
  issue_row record;
BEGIN
  IF TG_TABLE_NAME = 'issue' THEN
    target_project_id := NEW."project_id";
    target_issue_id := NEW."id";
  ELSE
    target_project_id := NEW."project_id";
    target_issue_id := NEW."issue_id";
  END IF;

  SELECT * INTO issue_row FROM "issue"
  WHERE "project_id" = target_project_id AND "id" = target_issue_id;

  SELECT "state_code" INTO current_state FROM "issue_handling_state"
  WHERE "project_id" = target_project_id AND "issue_id" = target_issue_id AND "exited_at" IS NULL;

  IF current_state = 'RESOLVED' THEN
    IF issue_row."resolved_at" IS NULL OR issue_row."resolution_method" IS NULL OR issue_row."resolved_by_person_id" IS NULL OR issue_row."closed_at" IS NOT NULL THEN
      RAISE EXCEPTION 'resolved issue fields are inconsistent with current handling state';
    END IF;
  ELSIF current_state = 'CLOSED_INVALID' THEN
    IF issue_row."closed_at" IS NULL OR issue_row."invalid_close_reason_code" IS NULL OR issue_row."invalid_close_explanation" IS NULL THEN
      RAISE EXCEPTION 'invalidly closed issue fields are incomplete';
    END IF;
  ELSE
    IF issue_row."resolved_at" IS NOT NULL OR issue_row."closed_at" IS NOT NULL THEN
      RAISE EXCEPTION 'non-terminal issue cannot carry terminal timestamps';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "issue_terminal_state_consistency"
AFTER INSERT OR UPDATE ON "issue"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "validate_issue_terminal_state"();

CREATE CONSTRAINT TRIGGER "issue_handling_terminal_state_consistency"
AFTER INSERT OR UPDATE ON "issue_handling_state"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "validate_issue_terminal_state"();
