import console from "node:console";
import process from "node:process";
import { URL } from "node:url";
import pg from "pg";

const { Client } = pg;

if (process.env.RF_PHASE2_UPGRADE_TEST_DATABASE !== "1") {
  throw new Error("Refusing upgrade fixture without RF_PHASE2_UPGRADE_TEST_DATABASE=1");
}
const databaseUrl = new URL(process.env.DATABASE_URL);
const schema = databaseUrl.searchParams.get("schema");
if (!schema?.startsWith("p2_s1_upgrade_")) {
  throw new Error("Upgrade fixture requires a p2_s1_upgrade_* schema");
}
if (!/(test|validation|scratch)/iu.test(databaseUrl.pathname)) {
  throw new Error("Upgrade fixture requires a test/validation/scratch database");
}
const mode = process.env.RF_PHASE2_UPGRADE_MODE;
if (mode !== "seed" && mode !== "verify") throw new Error("RF_PHASE2_UPGRADE_MODE must be seed or verify");

const client = new Client({ connectionString: databaseUrl.toString() });
await client.connect();
await client.query("SELECT set_config('search_path', $1, false)", [schema]);

try {
  if (mode === "seed") await seed();
  else await verify();
} finally {
  await client.end();
}

async function seed() {
  await client.query("BEGIN");
  try {
    await client.query(`INSERT INTO "person" ("id", "display_name", "login_name", "account_status", "created_at", "updated_at")
      VALUES ('c1000000-0000-4000-8000-000000000001', '虚构升级 PMO', 'p2-upgrade-pmo', 'ACTIVE', now(), now())`);
    await client.query(`INSERT INTO "lifecycle_template" ("id", "template_code", "template_name", "status", "created_at")
      VALUES ('c2000000-0000-4000-8000-000000000001', 'P2_UPGRADE', '虚构升级模板', 'ACTIVE', now())`);
    await client.query(`INSERT INTO "lifecycle_template_version" ("id", "lifecycle_template_id", "version_no", "status", "published_by_person_id", "published_at", "created_at")
      VALUES ('c2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 1, 'PUBLISHED', 'c1000000-0000-4000-8000-000000000001', now(), now())`);
    await client.query(`INSERT INTO "stage_template" ("id", "template_version_id", "stage_code", "stage_name", "sort_order", "required_by_default", "enabled") VALUES
      ('c2000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000002', 'NA', '虚构不适用阶段', 1, true, false),
      ('c2000000-0000-4000-8000-000000000004', 'c2000000-0000-4000-8000-000000000002', 'REQ', '虚构必需阶段', 2, true, true)`);
    await client.query(`INSERT INTO "workflow_template" ("id", "template_version_id", "workflow_code", "workflow_name", "description", "required_by_default", "enabled") VALUES
      ('c2000000-0000-4000-8000-000000000005', 'c2000000-0000-4000-8000-000000000002', 'OPT_WF', '虚构可选工作流', '升级验证', false, true),
      ('c2000000-0000-4000-8000-000000000006', 'c2000000-0000-4000-8000-000000000002', 'REQ_WF', '虚构必需工作流', '升级验证', true, true)`);
    await client.query(`INSERT INTO "workflow_stage_template" ("id", "workflow_template_id", "stage_template_id", "sort_order", "default_task", "default_owner_role") VALUES
      ('c2000000-0000-4000-8000-000000000007', 'c2000000-0000-4000-8000-000000000005', 'c2000000-0000-4000-8000-000000000003', 1, '虚构可选节点', 'KEY_SUB_I'),
      ('c2000000-0000-4000-8000-000000000008', 'c2000000-0000-4000-8000-000000000006', 'c2000000-0000-4000-8000-000000000004', 2, '虚构必需节点', 'KEY_SUB_I')`);
    await client.query(`INSERT INTO "project" ("id", "application_code", "project_name", "applicant_person_id", "status", "created_at", "updated_at")
      VALUES ('c3000000-0000-4000-8000-000000000001', 'APP-9201', '虚构升级项目', 'c1000000-0000-4000-8000-000000000001', 'DRAFT', now(), now())`);
    await client.query(`INSERT INTO "project_plan" ("id", "project_id", "created_at") VALUES ('c3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001', now())`);
    await client.query(`INSERT INTO "project_plan_version" ("id", "project_plan_id", "version_no", "template_version_id", "status", "created_by_person_id", "created_at", "activated_at")
      VALUES ('c3000000-0000-4000-8000-000000000003', 'c3000000-0000-4000-8000-000000000002', 1, 'c2000000-0000-4000-8000-000000000002', 'ACTIVE', 'c1000000-0000-4000-8000-000000000001', now(), now())`);
    for (const [suffix, templateId, code, name, sort] of [["4", "c2000000-0000-4000-8000-000000000003", "NA", "虚构不适用阶段", 1], ["5", "c2000000-0000-4000-8000-000000000004", "REQ", "虚构必需阶段", 2]]) {
      await client.query(`INSERT INTO "project_stage" ("id", "project_id", "project_plan_id", "source_stage_template_id", "created_at") VALUES ($1, 'c3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002', $2, now())`, [`c3000000-0000-4000-8000-00000000000${suffix}`, templateId]);
      await client.query(`INSERT INTO "project_stage_version" ("id", "project_plan_version_id", "project_stage_id", "stage_code", "stage_name", "sort_order", "planned_start_date", "planned_end_date") VALUES ($1, 'c3000000-0000-4000-8000-000000000003', $2, $3, $4, $5, DATE '2026-09-01', DATE '2026-09-30')`, [`c4000000-0000-4000-8000-00000000000${suffix}`, `c3000000-0000-4000-8000-00000000000${suffix}`, code, name, sort]);
    }
    for (const [suffix, templateId, stageId, code, name, sort] of [["6", "c2000000-0000-4000-8000-000000000005", "c3000000-0000-4000-8000-000000000004", "OPT_WF", "虚构可选工作流", 1], ["7", "c2000000-0000-4000-8000-000000000006", "c3000000-0000-4000-8000-000000000005", "REQ_WF", "虚构必需工作流", 2]]) {
      const workflowId = `c3000000-0000-4000-8000-00000000000${suffix}`;
      const workflowStageId = `c5000000-0000-4000-8000-00000000000${suffix}`;
      await client.query(`INSERT INTO "project_workflow" ("id", "project_id", "project_plan_id", "source_workflow_template_id", "workflow_type", "created_at") VALUES ($1, 'c3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002', $2, 'STANDARD', now())`, [workflowId, templateId]);
      await client.query(`INSERT INTO "project_workflow_version" ("id", "project_plan_version_id", "project_workflow_id", "workflow_code", "workflow_name", "sort_order") VALUES ($1, 'c3000000-0000-4000-8000-000000000003', $2, $3, $4, $5)`, [`c4000000-0000-4000-8000-00000000000${suffix}`, workflowId, code, name, sort]);
      await client.query(`INSERT INTO "project_workflow_stage" ("id", "project_id", "project_plan_id", "project_workflow_id", "project_stage_id", "execution_status", "created_at") VALUES ($1, 'c3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002', $2, $3, 'NOT_STARTED', now())`, [workflowStageId, workflowId, stageId]);
      await client.query(`INSERT INTO "project_workflow_stage_version" ("id", "project_plan_version_id", "project_workflow_stage_id", "task_name", "task_description", "planned_start_date", "planned_end_date", "sort_order") VALUES ($1, 'c3000000-0000-4000-8000-000000000003', $2, $3, '升级验证', DATE '2026-09-01', DATE '2026-09-30', $4)`, [`c6000000-0000-4000-8000-00000000000${suffix}`, workflowStageId, name, sort]);
    }
    await client.query(`INSERT INTO "notification" ("id", "recipient_person_id", "notification_type", "event_code", "title", "content", "event_key", "status", "read_at", "created_at")
      VALUES ('c7000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'SYSTEM_NOTICE', 'WORKFLOW_EXCEPTION_DIGEST', '虚构已读消息', '升级验证', 'p2-upgrade-message', 'READ', now(), now())`);
    await client.query("COMMIT");
    console.log(`Phase 2 upgrade fixture seeded in ${schema}.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function verify() {
  const stageRows = await client.query(`SELECT "stage_code", "default_applicability"::text AS value FROM "stage_template" ORDER BY "stage_code"`);
  assertRows(stageRows.rows, [{ stage_code: "NA", value: "NOT_APPLICABLE" }, { stage_code: "REQ", value: "REQUIRED" }], "stage template applicability");
  const projectStages = await client.query(`SELECT "stage_code", "applicability"::text AS value FROM "project_stage_version" ORDER BY "stage_code"`);
  assertRows(projectStages.rows, [{ stage_code: "NA", value: "NOT_APPLICABLE" }, { stage_code: "REQ", value: "REQUIRED" }], "project stage applicability");
  const nodes = await client.query(`SELECT pwv."workflow_code", pwsv."applicability"::text AS applicability, pwsv."attachment_requirement"::text AS attachment FROM "project_workflow_stage_version" pwsv JOIN "project_workflow_stage" pws ON pws."id" = pwsv."project_workflow_stage_id" JOIN "project_workflow_version" pwv ON pwv."project_workflow_id" = pws."project_workflow_id" AND pwv."project_plan_version_id" = pwsv."project_plan_version_id" ORDER BY pwv."workflow_code"`);
  assertRows(nodes.rows, [{ workflow_code: "OPT_WF", applicability: "OPTIONAL", attachment: "NONE" }, { workflow_code: "REQ_WF", applicability: "REQUIRED", attachment: "NONE" }], "project node backfill");
  const templateNodes = await client.query(`SELECT wt."workflow_code", wst."default_applicability"::text AS applicability, wst."default_attachment_requirement"::text AS attachment, wst."template_version_id" = wt."template_version_id" AS version_match FROM "workflow_stage_template" wst JOIN "workflow_template" wt ON wt."id" = wst."workflow_template_id" ORDER BY wt."workflow_code"`);
  assertRows(templateNodes.rows, [{ workflow_code: "OPT_WF", applicability: "OPTIONAL", attachment: "NONE", version_match: true }, { workflow_code: "REQ_WF", applicability: "REQUIRED", attachment: "NONE", version_match: true }], "workflow stage template backfill");
  const notification = await client.query(`SELECT "read_status"::text, "message_kind"::text, "action_status"::text FROM "notification" WHERE "id" = 'c7000000-0000-4000-8000-000000000001'`);
  assertRows(notification.rows, [{ read_status: "READ", message_kind: "INFORMATIONAL", action_status: "NOT_APPLICABLE" }], "notification backfill");
  const removed = await client.query(`SELECT
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'project' AND column_name IN ('budget_used', 'pre_archive_status')) AS project_columns,
    to_regclass('workflow_update_review') IS NOT NULL AS review_table`, [schema]);
  if (removed.rows[0].project_columns || removed.rows[0].review_table) throw new Error("Deprecated phase 2 structures remain");
  const migrations = await client.query(`SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`);
  if (migrations.rows[0].count !== 5) throw new Error(`Expected 5 successful migrations, found ${migrations.rows[0].count}`);
  console.log(`Phase 2 upgrade fixture verified in ${schema}.`);
}

function assertRows(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
}
