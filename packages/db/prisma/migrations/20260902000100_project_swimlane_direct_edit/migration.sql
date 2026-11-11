-- Project plans own a user-facing swimlane name copied from the selected preset.
ALTER TABLE "project_plan_version" ADD COLUMN "swimlane_name" TEXT DEFAULT '项目生命周期泳道';

UPDATE "project_plan_version" AS plan_version
SET "swimlane_name" = template."template_name"
FROM "lifecycle_template_version" AS template_version
JOIN "lifecycle_template" AS template ON template."id" = template_version."lifecycle_template_id"
WHERE plan_version."template_version_id" = template_version."id";

ALTER TABLE "project_plan_version" ALTER COLUMN "swimlane_name" SET NOT NULL;

-- Project-specific stages do not have a source preset stage.
ALTER TABLE "project_stage" ALTER COLUMN "source_stage_template_id" DROP NOT NULL;

-- Workflow presentation is versioned with the project plan snapshot.
ALTER TABLE "project_workflow_version"
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

-- Node placement belongs to each immutable plan snapshot.
ALTER TABLE "project_workflow_stage_version"
  ADD COLUMN "project_workflow_id" UUID,
  ADD COLUMN "project_stage_id" UUID;

UPDATE "project_workflow_stage_version" AS node_version
SET
  "project_workflow_id" = node."project_workflow_id",
  "project_stage_id" = node."project_stage_id"
FROM "project_workflow_stage" AS node
WHERE node."id" = node_version."project_workflow_stage_id";

ALTER TABLE "project_workflow_stage_version"
  ALTER COLUMN "project_workflow_id" SET NOT NULL,
  ALTER COLUMN "project_stage_id" SET NOT NULL;

ALTER TABLE "project_workflow_stage_version"
  ADD CONSTRAINT "project_workflow_stage_version_project_workflow_id_fkey"
  FOREIGN KEY ("project_workflow_id") REFERENCES "project_workflow"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "project_workflow_stage_version_project_stage_id_fkey"
  FOREIGN KEY ("project_stage_id") REFERENCES "project_stage"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

DROP INDEX "project_workflow_stage_project_workflow_id_project_stage_id_key";

CREATE INDEX "project_workflow_stage_version_plan_workflow_stage_sort_idx"
ON "project_workflow_stage_version"("project_plan_version_id", "project_workflow_id", "project_stage_id", "sort_order");
