import console from "node:console";
import process from "node:process";
import { URL } from "node:url";
import pg from "pg";

const { Client } = pg;

if (process.env.RF_SCHEMA_TEST_DATABASE !== "1") {
  throw new Error(
    "Refusing database validation without RF_SCHEMA_TEST_DATABASE=1.",
  );
}

const databaseUrl = new URL(process.env.DATABASE_URL);
const requestedSchema = databaseUrl.searchParams.get("schema") ?? "public";
if (!/^[a-z][a-z0-9_]*$/u.test(requestedSchema)) {
  throw new Error("Refusing database validation with an invalid schema name.");
}
const client = new Client({ connectionString: process.env.DATABASE_URL });

const expectedTables = [
  "person",
  "auth_credential_token",
  "password_history",
  "auth_rate_limit",
  "role_assignment",
  "role_eligibility",
  "project",
  "project_application_version",
  "project_application_version_owner",
  "project_application_swimlane_stage",
  "project_application_swimlane_workflow",
  "project_application_swimlane_node",
  "project_application_swimlane_node_role",
  "project_application_swimlane_dependency",
  "dictionary_option_suggestion",
  "dictionary_option_suggestion_source",
  "project_application_activity",
  "project_application_command",
  "project_plan",
  "project_plan_version",
  "project_workflow_stage",
  "project_workflow_stage_dependency_version",
  "workflow_stage_template_dependency",
  "workflow_update_correction",
  "workflow_completion_request",
  "workflow_completion_submission",
  "workflow_completion_supplement",
  "workflow_completion_review_round",
  "workflow_completion_review_pause",
  "workflow_completion_activity",
  "project_completion_submission_version",
  "project_completion_review_round",
  "project_completion_supplement_round",
  "project_completion_block",
  "project_archive_activity",
  "issue",
  "issue_handling_state",
  "issue_decision_round",
  "issue_dean_decision",
  "issue_implementation_submission",
  "issue_implementation_review",
  "issue_dean_review_transfer",
  "issue_shared_summary",
  "notification",
  "collaboration_time_limit_setting",
  "notification_outbox",
  "notification_outbox_attempt",
  "attachment_draft",
  "attachment_upload_session",
  "file_asset",
  "business_attachment",
  "attachment_cleanup_run",
  "audit_log",
  "export_job",
  "reminder_run",
];

const deprecatedTables = [
  "User",
  "ProjectApplication",
  "ApplicationRevision",
  "ProjectAssignment",
  "ProjectUpdate",
  "ChangeRequest",
  "DeanDecision",
  "ExecutionItem",
  "EmailNotification",
  "ImportBatch",
  "ImportRow",
];

async function expectConstraintViolation(label, operation) {
  const savepoint = `check_${label.replaceAll(/[^a-z0-9]/gi, "_")}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await operation();
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    if (error?.code === "23502" || error?.code === "23503" || error?.code === "23505" || error?.code === "23514") {
      return;
    }
    throw error;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  throw new Error(`Expected database constraint violation: ${label}`);
}

async function expectTriggerViolation(label, expectedMessage, operation) {
  const savepoint = `check_${label.replaceAll(/[^a-z0-9]/gi, "_")}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await operation();
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    if (error?.code === "P0001" && error.message.includes(expectedMessage)) {
      return;
    }
    throw error;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  throw new Error(`Expected trigger violation: ${label}`);
}

try {
  await client.connect();
  await client.query("SELECT set_config('search_path', $1, false)", [
    requestedSchema,
  ]);
  const identity = await client.query(
    "SELECT current_database() AS database_name, current_schema() AS schema_name, current_user AS user_name, current_setting('server_version') AS server_version",
  );
  const {
    database_name: databaseName,
    schema_name: schemaName,
    server_version: serverVersion,
  } =
    identity.rows[0];

  if (!/(test|validation|scratch)/i.test(databaseName)) {
    throw new Error(
      "Refusing to validate against a database whose name is not explicitly test/validation/scratch scoped.",
    );
  }

  const tables = await client.query(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = $1",
    [schemaName],
  );
  const tableNames = new Set(tables.rows.map(({ tablename }) => tablename));
  for (const table of expectedTables) {
    if (!tableNames.has(table)) {
      throw new Error(`Expected table is missing: ${table}`);
    }
  }
  for (const table of deprecatedTables) {
    if (tableNames.has(table)) {
      throw new Error(`Deprecated table remains: ${table}`);
    }
  }
  const formalTableCount = tableNames.size - (tableNames.has("_prisma_migrations") ? 1 : 0);
  if (formalTableCount !== 90) {
    throw new Error(`Expected 90 formal model tables, found ${formalTableCount}`);
  }

  const sequences = await client.query(
    "SELECT sequencename FROM pg_catalog.pg_sequences WHERE schemaname = $1 AND sequencename IN ('project_code_sequence', 'project_application_code_sequence')",
    [schemaName],
  );
  if (sequences.rowCount !== 2) {
    throw new Error("formal project/application sequences are missing");
  }

  const requiredIndexes = [
    "role_assignment_active_project_role_person_key",
    "role_assignment_active_global_role_person_key",
    "role_assignment_active_primary_key_sub_i_key",
    "role_assignment_single_system_bootstrap_key",
    "auth_credential_token_one_open_per_purpose_key",
    "project_plan_version_one_active_key",
    "issue_handling_state_one_current_key",
    "notification_event_recipient_role_key",
    "role_eligibility_one_active_key",
    "project_application_version_one_editable_key",
    "project_application_version_one_primary_owner_key",
    "project_normalized_name_occupancy_key",
    "workflow_completion_request_one_active_per_stage_key",
    "workflow_completion_review_round_one_active_key",
    "project_completion_request_one_active_key",
    "project_completion_review_round_one_active_key",
    "project_completion_supplement_round_one_open_key",
    "project_completion_block_one_open_source_key",
    "collaboration_time_limit_global_scope_key",
    "workflow_stage_template_template_version_id_id_key",
    "notification_id_recipient_person_id_key",
    "notification_outbox_lease_expires_at_idx",
    "file_asset_cleanup_next_attempt_at_cleanup_lease_expires_at_idx",
    "reminder_run_lease_expires_at_next_attempt_at_idx",
    "application_swimlane_stage_version_id_key",
    "application_swimlane_workflow_version_id_key",
    "application_swimlane_node_version_id_key",
    "application_swimlane_dependency_edge_key",
    "dictionary_suggestion_name_key",
    "dictionary_option_suggestion_source_application_field_key",
    "dictionary_option_suggestion_source_issue_field_key",
  ];
  const indexes = await client.query(
    "SELECT indexname FROM pg_catalog.pg_indexes WHERE schemaname = $1",
    [schemaName],
  );
  const indexNames = new Set(indexes.rows.map(({ indexname }) => indexname));
  for (const index of requiredIndexes) {
    if (!indexNames.has(index)) {
      throw new Error(`Required index is missing: ${index}`);
    }
  }

  const requiredConstraints = [
    "workflow_update_budget_amount_positive_check",
    "workflow_update_correction_expected_date_mode_check",
    "workflow_update_correction_budget_mode_check",
    "collaboration_time_limit_positive_check",
    "attachment_draft_context_check",
    "business_attachment_exactly_one_parent_check",
    "business_attachment_parent_type_check",
    "notification_outbox_notification_id_recipient_person_id_fkey",
    "notification_outbox_attempt_count_check",
    "notification_outbox_lease_state_check",
    "file_asset_cleanup_attempt_count_check",
    "file_asset_cleanup_lease_pair_check",
    "reminder_run_attempt_count_check",
    "reminder_run_lease_state_check",
    "project_application_version_funding_record_amount_cny_check",
    "dictionary_option_suggestion_source_exactly_one_parent_check",
  ];
  const constraints = await client.query(
    `SELECT constraint_name FROM information_schema.table_constraints
     WHERE constraint_schema = $1`,
    [schemaName],
  );
  const constraintNames = new Set(constraints.rows.map(({ constraint_name }) => constraint_name));
  for (const constraint of requiredConstraints) {
    if (!constraintNames.has(constraint)) {
      throw new Error(`Required constraint is missing: ${constraint}`);
    }
  }

  const requiredTriggers = [
    "project_workflow_stage_dependency_scope_trigger",
    "workflow_completion_current_submission_scope_trigger",
    "project_completion_current_submission_scope_trigger",
    "attachment_upload_session_scope_trigger",
  ];
  const triggers = await client.query(
    `SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = $1`,
    [schemaName],
  );
  const triggerNames = new Set(triggers.rows.map(({ trigger_name }) => trigger_name));
  for (const trigger of requiredTriggers) {
    if (!triggerNames.has(trigger)) {
      throw new Error(`Required trigger is missing: ${trigger}`);
    }
  }

  await client.query("BEGIN");

  const ids = {
    pmo: "00000000-0000-4000-8000-000000000001",
    keySubI: "00000000-0000-4000-8000-000000000002",
    otherKeySubI: "00000000-0000-4000-8000-000000000003",
    invitedPerson: "00000000-0000-4000-8000-000000000004",
    project: "10000000-0000-4000-8000-000000000001",
    applicationVersion: "10000000-0000-4000-8000-000000000002",
    lifecycle: "20000000-0000-4000-8000-000000000001",
    lifecycleVersion: "20000000-0000-4000-8000-000000000002",
    stageTemplate: "20000000-0000-4000-8000-000000000003",
    projectPlan: "30000000-0000-4000-8000-000000000001",
    planVersion1: "30000000-0000-4000-8000-000000000002",
    planVersion2: "30000000-0000-4000-8000-000000000003",
    projectStage: "40000000-0000-4000-8000-000000000001",
    projectWorkflow: "40000000-0000-4000-8000-000000000002",
    workflowStage: "40000000-0000-4000-8000-000000000003",
    projectWorkflow2: "40000000-0000-4000-8000-000000000004",
    workflowStage2: "40000000-0000-4000-8000-000000000005",
    otherProject: "10000000-0000-4000-8000-000000000004",
    issue: "50000000-0000-4000-8000-000000000001",
    workflowUpdate: "50000000-0000-4000-8000-000000000002",
  };

  await client.query(
    `INSERT INTO "person" ("id", "display_name", "login_name", "password_hash", "account_status", "created_at", "updated_at")
     VALUES ($1, '虚拟 PMO', 'virtual-pmo', 'not-a-real-password-hash', 'ACTIVE', now(), now()),
            ($2, '虚拟 Key Sub-I', 'virtual-key-sub-i', 'not-a-real-password-hash', 'ACTIVE', now(), now()),
            ($3, '虚拟 Key Sub-I 二号', 'virtual-key-sub-i-2', 'not-a-real-password-hash', 'ACTIVE', now(), now())`,
    [ids.pmo, ids.keySubI, ids.otherKeySubI],
  );

  await client.query(
    `INSERT INTO "person" ("id", "display_name", "login_name", "account_status", "created_at", "updated_at")
     VALUES ($1, '虚拟待激活人员', 'virtual-invited', 'INVITED', now(), now())`,
    [ids.invitedPerson],
  );

  await expectConstraintViolation("invalid normalized login name", () =>
    client.query(
      `INSERT INTO "person" ("id", "display_name", "login_name", "account_status", "created_at", "updated_at")
       VALUES ('00000000-0000-4000-8000-000000000005', '虚拟非法账号', 'Invalid..Login', 'INVITED', now(), now())`,
    ),
  );

  await expectConstraintViolation("negative person login failure count", () =>
    client.query(
      `UPDATE "person" SET "failed_login_count" = -1 WHERE "id" = $1`,
      [ids.invitedPerson],
    ),
  );

  await client.query(
    `INSERT INTO "auth_credential_token" ("id", "person_id", "purpose", "token_hash", "expires_at", "created_at")
     VALUES ('01000000-0000-4000-8000-000000000001', $1, 'ACTIVATION', 'virtual-token-hash-1', now() + interval '72 hours', now())`,
    [ids.invitedPerson],
  );

  await expectConstraintViolation("second open credential of the same purpose", () =>
    client.query(
      `INSERT INTO "auth_credential_token" ("id", "person_id", "purpose", "token_hash", "expires_at", "created_at")
       VALUES ('01000000-0000-4000-8000-000000000002', $1, 'ACTIVATION', 'virtual-token-hash-2', now() + interval '72 hours', now())`,
      [ids.invitedPerson],
    ),
  );

  await expectConstraintViolation("credential expiry before creation", () =>
    client.query(
      `INSERT INTO "auth_credential_token" ("id", "person_id", "purpose", "token_hash", "expires_at", "created_at")
       VALUES ('01000000-0000-4000-8000-000000000003', $1, 'PASSWORD_RESET', 'virtual-token-hash-3', now() - interval '1 second', now())`,
      [ids.invitedPerson],
    ),
  );

  await expectConstraintViolation("negative rate limit failure count", () =>
    client.query(
      `INSERT INTO "auth_rate_limit" ("id", "dimension", "key_hash", "failure_count", "created_at", "updated_at")
       VALUES ('02000000-0000-4000-8000-000000000001', 'LOGIN_NAME', 'virtual-hmac-key', -1, now(), now())`,
    ),
  );

  const dictionarySpecs = [
    ["DISEASE_AREA", "虚拟疾病方向"],
    ["RESEARCH_TYPE", "虚拟研究类型"],
    ["ISSUE_TYPE", "虚拟问题类型"],
  ];
  const optionIds = new Map();
  for (const [index, [code, name]] of dictionarySpecs.entries()) {
    const dictionaryId = `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const optionId = `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    optionIds.set(code, optionId);
    await client.query(
      `INSERT INTO "dictionary" ("id", "dictionary_code", "dictionary_name", "description", "enabled", "created_at", "updated_at")
       VALUES ($1, $2, $3, '仅用于 migration 验证', true, now(), now())`,
      [dictionaryId, code, name],
    );
    await client.query(
      `INSERT INTO "dictionary_option" ("id", "dictionary_id", "dictionary_code", "option_code", "display_name", "sort_order", "enabled", "created_at", "updated_at")
       VALUES ($1, $2, $3, 'VIRTUAL', $4, 0, true, now(), now())`,
      [optionId, dictionaryId, code, name],
    );
  }

  await client.query(
    `UPDATE "dictionary" SET "description" = '虚拟更新说明' WHERE "dictionary_code" = 'DISEASE_AREA'`,
  );
  await client.query(
    `UPDATE "dictionary_option" SET "display_name" = '虚拟更新选项' WHERE "dictionary_code" = 'DISEASE_AREA' AND "option_code" = 'VIRTUAL'`,
  );
  await expectTriggerViolation("dictionary code immutable", "dictionary_code is immutable", () =>
    client.query(
      `UPDATE "dictionary" SET "dictionary_code" = 'DISEASE_AREA_CHANGED' WHERE "dictionary_code" = 'DISEASE_AREA'`,
    ),
  );
  await expectTriggerViolation("dictionary option code immutable", "dictionary option codes are immutable", () =>
    client.query(
      `UPDATE "dictionary_option" SET "option_code" = 'CHANGED' WHERE "dictionary_code" = 'DISEASE_AREA' AND "option_code" = 'VIRTUAL'`,
    ),
  );

  await client.query(
    `INSERT INTO "project" (
       "id", "application_code", "project_name", "project_summary", "applicant_person_id", "status", "row_version",
       "disease_area_dictionary_code", "disease_area_option_id",
       "research_type_dictionary_code", "research_type_option_id",
       "funding_record_amount_cny",
       "created_at", "updated_at"
     ) VALUES ($1, 'APP-9999', '虚拟 DEMO 项目', '仅用于 migration 验证', $2, 'DRAFT', 0,
       'DISEASE_AREA', $3, 'RESEARCH_TYPE', $4,
       100000.00, now(), now())`,
    [
      ids.project,
      ids.keySubI,
      optionIds.get("DISEASE_AREA"),
      optionIds.get("RESEARCH_TYPE"),
    ],
  );

  await client.query(
    `UPDATE "project" SET "project_name" = '虚拟 DEMO 项目（已更新）' WHERE "id" = $1`,
    [ids.project],
  );
  await expectTriggerViolation("application code immutable", "application_code is immutable once assigned", () =>
    client.query(
      `UPDATE "project" SET "application_code" = 'APP-9998' WHERE "id" = $1`,
      [ids.project],
    ),
  );
  await client.query(
    `UPDATE "project" SET "project_code" = 'DEMO-999', "established_at" = now() WHERE "id" = $1`,
    [ids.project],
  );
  await expectTriggerViolation("project code immutable", "project_code is immutable once assigned", () =>
    client.query(
      `UPDATE "project" SET "project_code" = 'DEMO-998' WHERE "id" = $1`,
      [ids.project],
    ),
  );

  await client.query(
    `INSERT INTO "role_assignment" ("id", "person_id", "role_code", "project_id", "assignment_status", "is_primary", "granted_by_person_id", "proposed_at", "activated_at")
     VALUES ('80000000-0000-4000-8000-000000000001', $1, 'PMO', NULL, 'ACTIVE', false, $1, now(), now()),
            ('80000000-0000-4000-8000-000000000002', $2, 'KEY_SUB_I', $3, 'ACTIVE', true, $1, now(), now())`,
    [ids.pmo, ids.keySubI, ids.project],
  );

  await client.query(
    `INSERT INTO "role_assignment" ("id", "person_id", "role_code", "assignment_status", "is_primary", "grant_source", "granted_by_person_id", "proposed_at", "activated_at")
     VALUES ('80000000-0000-4000-8000-000000000005', $1, 'PMO', 'ACTIVE', false, 'SYSTEM_BOOTSTRAP', NULL, now(), now())`,
    [ids.invitedPerson],
  );

  await expectConstraintViolation("second system bootstrap assignment", () =>
    client.query(
      `INSERT INTO "role_assignment" ("id", "person_id", "role_code", "assignment_status", "is_primary", "grant_source", "granted_by_person_id", "proposed_at", "activated_at")
       VALUES ('80000000-0000-4000-8000-000000000006', $1, 'PMO', 'ENDED', false, 'SYSTEM_BOOTSTRAP', NULL, now(), now())`,
      [ids.keySubI],
    ),
  );

  await expectConstraintViolation("system bootstrap only grants global PMO", () =>
    client.query(
      `INSERT INTO "role_assignment" ("id", "person_id", "role_code", "assignment_status", "is_primary", "grant_source", "granted_by_person_id", "proposed_at", "activated_at")
       VALUES ('80000000-0000-4000-8000-000000000007', $1, 'DEAN', 'ACTIVE', false, 'SYSTEM_BOOTSTRAP', NULL, now(), now())`,
      [ids.keySubI],
    ),
  );

  await expectConstraintViolation("PMO action requires a grantor", () =>
    client.query(
      `INSERT INTO "role_assignment" ("id", "person_id", "role_code", "assignment_status", "is_primary", "grant_source", "granted_by_person_id", "proposed_at", "activated_at")
       VALUES ('80000000-0000-4000-8000-000000000008', $1, 'DEAN', 'ACTIVE', false, 'PMO_ACTION', NULL, now(), now())`,
      [ids.keySubI],
    ),
  );

  await expectConstraintViolation("duplicate global role", () =>
    client.query(
      `INSERT INTO "role_assignment" ("id", "person_id", "role_code", "assignment_status", "is_primary", "granted_by_person_id", "proposed_at", "activated_at")
       VALUES ('80000000-0000-4000-8000-000000000003', $1, 'PMO', 'ACTIVE', false, $1, now(), now())`,
      [ids.pmo],
    ),
  );

  await expectConstraintViolation("second active primary Key Sub-I", () =>
    client.query(
      `INSERT INTO "role_assignment" ("id", "person_id", "role_code", "project_id", "assignment_status", "is_primary", "granted_by_person_id", "proposed_at", "activated_at")
       VALUES ('80000000-0000-4000-8000-000000000004', $1, 'KEY_SUB_I', $2, 'ACTIVE', true, $3, now(), now())`,
      [ids.otherKeySubI, ids.project, ids.pmo],
    ),
  );

  await client.query(
    `INSERT INTO "role_eligibility" ("id", "person_id", "role_code", "status", "granted_by_person_id", "granted_at", "reason")
     VALUES ('81000000-0000-4000-8000-000000000001', $1, 'KEY_SUB_I', 'ACTIVE', $2, now(), '虚拟申请资格')`,
    [ids.keySubI, ids.pmo],
  );
  await expectConstraintViolation("second active Key Sub-I eligibility", () =>
    client.query(
      `INSERT INTO "role_eligibility" ("id", "person_id", "role_code", "status", "granted_by_person_id", "granted_at", "reason")
       VALUES ('81000000-0000-4000-8000-000000000002', $1, 'KEY_SUB_I', 'ACTIVE', $2, now(), '虚拟重复资格')`,
      [ids.keySubI, ids.pmo],
    ),
  );
  await expectConstraintViolation("eligibility only supports Key Sub-I", () =>
    client.query(
      `INSERT INTO "role_eligibility" ("id", "person_id", "role_code", "status", "granted_by_person_id", "granted_at", "reason")
       VALUES ('81000000-0000-4000-8000-000000000003', $1, 'CRC', 'ACTIVE', $2, now(), '虚构非法资格')`,
      [ids.otherKeySubI, ids.pmo],
    ),
  );

  await client.query(
    `INSERT INTO "lifecycle_template" ("id", "template_code", "template_name", "status", "created_at")
     VALUES ($1, 'VIRTUAL', '虚拟模板', 'ACTIVE', now())`,
    [ids.lifecycle],
  );
  await client.query(
    `INSERT INTO "lifecycle_template_version" ("id", "lifecycle_template_id", "version_no", "status", "published_by_person_id", "published_at", "created_at")
     VALUES ($1, $2, 1, 'PUBLISHED', $3, now(), now())`,
    [ids.lifecycleVersion, ids.lifecycle, ids.pmo],
  );
  await client.query(
    `INSERT INTO "stage_template" ("id", "template_version_id", "stage_code", "stage_name", "sort_order", "default_applicability")
     VALUES ($1, $2, 'VIRTUAL_STAGE', '虚拟阶段', 0, 'REQUIRED')`,
    [ids.stageTemplate, ids.lifecycleVersion],
  );
  await client.query(
    `INSERT INTO "project_application_version" (
       "id", "project_id", "version_no", "version_status", "project_name", "project_summary",
       "disease_area_dictionary_code", "disease_area_option_id",
       "research_type_dictionary_code", "research_type_option_id", "lifecycle_template_version_id",
       "created_by_person_id", "created_at", "updated_at"
     ) VALUES ($1, $2, 1, 'EDITABLE', '虚拟 DEMO 项目（已更新）', '仅用于 migration 验证',
       'DISEASE_AREA', $3, 'RESEARCH_TYPE', $4, $5, $6, now(), now())`,
    [
      ids.applicationVersion,
      ids.project,
      optionIds.get("DISEASE_AREA"),
      optionIds.get("RESEARCH_TYPE"),
      ids.lifecycleVersion,
      ids.keySubI,
    ],
  );
  await client.query(
    `INSERT INTO "project_application_version_owner" ("id", "application_version_id", "person_id", "is_primary", "sort_order")
     VALUES ('82000000-0000-4000-8000-000000000001', $1, $2, true, 0)`,
    [ids.applicationVersion, ids.keySubI],
  );
  await client.query(
    `INSERT INTO "project_application_swimlane_stage" ("id", "application_version_id", "source_stage_template_id", "stage_code", "stage_name", "sort_order", "applicability", "planned_end_date")
     VALUES ('83000000-0000-4000-8000-000000000001', $1, $2, 'VIRTUAL_STAGE', '虚拟阶段', 0, 'REQUIRED', DATE '2026-09-30')`,
    [ids.applicationVersion, ids.stageTemplate],
  );
  await client.query(
    `INSERT INTO "project_application_swimlane_workflow" ("id", "application_version_id", "workflow_code", "workflow_name", "description", "sort_order", "enabled")
     VALUES ('83000000-0000-4000-8000-000000000002', $1, 'VIRTUAL_WORKFLOW', '虚拟工作流', '仅用于 migration 验证', 0, true)`,
    [ids.applicationVersion],
  );
  await client.query(
    `INSERT INTO "project_application_swimlane_node" ("id", "application_version_id", "stage_id", "workflow_id", "task_name", "task_description", "sort_order", "applicability", "overdue_reminder_interval_days", "attachment_requirement")
     VALUES ('83000000-0000-4000-8000-000000000003', $1, '83000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000002', '虚拟节点', '仅用于 migration 验证', 0, 'REQUIRED', 7, 'NONE')`,
    [ids.applicationVersion],
  );
  await client.query(
    `INSERT INTO "project_application_swimlane_node_role" ("application_version_id", "node_id", "role_code", "sort_order")
     VALUES ($1, '83000000-0000-4000-8000-000000000003', 'KEY_SUB_I', 0)`,
    [ids.applicationVersion],
  );
  await client.query(
    `UPDATE "project" SET "current_application_version_id" = $1 WHERE "id" = $2`,
    [ids.applicationVersion, ids.project],
  );
  await client.query(
    `UPDATE "project_application_version" SET "version_status" = 'FROZEN', "frozen_at" = now() WHERE "id" = $1`,
    [ids.applicationVersion],
  );
  await expectTriggerViolation("frozen application version immutable", "frozen application version is immutable", () =>
    client.query(
      `UPDATE "project_application_version" SET "project_summary" = '不应成功' WHERE "id" = $1`,
      [ids.applicationVersion],
    ),
  );
  await client.query(
    `INSERT INTO "project_plan" ("id", "project_id", "created_at") VALUES ($1, $2, now())`,
    [ids.projectPlan, ids.project],
  );
  await client.query(
    `INSERT INTO "project_plan_version" ("id", "project_plan_id", "version_no", "template_version_id", "status", "created_by_person_id", "created_at", "activated_at")
     VALUES ($1, $2, 1, $3, 'ACTIVE', $4, now(), now())`,
    [ids.planVersion1, ids.projectPlan, ids.lifecycleVersion, ids.pmo],
  );

  await expectConstraintViolation("second active plan version", () =>
    client.query(
      `INSERT INTO "project_plan_version" ("id", "project_plan_id", "version_no", "base_version_id", "template_version_id", "status", "created_by_person_id", "created_at", "activated_at")
       VALUES ($1, $2, 2, $3, $4, 'ACTIVE', $5, now(), now())`,
      [
        ids.planVersion2,
        ids.projectPlan,
        ids.planVersion1,
        ids.lifecycleVersion,
        ids.pmo,
      ],
    ),
  );

  await client.query(
    `INSERT INTO "project_stage" ("id", "project_id", "project_plan_id", "created_at")
     VALUES ($1, $2, $3, now())`,
    [ids.projectStage, ids.project, ids.projectPlan],
  );
  await client.query(
    `INSERT INTO "project_workflow" ("id", "project_id", "project_plan_id", "workflow_type", "created_at")
     VALUES ($1, $2, $3, 'PROJECT_CUSTOM', now())`,
    [ids.projectWorkflow, ids.project, ids.projectPlan],
  );
  await client.query(
    `INSERT INTO "project_workflow_stage" ("id", "project_id", "project_plan_id", "project_workflow_id", "project_stage_id", "execution_status", "created_at")
     VALUES ($1, $2, $3, $4, $5, 'NOT_STARTED', now())`,
    [
      ids.workflowStage,
      ids.project,
      ids.projectPlan,
      ids.projectWorkflow,
      ids.projectStage,
    ],
  );
  await client.query(
    `INSERT INTO "project_stage_version" ("id", "project_plan_version_id", "project_stage_id", "stage_code", "stage_name", "sort_order", "applicability", "planned_start_date", "planned_end_date")
     VALUES ('41000000-0000-4000-8000-000000000001', $1, $2, 'VIRTUAL_STAGE', '虚拟阶段', 0, 'REQUIRED', DATE '2026-09-01', DATE '2026-09-30')`,
    [ids.planVersion1, ids.projectStage],
  );
  await client.query(
    `INSERT INTO "project_workflow_version" ("id", "project_plan_version_id", "project_workflow_id", "workflow_code", "workflow_name", "sort_order")
     VALUES ('42000000-0000-4000-8000-000000000001', $1, $2, 'VIRTUAL_WORKFLOW_1', '虚拟工作流一', 0)`,
    [ids.planVersion1, ids.projectWorkflow],
  );
  await client.query(
    `INSERT INTO "project_workflow_stage_version" ("id", "project_plan_version_id", "project_workflow_stage_id", "project_workflow_id", "project_stage_id", "task_name", "task_description", "planned_start_date", "planned_end_date", "sort_order", "applicability", "attachment_requirement")
     VALUES ('43000000-0000-4000-8000-000000000001', $1, $2, $3, $4, '虚拟节点一', '仅用于 migration 验证', DATE '2026-09-01', DATE '2026-09-15', 0, 'REQUIRED', 'NONE')`,
    [ids.planVersion1, ids.workflowStage, ids.projectWorkflow, ids.projectStage],
  );
  await client.query(
    `INSERT INTO "project_workflow_stage_role_version" ("id", "project_workflow_stage_version_id", "role_code", "sort_order")
     VALUES ('44000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'KEY_SUB_I', 0)`,
  );
  await client.query(
    `INSERT INTO "project_workflow" ("id", "project_id", "project_plan_id", "workflow_type", "created_at")
     VALUES ($1, $2, $3, 'PROJECT_CUSTOM', now())`,
    [ids.projectWorkflow2, ids.project, ids.projectPlan],
  );
  await client.query(
    `INSERT INTO "project_workflow_version" ("id", "project_plan_version_id", "project_workflow_id", "workflow_code", "workflow_name", "sort_order")
     VALUES ('42000000-0000-4000-8000-000000000002', $1, $2, 'VIRTUAL_WORKFLOW_2', '虚拟工作流二', 1)`,
    [ids.planVersion1, ids.projectWorkflow2],
  );
  await client.query(
    `INSERT INTO "project_workflow_stage" ("id", "project_id", "project_plan_id", "project_workflow_id", "project_stage_id", "execution_status", "created_at")
     VALUES ($1, $2, $3, $4, $5, 'NOT_STARTED', now())`,
    [ids.workflowStage2, ids.project, ids.projectPlan, ids.projectWorkflow2, ids.projectStage],
  );
  await client.query(
    `INSERT INTO "project_workflow_stage_version" ("id", "project_plan_version_id", "project_workflow_stage_id", "project_workflow_id", "project_stage_id", "task_name", "task_description", "planned_start_date", "planned_end_date", "sort_order", "applicability", "attachment_requirement")
     VALUES ('43000000-0000-4000-8000-000000000002', $1, $2, $3, $4, '虚拟节点二', '仅用于 migration 验证', DATE '2026-09-16', DATE '2026-09-30', 1, 'OPTIONAL', 'OPTIONAL')`,
    [ids.planVersion1, ids.workflowStage2, ids.projectWorkflow2, ids.projectStage],
  );
  await client.query(
    `INSERT INTO "project_workflow_stage_dependency_version" ("id", "project_id", "project_plan_version_id", "predecessor_workflow_stage_id", "successor_workflow_stage_id", "created_at")
     VALUES ('45000000-0000-4000-8000-000000000001', $1, $2, $3, $4, now())`,
    [ids.project, ids.planVersion1, ids.workflowStage, ids.workflowStage2],
  );
  await client.query(
    `INSERT INTO "project" ("id", "application_code", "project_name", "applicant_person_id", "status", "created_at", "updated_at")
     VALUES ($1, 'APP-9997', '虚拟跨项目范围', $2, 'DRAFT', now(), now())`,
    [ids.otherProject, ids.otherKeySubI],
  );
  await expectTriggerViolation(
    "cross-project workflow dependency",
    "PHASE2_DEPENDENCY_ENDPOINT_OUT_OF_PLAN_SCOPE",
    () =>
    client.query(
      `INSERT INTO "project_workflow_stage_dependency_version" ("id", "project_id", "project_plan_version_id", "predecessor_workflow_stage_id", "successor_workflow_stage_id", "created_at")
       VALUES ('45000000-0000-4000-8000-000000000002', $1, $2, $3, $4, now())`,
      [ids.otherProject, ids.planVersion1, ids.workflowStage, ids.workflowStage2],
    ),
  );

  await expectConstraintViolation("non-positive collaboration time limit", () =>
    client.query(
      `INSERT INTO "collaboration_time_limit_setting" ("id", "responsibility_type", "time_limit_days", "reminder_interval_days", "updated_by_person_id", "updated_at")
       VALUES ('46000000-0000-4000-8000-000000000001', 'WORKFLOW_COMPLETION_PMO_REVIEW', 0, 1, $1, now())`,
      [ids.pmo],
    ),
  );
  await client.query(
    `INSERT INTO "collaboration_time_limit_setting" ("id", "responsibility_type", "time_limit_days", "reminder_interval_days", "updated_by_person_id", "updated_at")
     VALUES ('46000000-0000-4000-8000-000000000002', 'WORKFLOW_COMPLETION_PMO_REVIEW', 3, 1, $1, now())`,
    [ids.pmo],
  );
  await expectConstraintViolation("duplicate global collaboration time limit", () =>
    client.query(
      `INSERT INTO "collaboration_time_limit_setting" ("id", "responsibility_type", "time_limit_days", "reminder_interval_days", "updated_by_person_id", "updated_at")
       VALUES ('46000000-0000-4000-8000-000000000003', 'WORKFLOW_COMPLETION_PMO_REVIEW', 5, 2, $1, now())`,
      [ids.pmo],
    ),
  );

  await expectConstraintViolation("negative workflow update amount", () =>
    client.query(
      `INSERT INTO "workflow_update" ("id", "project_id", "project_workflow_stage_id", "submitted_by_person_id", "submitted_role_code", "progress_summary", "basis", "budget_amount_cny", "submitted_at")
       VALUES ('47000000-0000-4000-8000-000000000001', $1, $2, $3, 'KEY_SUB_I', '虚拟进展', '虚拟依据', -1, now())`,
      [ids.project, ids.workflowStage, ids.keySubI],
    ),
  );
  await client.query(
    `INSERT INTO "workflow_update" ("id", "project_id", "project_workflow_stage_id", "submitted_by_person_id", "submitted_role_code", "progress_summary", "basis", "budget_amount_cny", "submitted_at")
     VALUES ($1, $2, $3, $4, 'KEY_SUB_I', '虚拟进展', '虚拟依据', 100, now())`,
    [ids.workflowUpdate, ids.project, ids.workflowStage, ids.keySubI],
  );
  await expectConstraintViolation("invalid workflow update correction mode", () =>
    client.query(
      `INSERT INTO "workflow_update_correction" ("id", "project_id", "workflow_update_id", "sequence_no", "corrected_by_person_id", "corrected_role_code", "correction_reason", "revised_expected_date_mode", "revised_expected_date", "budget_amount_mode", "created_at")
       VALUES ('48000000-0000-4000-8000-000000000001', $1, $2, 1, $3, 'KEY_SUB_I', '虚拟纠错', 'KEEP', DATE '2026-10-01', 'KEEP', now())`,
      [ids.project, ids.workflowUpdate, ids.keySubI],
    ),
  );

  await client.query(
    `INSERT INTO "issue" (
       "id", "issue_no", "project_id", "project_workflow_stage_id", "reported_by_person_id", "reported_role_code",
       "issue_type_code", "issue_type_option_id", "title", "description", "current_risk_level", "expected_support", "opened_at", "confirmation_round_no"
     ) VALUES ($1, 'VIRTUAL-ISSUE-001', $2, $3, $4, 'KEY_SUB_I', 'ISSUE_TYPE', $5, '虚拟问题', '仅用于 migration 验证', 'RISK', '虚拟支持', now(), 0)`,
    [
      ids.issue,
      ids.project,
      ids.workflowStage,
      ids.keySubI,
      optionIds.get("ISSUE_TYPE"),
    ],
  );
  await client.query(
    `INSERT INTO "issue_handling_state" ("id", "project_id", "issue_id", "state_code", "required_role_code", "responsibility_round_no", "entered_by_person_id", "entered_by_role_code", "entered_at")
     VALUES ('90000000-0000-4000-8000-000000000001', $1, $2, 'PMO_INITIAL_REVIEW', 'PMO', 1, $3, 'KEY_SUB_I', now())`,
    [ids.project, ids.issue, ids.keySubI],
  );

  await expectConstraintViolation("second current issue state", () =>
    client.query(
      `INSERT INTO "issue_handling_state" ("id", "project_id", "issue_id", "state_code", "required_role_code", "responsibility_round_no", "entered_by_person_id", "entered_by_role_code", "entered_at")
       VALUES ('90000000-0000-4000-8000-000000000002', $1, $2, 'PMO_COORDINATION', 'PMO', 2, $3, 'PMO', now())`,
      [ids.project, ids.issue, ids.pmo],
    ),
  );

  await expectConstraintViolation("attachment draft requires exactly one context", () =>
    client.query(
      `INSERT INTO "attachment_draft" ("id", "project_id", "parent_type", "purpose_code", "visibility_scope", "uploader_person_id", "uploader_role_code", "last_activity_at", "expires_at", "created_at")
       VALUES ('91000000-0000-4000-8000-000000000001', $1, 'WORKFLOW_UPDATE', 'VIRTUAL', 'PROJECT_SHARED', $2, 'KEY_SUB_I', now(), now() + interval '1 hour', now())`,
      [ids.project, ids.keySubI],
    ),
  );
  await client.query(
    `INSERT INTO "attachment_draft" ("id", "project_id", "parent_type", "purpose_code", "visibility_scope", "uploader_person_id", "uploader_role_code", "project_workflow_stage_id", "last_activity_at", "expires_at", "created_at")
     VALUES ('91000000-0000-4000-8000-000000000002', $1, 'WORKFLOW_UPDATE', 'VIRTUAL', 'PROJECT_SHARED', $2, 'KEY_SUB_I', $3, now(), now() + interval '1 hour', now())`,
    [ids.project, ids.keySubI, ids.workflowStage],
  );
  await client.query(
    `INSERT INTO "attachment_upload_session" ("id", "project_id", "attachment_draft_id", "uploader_person_id", "status", "idempotency_key", "expires_at", "last_activity_at", "created_at")
     VALUES ('92000000-0000-4000-8000-000000000001', $1, '91000000-0000-4000-8000-000000000002', $2, 'OPEN', 'virtual-upload', now() + interval '1 hour', now(), now())`,
    [ids.project, ids.keySubI],
  );
  await client.query(
    `INSERT INTO "file_asset" ("id", "project_id", "attachment_upload_session_id", "status", "original_file_name", "media_type", "size_bytes", "sha256", "storage_object_key", "uploaded_by_person_id", "uploaded_role_code", "declaration_version", "available_at", "created_at")
     VALUES ('93000000-0000-4000-8000-000000000001', $1, '92000000-0000-4000-8000-000000000001', 'AVAILABLE', 'virtual.txt', 'text/plain', 7, 'virtual-sha256', 'virtual/object/key', $2, 'KEY_SUB_I', 'v1', now(), now())`,
    [ids.project, ids.keySubI],
  );
  await expectConstraintViolation("business attachment requires exactly one parent", () =>
    client.query(
      `INSERT INTO "business_attachment" ("id", "project_id", "file_asset_id", "parent_type", "visibility_scope", "purpose_code", "attached_by_person_id", "attached_role_code", "attached_at", "workflow_update_id", "issue_id")
       VALUES ('94000000-0000-4000-8000-000000000001', $1, '93000000-0000-4000-8000-000000000001', 'WORKFLOW_UPDATE', 'PROJECT_SHARED', 'VIRTUAL', $2, 'KEY_SUB_I', now(), $3, $4)`,
      [ids.project, ids.keySubI, ids.workflowUpdate, ids.issue],
    ),
  );

  await expectConstraintViolation("notification recipient role snapshot is required", () =>
    client.query(
      `INSERT INTO "notification" ("id", "recipient_person_id", "notification_type", "event_code", "title", "content", "event_key", "message_kind", "read_status", "action_status", "created_at")
       VALUES ('a0000000-0000-4000-8000-000000000001', $1, 'SYSTEM_NOTICE', 'WORKFLOW_EXCEPTION_DIGEST', '虚拟消息', '仅用于 migration 验证', 'virtual-null-role', 'INFORMATIONAL', 'UNREAD', 'NOT_APPLICABLE', now())`,
      [ids.keySubI],
    ),
  );
  await client.query(
    `INSERT INTO "notification" ("id", "recipient_person_id", "recipient_role_code", "notification_type", "event_code", "title", "content", "event_key", "message_kind", "read_status", "action_status", "created_at")
     VALUES ('a0000000-0000-4000-8000-000000000001', $1, 'KEY_SUB_I', 'SYSTEM_NOTICE', 'WORKFLOW_EXCEPTION_DIGEST', '虚拟消息', '仅用于 migration 验证', 'virtual-event', 'INFORMATIONAL', 'UNREAD', 'NOT_APPLICABLE', now())`,
    [ids.keySubI],
  );
  await client.query(
    `INSERT INTO "notification" ("id", "recipient_person_id", "recipient_role_code", "notification_type", "event_code", "title", "content", "event_key", "message_kind", "read_status", "action_status", "created_at")
     VALUES ('a0000000-0000-4000-8000-000000000003', $1, 'PMO', 'SYSTEM_NOTICE', 'OUTBOX_DELIVERY_FAILED_FINAL', '虚拟投递告警', '仅用于 migration 验证', 'virtual-delivery-final', 'INFORMATIONAL', 'UNREAD', 'NOT_APPLICABLE', now())`,
    [ids.pmo],
  );
  await client.query(
    `INSERT INTO "notification" ("id", "recipient_person_id", "recipient_role_code", "notification_type", "event_code", "project_id", "project_workflow_stage_id", "title", "content", "event_key", "message_kind", "read_status", "action_status", "created_at")
     VALUES ('a0000000-0000-4000-8000-000000000004', $1, 'KEY_SUB_I', 'WORKFLOW_FILL_REMINDER', 'WORKFLOW_UPDATE_OVERDUE', $2, $3, '虚拟节点超期提醒', '仅用于 migration 验证', 'virtual-workflow-overdue', 'ACTION', 'UNREAD', 'PENDING', now())`,
    [ids.keySubI, ids.project, ids.workflowStage],
  );
  await expectConstraintViolation("notification event recipient role idempotency", () =>
    client.query(
      `INSERT INTO "notification" ("id", "recipient_person_id", "recipient_role_code", "notification_type", "event_code", "title", "content", "event_key", "message_kind", "read_status", "action_status", "created_at")
       VALUES ('a0000000-0000-4000-8000-000000000002', $1, 'KEY_SUB_I', 'SYSTEM_NOTICE', 'WORKFLOW_EXCEPTION_DIGEST', '虚拟重复消息', '仅用于 migration 验证', 'virtual-event', 'INFORMATIONAL', 'UNREAD', 'NOT_APPLICABLE', now())`,
      [ids.keySubI],
    ),
  );
  await expectConstraintViolation("outbox recipient must match notification recipient", () =>
    client.query(
      `INSERT INTO "notification_outbox" ("id", "notification_id", "recipient_person_id", "template_code", "payload", "event_key", "status", "created_at")
       VALUES ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', $1, 'VIRTUAL', '{}', 'virtual-outbox-mismatch', 'PENDING', now())`,
      [ids.pmo],
    ),
  );
  await expectConstraintViolation("processing outbox requires a lease", () =>
    client.query(
      `INSERT INTO "notification_outbox" ("id", "notification_id", "recipient_person_id", "template_code", "payload", "event_key", "status", "created_at")
       VALUES ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', $1, 'VIRTUAL', '{}', 'virtual-outbox-no-lease', 'PROCESSING', now())`,
      [ids.keySubI],
    ),
  );
  await expectConstraintViolation("attachment cleanup attempts are bounded", () =>
    client.query(`UPDATE "file_asset" SET "cleanup_attempt_count" = 6 WHERE "id" = '93000000-0000-4000-8000-000000000001'`),
  );
  await expectConstraintViolation("running reminder requires a lease", () =>
    client.query(
      `INSERT INTO "reminder_run" ("id", "scheduled_for", "status", "attempt_count", "started_at", "created_at", "updated_at")
       VALUES ('a2000000-0000-4000-8000-000000000001', now(), 'RUNNING', 1, now(), now(), now())`,
    ),
  );

  const codes = await client.query(
    `SELECT nextval('project_code_sequence') AS first_value, nextval('project_code_sequence') AS second_value`,
  );
  if (BigInt(codes.rows[0].second_value) <= BigInt(codes.rows[0].first_value)) {
    throw new Error("project_code_sequence is not increasing");
  }

  const applicationCodes = await client.query(
    `SELECT nextval('project_application_code_sequence') AS first_value, nextval('project_application_code_sequence') AS second_value`,
  );
  if (BigInt(applicationCodes.rows[0].second_value) <= BigInt(applicationCodes.rows[0].first_value)) {
    throw new Error("project_application_code_sequence is not increasing");
  }

  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("ROLLBACK");

  console.log(
    `Migration database validation passed (${databaseName}.${schemaName}, PostgreSQL ${serverVersion}); all fixture writes rolled back.`,
  );
} catch (error) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Connection or transaction may not have been established.
  }
  throw error;
} finally {
  await client.end();
}
