CREATE TABLE "project_application_version_node_plan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "application_version_id" UUID NOT NULL,
  "workflow_stage_template_id" UUID NOT NULL,
  "target_completion_date" DATE,
  CONSTRAINT "project_application_version_node_plan_pkey" PRIMARY KEY ("id")
);

INSERT INTO "project_application_version_node_plan" (
  "application_version_id",
  "workflow_stage_template_id",
  "target_completion_date"
)
SELECT
  stage_plan."application_version_id",
  node."id",
  stage_plan."planned_end_date"
FROM "project_application_version_stage_plan" AS stage_plan
JOIN "project_application_version" AS application_version
  ON application_version."id" = stage_plan."application_version_id"
JOIN "workflow_stage_template" AS node
  ON node."stage_template_id" = stage_plan."template_stage_id"
 AND node."template_version_id" = application_version."lifecycle_template_version_id"
WHERE node."default_applicability" <> 'NOT_APPLICABLE';

CREATE UNIQUE INDEX "project_application_version_node_plan_application_version_id_workflow_stage_template_id_key"
  ON "project_application_version_node_plan"("application_version_id", "workflow_stage_template_id");
CREATE INDEX "project_application_version_node_plan_application_version_id_idx"
  ON "project_application_version_node_plan"("application_version_id");

ALTER TABLE "project_application_version_node_plan"
  ADD CONSTRAINT "project_application_version_node_plan_application_version_id_fkey"
  FOREIGN KEY ("application_version_id") REFERENCES "project_application_version"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_application_version_node_plan"
  ADD CONSTRAINT "project_application_version_node_plan_workflow_stage_template_id_fkey"
  FOREIGN KEY ("workflow_stage_template_id") REFERENCES "workflow_stage_template"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

DROP TABLE "project_application_version_stage_plan";

ALTER TABLE "project_stage_version" ALTER COLUMN "planned_start_date" DROP NOT NULL;
ALTER TABLE "project_stage_version" ALTER COLUMN "planned_end_date" DROP NOT NULL;
ALTER TABLE "project_workflow_stage_version" ALTER COLUMN "planned_start_date" DROP NOT NULL;
ALTER TABLE "project_workflow_stage_version" ALTER COLUMN "planned_end_date" DROP NOT NULL;
