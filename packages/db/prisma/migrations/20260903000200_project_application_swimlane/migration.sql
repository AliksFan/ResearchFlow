ALTER TYPE "ProjectApplicationActivityType" ADD VALUE IF NOT EXISTS 'SWIMLANE_MODIFIED';

ALTER TABLE "project_application_version"
  ADD COLUMN "swimlane_name" TEXT NOT NULL DEFAULT '项目生命周期泳道',
  ADD COLUMN "swimlane_revision" INTEGER NOT NULL DEFAULT 0;

-- Existing frozen application snapshots must remain immutable at runtime. This
-- migration is the only controlled writer that backfills the newly introduced
-- snapshot name, so suspend the legacy row trigger only for this statement.
ALTER TABLE "project_application_version"
  DISABLE TRIGGER "project_application_version_immutable";

UPDATE "project_application_version" AS application_version
SET "swimlane_name" = lifecycle_template."template_name"
FROM "lifecycle_template_version" AS template_version
JOIN "lifecycle_template" AS lifecycle_template
  ON lifecycle_template."id" = template_version."lifecycle_template_id"
WHERE application_version."lifecycle_template_version_id" = template_version."id";

ALTER TABLE "project_application_version"
  ENABLE TRIGGER "project_application_version_immutable";

CREATE TABLE "project_application_swimlane_stage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "application_version_id" UUID NOT NULL,
  "source_stage_template_id" UUID,
  "stage_code" TEXT NOT NULL,
  "stage_name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "applicability" "PlanItemApplicability" NOT NULL DEFAULT 'REQUIRED',
  "planned_start_date" DATE,
  "planned_end_date" DATE,
  CONSTRAINT "project_application_swimlane_stage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_application_swimlane_workflow" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "application_version_id" UUID NOT NULL,
  "source_workflow_template_id" UUID,
  "workflow_code" TEXT NOT NULL,
  "workflow_name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "project_application_swimlane_workflow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_application_swimlane_node" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "application_version_id" UUID NOT NULL,
  "stage_id" UUID NOT NULL,
  "workflow_id" UUID NOT NULL,
  "source_workflow_stage_template_id" UUID,
  "task_name" TEXT NOT NULL,
  "task_description" TEXT NOT NULL DEFAULT '',
  "sort_order" INTEGER NOT NULL,
  "applicability" "PlanItemApplicability" NOT NULL DEFAULT 'REQUIRED',
  "planned_start_date" DATE,
  "planned_end_date" DATE,
  "update_interval_days" INTEGER,
  "overdue_reminder_interval_days" INTEGER NOT NULL DEFAULT 7,
  "attachment_requirement" "AttachmentRequirement" NOT NULL DEFAULT 'NONE',
  CONSTRAINT "project_application_swimlane_node_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "application_swimlane_node_update_interval_check" CHECK ("update_interval_days" IS NULL OR "update_interval_days" > 0),
  CONSTRAINT "application_swimlane_node_overdue_interval_check" CHECK ("overdue_reminder_interval_days" > 0)
);

CREATE TABLE "project_application_swimlane_node_role" (
  "application_version_id" UUID NOT NULL,
  "node_id" UUID NOT NULL,
  "role_code" "RoleCode" NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "project_application_swimlane_node_role_pkey" PRIMARY KEY ("application_version_id", "node_id", "role_code")
);

CREATE TABLE "project_application_swimlane_dependency" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "application_version_id" UUID NOT NULL,
  "predecessor_node_id" UUID NOT NULL,
  "successor_node_id" UUID NOT NULL,
  CONSTRAINT "project_application_swimlane_dependency_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "application_swimlane_dependency_no_self_check" CHECK ("predecessor_node_id" <> "successor_node_id")
);

CREATE UNIQUE INDEX "application_swimlane_stage_version_id_key" ON "project_application_swimlane_stage"("application_version_id", "id");
CREATE UNIQUE INDEX "application_swimlane_stage_version_code_key" ON "project_application_swimlane_stage"("application_version_id", "stage_code");
CREATE INDEX "application_swimlane_stage_sort_idx" ON "project_application_swimlane_stage"("application_version_id", "sort_order");
CREATE UNIQUE INDEX "application_swimlane_workflow_version_id_key" ON "project_application_swimlane_workflow"("application_version_id", "id");
CREATE UNIQUE INDEX "application_swimlane_workflow_version_code_key" ON "project_application_swimlane_workflow"("application_version_id", "workflow_code");
CREATE INDEX "application_swimlane_workflow_sort_idx" ON "project_application_swimlane_workflow"("application_version_id", "sort_order");
CREATE UNIQUE INDEX "application_swimlane_node_version_id_key" ON "project_application_swimlane_node"("application_version_id", "id");
CREATE INDEX "application_swimlane_node_cell_sort_idx" ON "project_application_swimlane_node"("application_version_id", "workflow_id", "stage_id", "sort_order");
CREATE INDEX "application_swimlane_node_role_sort_idx" ON "project_application_swimlane_node_role"("application_version_id", "node_id", "sort_order");
CREATE UNIQUE INDEX "application_swimlane_dependency_edge_key" ON "project_application_swimlane_dependency"("application_version_id", "predecessor_node_id", "successor_node_id");
CREATE INDEX "application_swimlane_dependency_successor_idx" ON "project_application_swimlane_dependency"("application_version_id", "successor_node_id");

ALTER TABLE "project_application_swimlane_stage" ADD CONSTRAINT "application_swimlane_stage_version_fkey" FOREIGN KEY ("application_version_id") REFERENCES "project_application_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_application_swimlane_stage" ADD CONSTRAINT "application_swimlane_stage_source_fkey" FOREIGN KEY ("source_stage_template_id") REFERENCES "stage_template"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_application_swimlane_workflow" ADD CONSTRAINT "application_swimlane_workflow_version_fkey" FOREIGN KEY ("application_version_id") REFERENCES "project_application_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_application_swimlane_workflow" ADD CONSTRAINT "application_swimlane_workflow_source_fkey" FOREIGN KEY ("source_workflow_template_id") REFERENCES "workflow_template"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_application_swimlane_node" ADD CONSTRAINT "application_swimlane_node_version_fkey" FOREIGN KEY ("application_version_id") REFERENCES "project_application_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_application_swimlane_node" ADD CONSTRAINT "application_swimlane_node_stage_fkey" FOREIGN KEY ("application_version_id", "stage_id") REFERENCES "project_application_swimlane_stage"("application_version_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_application_swimlane_node" ADD CONSTRAINT "application_swimlane_node_workflow_fkey" FOREIGN KEY ("application_version_id", "workflow_id") REFERENCES "project_application_swimlane_workflow"("application_version_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_application_swimlane_node" ADD CONSTRAINT "application_swimlane_node_source_fkey" FOREIGN KEY ("source_workflow_stage_template_id") REFERENCES "workflow_stage_template"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_application_swimlane_node_role" ADD CONSTRAINT "application_swimlane_node_role_version_fkey" FOREIGN KEY ("application_version_id") REFERENCES "project_application_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_application_swimlane_node_role" ADD CONSTRAINT "application_swimlane_node_role_node_fkey" FOREIGN KEY ("application_version_id", "node_id") REFERENCES "project_application_swimlane_node"("application_version_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_application_swimlane_dependency" ADD CONSTRAINT "application_swimlane_dependency_version_fkey" FOREIGN KEY ("application_version_id") REFERENCES "project_application_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_application_swimlane_dependency" ADD CONSTRAINT "application_swimlane_dependency_predecessor_fkey" FOREIGN KEY ("application_version_id", "predecessor_node_id") REFERENCES "project_application_swimlane_node"("application_version_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_application_swimlane_dependency" ADD CONSTRAINT "application_swimlane_dependency_successor_fkey" FOREIGN KEY ("application_version_id", "successor_node_id") REFERENCES "project_application_swimlane_node"("application_version_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

INSERT INTO "project_application_swimlane_stage" (
  "application_version_id", "source_stage_template_id", "stage_code", "stage_name", "sort_order", "applicability", "planned_end_date"
)
SELECT application_version."id", stage_template."id", stage_template."stage_code", stage_template."stage_name", stage_template."sort_order", stage_template."default_applicability", stage_plan."target_completion_date"
FROM "project_application_version" AS application_version
JOIN "stage_template" AS stage_template ON stage_template."template_version_id" = application_version."lifecycle_template_version_id"
LEFT JOIN "project_application_version_stage_plan" AS stage_plan
  ON stage_plan."application_version_id" = application_version."id" AND stage_plan."stage_template_id" = stage_template."id";

INSERT INTO "project_application_swimlane_workflow" (
  "application_version_id", "source_workflow_template_id", "workflow_code", "workflow_name", "description", "sort_order", "enabled"
)
SELECT application_version."id", workflow_template."id", workflow_template."workflow_code", workflow_template."workflow_name", workflow_template."description",
       row_number() OVER (PARTITION BY application_version."id" ORDER BY workflow_template."workflow_code") - 1, workflow_template."enabled"
FROM "project_application_version" AS application_version
JOIN "workflow_template" AS workflow_template ON workflow_template."template_version_id" = application_version."lifecycle_template_version_id";

INSERT INTO "project_application_swimlane_node" (
  "application_version_id", "stage_id", "workflow_id", "source_workflow_stage_template_id", "task_name", "task_description", "sort_order", "applicability", "attachment_requirement"
)
SELECT application_version."id", application_stage."id", application_workflow."id", node_template."id", node_template."default_task", '', node_template."sort_order", node_template."default_applicability", node_template."default_attachment_requirement"
FROM "project_application_version" AS application_version
JOIN "workflow_stage_template" AS node_template ON node_template."template_version_id" = application_version."lifecycle_template_version_id"
JOIN "project_application_swimlane_stage" AS application_stage ON application_stage."application_version_id" = application_version."id" AND application_stage."source_stage_template_id" = node_template."stage_template_id"
JOIN "project_application_swimlane_workflow" AS application_workflow ON application_workflow."application_version_id" = application_version."id" AND application_workflow."source_workflow_template_id" = node_template."workflow_template_id";

INSERT INTO "project_application_swimlane_node_role" ("application_version_id", "node_id", "role_code", "sort_order")
SELECT application_node."application_version_id", application_node."id", node_template."default_owner_role", 0
FROM "project_application_swimlane_node" AS application_node
JOIN "workflow_stage_template" AS node_template ON node_template."id" = application_node."source_workflow_stage_template_id";

INSERT INTO "project_application_swimlane_dependency" ("application_version_id", "predecessor_node_id", "successor_node_id")
SELECT predecessor."application_version_id", predecessor."id", successor."id"
FROM "workflow_stage_template_dependency" AS dependency
JOIN "project_application_swimlane_node" AS predecessor ON predecessor."source_workflow_stage_template_id" = dependency."predecessor_workflow_stage_template_id"
JOIN "project_application_swimlane_node" AS successor ON successor."application_version_id" = predecessor."application_version_id" AND successor."source_workflow_stage_template_id" = dependency."successor_workflow_stage_template_id";

CREATE TRIGGER "project_application_swimlane_stage_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "project_application_swimlane_stage"
FOR EACH ROW EXECUTE FUNCTION "protect_frozen_application_content"();
CREATE TRIGGER "project_application_swimlane_workflow_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "project_application_swimlane_workflow"
FOR EACH ROW EXECUTE FUNCTION "protect_frozen_application_content"();
CREATE TRIGGER "project_application_swimlane_node_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "project_application_swimlane_node"
FOR EACH ROW EXECUTE FUNCTION "protect_frozen_application_content"();
CREATE TRIGGER "project_application_swimlane_node_role_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "project_application_swimlane_node_role"
FOR EACH ROW EXECUTE FUNCTION "protect_frozen_application_content"();
CREATE TRIGGER "project_application_swimlane_dependency_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "project_application_swimlane_dependency"
FOR EACH ROW EXECUTE FUNCTION "protect_frozen_application_content"();

CREATE OR REPLACE FUNCTION "validate_application_version_freeze"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  primary_count integer;
  applicant_count integer;
  stage_count integer;
  workflow_count integer;
  node_count integer;
BEGIN
  IF NEW."version_status" <> 'FROZEN' OR OLD."version_status" = 'FROZEN' THEN RETURN NEW; END IF;
  IF NEW."project_summary" IS NULL OR NEW."disease_area_option_id" IS NULL OR NEW."research_type_option_id" IS NULL OR NEW."lifecycle_template_version_id" IS NULL THEN
    RAISE EXCEPTION 'frozen application version is incomplete';
  END IF;
  SELECT count(*) FILTER (WHERE owner."is_primary"), count(*) FILTER (WHERE owner."person_id" = project."applicant_person_id")
  INTO primary_count, applicant_count
  FROM "project_application_version_owner" owner JOIN "project" project ON project."id" = NEW."project_id"
  WHERE owner."application_version_id" = NEW."id";
  SELECT count(*) INTO stage_count FROM "project_application_swimlane_stage" WHERE "application_version_id" = NEW."id";
  SELECT count(*) INTO workflow_count FROM "project_application_swimlane_workflow" WHERE "application_version_id" = NEW."id";
  SELECT count(*) INTO node_count FROM "project_application_swimlane_node" WHERE "application_version_id" = NEW."id";
  IF primary_count <> 1 OR applicant_count <> 1 OR stage_count = 0 OR workflow_count = 0 OR node_count = 0 THEN
    RAISE EXCEPTION 'frozen application version requires owners and a complete swimlane';
  END IF;
  RETURN NEW;
END;
$$;

DROP TABLE "project_application_version_stage_plan";
