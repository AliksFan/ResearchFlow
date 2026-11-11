import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = resolve(packageDirectory, "prisma/schema.prisma");
const oldMigrationPath = resolve(
  packageDirectory,
  "prisma/migrations/20260723000100_initial/migration.sql",
);
const migrationPath = resolve(
  packageDirectory,
  "prisma/migrations/20260814000100_formal_relation_schema_baseline/migration.sql",
);
const authMigrationPath = resolve(
  packageDirectory,
  "prisma/migrations/20260817000100_auth_foundation/migration.sql",
);
const identifierTriggerFixMigrationPath = resolve(
  packageDirectory,
  "prisma/migrations/20260817000200_fix_formal_identifier_trigger/migration.sql",
);
const projectApplicationMigrationPath = resolve(
  packageDirectory,
  "prisma/migrations/20260818000100_project_application_establishment/migration.sql",
);
const workflowSolutionMigrationPath = resolve(
  packageDirectory,
  "prisma/migrations/20260828000100_workflow_solutions_and_application_node_deadlines/migration.sql",
);
const applicationFreezeGuardMigrationPath = resolve(
  packageDirectory,
  "prisma/migrations/20260831000100_update_application_freeze_guard/migration.sql",
);
const applicationSwimlaneMigrationPath = resolve(
  packageDirectory,
  "prisma/migrations/20260903000200_project_application_swimlane/migration.sql",
);
const phase2MigrationPath = resolve(
  packageDirectory,
  "prisma/migrations/20260821000100_phase_2_relation_schema/migration.sql",
);
const formalBaselineSha256 =
  "ad74d9d6f90cfea374dadb28e605af9dfd7a97cab42d010fc0296133512bfe86";

const requiredModels = [
  "Person",
  "Session",
  "RoleAssignment",
  "RoleEligibility",
  "AuthCredentialToken",
  "PasswordHistory",
  "AuthRateLimit",
  "Project",
  "ProjectApplicationVersion",
  "ProjectApplicationVersionOwner",
  "ProjectApplicationSwimlaneStage",
  "ProjectApplicationSwimlaneWorkflow",
  "ProjectApplicationSwimlaneNode",
  "ProjectApplicationSwimlaneNodeRole",
  "ProjectApplicationSwimlaneDependency",
  "DictionaryOptionSuggestion",
  "DictionaryOptionSuggestionSource",
  "ProjectApplicationActivity",
  "ProjectApplicationCommand",
  "ProjectCollaboratingCenter",
  "ProjectEstablishmentReview",
  "ProjectCompletionRequest",
  "ProjectCompletionCheck",
  "ProjectCompletionActivity",
  "ProjectPrimaryKeySubIChange",
  "ProjectFieldChangeRequest",
  "ProjectFieldChangeItem",
  "ProjectFieldChangeActivity",
  "ProjectGovernanceSetting",
  "LifecycleTemplate",
  "LifecycleTemplateVersion",
  "StageTemplate",
  "WorkflowTemplate",
  "WorkflowStageTemplate",
  "ProjectPlan",
  "ProjectPlanVersion",
  "ProjectPlanChangeRequest",
  "ProjectPlanChangeActivity",
  "ProjectStage",
  "ProjectStageVersion",
  "ProjectWorkflow",
  "ProjectWorkflowVersion",
  "ProjectWorkflowStage",
  "ProjectWorkflowStageVersion",
  "ProjectWorkflowStageRoleVersion",
  "ProjectWorkflowStageReminderPointVersion",
  "ProjectReminderSetting",
  "WorkflowUpdate",
  "WorkflowUpdateCorrection",
  "WorkflowStageTemplateDependency",
  "ProjectWorkflowStageDependencyVersion",
  "WorkflowCompletionRequest",
  "WorkflowCompletionSubmission",
  "WorkflowCompletionSupplement",
  "WorkflowCompletionReviewRound",
  "WorkflowCompletionReviewPause",
  "WorkflowCompletionActivity",
  "Issue",
  "IssueHandlingState",
  "IssueActivity",
  "IssueDecisionRound",
  "IssueDeanDecision",
  "IssueImplementationSubmission",
  "IssueImplementationReview",
  "IssueDeanReviewTransfer",
  "IssueSharedSummary",
  "IssueConfirmationSetting",
  "ExternalContact",
  "IssueEmail",
  "IssueEmailRecipient",
  "EmailDeliveryAttempt",
  "Notification",
  "CollaborationTimeLimitSetting",
  "NotificationOutbox",
  "NotificationOutboxAttempt",
  "ProjectCompletionSubmissionVersion",
  "ProjectCompletionReviewRound",
  "ProjectCompletionSupplementRound",
  "ProjectCompletionBlock",
  "ProjectArchiveActivity",
  "AttachmentDraft",
  "AttachmentUploadSession",
  "FileAsset",
  "BusinessAttachment",
  "AttachmentCleanupRun",
  "ReminderRun",
  "WorkerHeartbeat",
  "Dictionary",
  "DictionaryOption",
  "AuditLog",
  "ExportJob",
];

const forbiddenModels = [
  "User",
  "ProjectApplication",
  "ApplicationRevision",
  "ProjectAssignment",
  "ProjectUpdate",
  "ChangeRequest",
  "ChangeRequestItem",
  "DeanDecision",
  "ExecutionItem",
  "EmailNotification",
  "ProjectBlocker",
  "ImportBatch",
  "ImportRow",
  "WorkflowUpdateReview",
];

const requiredPhase2MigrationTokens = [
  'CREATE TABLE "workflow_completion_request"',
  'CREATE TABLE "collaboration_time_limit_setting"',
  'CREATE TABLE "business_attachment"',
  'CREATE TABLE "notification_outbox"',
  'DROP TABLE "workflow_update_review"',
  'DROP COLUMN "budget_used"',
  'workflow_completion_request_one_active_per_stage_key',
  'business_attachment_exactly_one_parent_check',
  'collaboration_time_limit_global_scope_key',
];

const requiredMigrationTokens = [
  'CREATE SEQUENCE "project_code_sequence"',
  'CREATE TABLE "person"',
  'CREATE TABLE "role_assignment"',
  'CREATE TABLE "project_plan_version"',
  'CREATE TABLE "issue_handling_state"',
  'CREATE TABLE "notification"',
  'CREATE TABLE "export_job"',
  'role_assignment_active_project_role_person_key',
  'role_assignment_active_global_role_person_key',
  'role_assignment_active_primary_key_sub_i_key',
  'project_plan_version_one_active_key',
  'issue_handling_state_one_current_key',
];

const requiredAuthSchemaTokens = [
  "passwordHash",
  "mustChangePassword",
  "failedLoginCount",
  "failedLoginWindowStartedAt",
  "lockedUntil",
  "passwordChangedAt",
  "grantSource",
  "model AuthCredentialToken {",
  "model PasswordHistory {",
  "model AuthRateLimit {",
];

const requiredAuthMigrationTokens = [
  'CREATE TYPE "CredentialTokenPurpose"',
  'CREATE TYPE "AuthRateLimitDimension"',
  'CREATE TYPE "RoleAssignmentGrantSource"',
  'ALTER COLUMN "password_hash" DROP NOT NULL',
  'CREATE TABLE "auth_credential_token"',
  'CREATE TABLE "password_history"',
  'CREATE TABLE "auth_rate_limit"',
  'role_assignment_grant_source_check',
  'role_assignment_single_system_bootstrap_key',
];

const requiredIdentifierTriggerFixTokens = [
  'CREATE OR REPLACE FUNCTION "prevent_formal_identifier_change"()',
  "IF TG_TABLE_NAME = 'project' THEN",
  "ELSIF TG_TABLE_NAME = 'dictionary' THEN",
  "ELSIF TG_TABLE_NAME = 'dictionary_option' THEN",
];

const requiredProjectApplicationSchemaTokens = [
  "applicationCode",
  "currentApplicationVersionId",
  "normalizedNameOccupancy",
  "REJECTED",
  "model RoleEligibility {",
  "model ProjectApplicationVersion {",
  "model ProjectApplicationVersionOwner {",
  "model ProjectApplicationSwimlaneStage {",
  "model ProjectApplicationSwimlaneDependency {",
  "model ProjectApplicationActivity {",
  "model ProjectApplicationCommand {",
];

const requiredProjectApplicationMigrationTokens = [
  'CREATE SEQUENCE "project_application_code_sequence"',
  'CREATE TABLE "role_eligibility"',
  'CREATE TABLE "project_application_version"',
  'CREATE TABLE "project_application_version_owner"',
  'CREATE TABLE "project_application_version_stage_plan"',
  'CREATE TABLE "project_application_activity"',
  'CREATE TABLE "project_application_command"',
  'project_normalized_name_occupancy_key',
  'role_eligibility_one_active_key',
  'project_application_version_one_editable_key',
];

const failures = [];
const schema = readFileSync(schemaPath, "utf8");

for (const model of requiredModels) {
  if (!new RegExp(`^model ${model} \\{`, "m").test(schema)) {
    failures.push(`missing Prisma model: ${model}`);
  }
}

if (!existsSync(workflowSolutionMigrationPath)) {
  failures.push(`workflow solution migration not found: ${workflowSolutionMigrationPath}`);
} else {
  const workflowSolutionMigration = readFileSync(workflowSolutionMigrationPath, "utf8");
  for (const token of [
    'CREATE TABLE "project_application_version_node_plan"',
    'DROP TABLE "project_application_version_stage_plan"',
    'ALTER COLUMN "planned_end_date" DROP NOT NULL',
  ]) {
    if (!workflowSolutionMigration.includes(token)) failures.push(`workflow solution migration token missing: ${token}`);
  }
}

if (!existsSync(applicationFreezeGuardMigrationPath)) {
  failures.push(`application freeze guard migration not found: ${applicationFreezeGuardMigrationPath}`);
} else {
  const applicationFreezeGuardMigration = readFileSync(applicationFreezeGuardMigrationPath, "utf8");
  for (const token of [
    'CREATE OR REPLACE FUNCTION "validate_application_version_freeze"()',
    'NEW."lifecycle_template_version_id" IS NULL',
  ]) {
    if (!applicationFreezeGuardMigration.includes(token)) failures.push(`application freeze guard migration token missing: ${token}`);
  }
  for (const forbiddenToken of ['NEW."priority_option_id" IS NULL', 'project_application_version_stage_plan']) {
    if (applicationFreezeGuardMigration.includes(forbiddenToken)) failures.push(`application freeze guard retains obsolete token: ${forbiddenToken}`);
  }
}

if (!existsSync(applicationSwimlaneMigrationPath)) {
  failures.push(`application swimlane migration not found: ${applicationSwimlaneMigrationPath}`);
} else {
  const migration = readFileSync(applicationSwimlaneMigrationPath, "utf8");
  for (const token of [
    'CREATE TABLE "project_application_swimlane_stage"',
    'CREATE TABLE "project_application_swimlane_node"',
    'application_swimlane_node_stage_fkey',
    'DROP TABLE "project_application_version_stage_plan"',
  ]) if (!migration.includes(token)) failures.push(`application swimlane migration token missing: ${token}`);
}

for (const model of forbiddenModels) {
  if (new RegExp(`^model ${model} \\{`, "m").test(schema)) {
    failures.push(`deprecated Prisma model remains: ${model}`);
  }
}

for (const token of requiredAuthSchemaTokens) {
  if (!schema.includes(token)) {
    failures.push(`authentication schema token missing: ${token}`);
  }
}

for (const token of requiredProjectApplicationSchemaTokens) {
  if (!schema.includes(token)) {
    failures.push(`project application schema token missing: ${token}`);
  }
}

if (existsSync(oldMigrationPath)) {
  failures.push("deprecated initial migration still exists");
}

if (!existsSync(migrationPath)) {
  failures.push("formal baseline migration is missing");
} else {
  const migration = readFileSync(migrationPath, "utf8");
  const actualBaselineSha256 = createHash("sha256")
    .update(migration)
    .digest("hex");
  if (actualBaselineSha256 !== formalBaselineSha256) {
    failures.push("formal baseline migration was modified");
  }
  for (const token of requiredMigrationTokens) {
    if (!migration.includes(token)) {
      failures.push(`migration token missing: ${token}`);
    }
  }

  for (const model of forbiddenModels) {
    if (migration.includes(`CREATE TABLE "${model}"`)) {
      failures.push(`deprecated migration table remains: ${model}`);
    }
  }
}


if (!existsSync(authMigrationPath)) {
  failures.push("authentication forward migration is missing");
} else {
  const authMigration = readFileSync(authMigrationPath, "utf8");
  for (const token of requiredAuthMigrationTokens) {
    if (!authMigration.includes(token)) {
      failures.push(`authentication migration token missing: ${token}`);
    }
  }
}

if (!existsSync(identifierTriggerFixMigrationPath)) {
  failures.push("formal identifier trigger fix migration is missing");
} else {
  const identifierTriggerFixMigration = readFileSync(
    identifierTriggerFixMigrationPath,
    "utf8",
  );
  for (const token of requiredIdentifierTriggerFixTokens) {
    if (!identifierTriggerFixMigration.includes(token)) {
      failures.push(`formal identifier trigger fix token missing: ${token}`);
    }
  }
}


if (!existsSync(projectApplicationMigrationPath)) {
  failures.push("project application forward migration is missing");
} else {
  const projectApplicationMigration = readFileSync(
    projectApplicationMigrationPath,
    "utf8",
  );
  for (const token of requiredProjectApplicationMigrationTokens) {
    if (!projectApplicationMigration.includes(token)) {
      failures.push(`project application migration token missing: ${token}`);
    }
  }
}

if (!existsSync(phase2MigrationPath)) {
  failures.push("phase 2 relation schema forward migration is missing");
} else {
  const phase2Migration = readFileSync(phase2MigrationPath, "utf8");
  for (const token of requiredPhase2MigrationTokens) {
    if (!phase2Migration.includes(token)) {
      failures.push(`phase 2 migration token missing: ${token}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Formal schema contract validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Formal schema contract validation passed (${requiredModels.length} models).`,
  );
}
