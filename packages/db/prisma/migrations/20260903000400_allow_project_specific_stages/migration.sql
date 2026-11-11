-- Some long-lived validation schemas applied the direct-edit migration before
-- project-specific stages made the template source optional. Reapply the final
-- contract in an idempotent forward migration.
ALTER TABLE "project_stage"
  ALTER COLUMN "source_stage_template_id" DROP NOT NULL;
