-- CreateEnum
CREATE TYPE "RoleEligibilityStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "ProjectApplicationVersionStatus" AS ENUM ('EDITABLE', 'FROZEN');

-- CreateEnum
CREATE TYPE "ProjectApplicationActivityType" AS ENUM ('DRAFT_CREATED', 'DRAFT_SAVED', 'SUBMITTED', 'RESUBMITTED', 'RETURNED', 'PAUSED', 'REVIEW_RESUMED', 'REJECTED', 'WITHDRAWN', 'APPROVED');

-- AlterEnum
ALTER TYPE "ProjectStatus" ADD VALUE 'REJECTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstablishmentDecision" ADD VALUE 'REJECTED';
ALTER TYPE "EstablishmentDecision" ADD VALUE 'WITHDRAWN';

-- CreateSequence
CREATE SEQUENCE "project_application_code_sequence" START 1;

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "application_code" TEXT,
ADD COLUMN     "current_application_version_id" UUID,
ADD COLUMN     "normalized_name_occupancy" TEXT,
ALTER COLUMN "project_summary" DROP NOT NULL,
ALTER COLUMN "disease_area_option_id" DROP NOT NULL,
ALTER COLUMN "research_type_option_id" DROP NOT NULL,
ALTER COLUMN "priority_option_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "project_establishment_review" ADD COLUMN     "application_version_id" UUID,
ADD COLUMN     "decided_by_role_code" "RoleCode";

-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "project_application_activity_id" UUID;

-- CreateTable
CREATE TABLE "role_eligibility" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "role_code" "RoleCode" NOT NULL DEFAULT 'KEY_SUB_I',
    "status" "RoleEligibilityStatus" NOT NULL DEFAULT 'ACTIVE',
    "granted_by_person_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_by_person_id" UUID,
    "ended_at" TIMESTAMPTZ(3),
    "reason" TEXT NOT NULL,

    CONSTRAINT "role_eligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_application_version" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "version_status" "ProjectApplicationVersionStatus" NOT NULL DEFAULT 'EDITABLE',
    "project_name" TEXT NOT NULL,
    "project_summary" TEXT,
    "lead_organization_name" TEXT,
    "sponsor_name" TEXT,
    "principal_investigator_display_text" TEXT,
    "target_sample_size" INTEGER,
    "disease_area_dictionary_code" TEXT NOT NULL DEFAULT 'DISEASE_AREA',
    "disease_area_option_id" UUID,
    "research_type_dictionary_code" TEXT NOT NULL DEFAULT 'RESEARCH_TYPE',
    "research_type_option_id" UUID,
    "priority_dictionary_code" TEXT NOT NULL DEFAULT 'PROJECT_PRIORITY',
    "priority_option_id" UUID,
    "lifecycle_template_version_id" UUID,
    "created_by_person_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "frozen_at" TIMESTAMPTZ(3),

    CONSTRAINT "project_application_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_application_version_owner" (
    "id" UUID NOT NULL,
    "application_version_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_application_version_owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_application_version_stage_plan" (
    "id" UUID NOT NULL,
    "application_version_id" UUID NOT NULL,
    "template_stage_id" UUID NOT NULL,
    "planned_start_date" DATE NOT NULL,
    "planned_end_date" DATE NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "project_application_version_stage_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_application_activity" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "application_version_id" UUID,
    "review_id" UUID,
    "activity_type" "ProjectApplicationActivityType" NOT NULL,
    "actor_person_id" UUID NOT NULL,
    "actor_role_code" "RoleCode" NOT NULL,
    "content" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_application_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_application_command" (
    "id" UUID NOT NULL,
    "actor_person_id" UUID NOT NULL,
    "command_id" TEXT NOT NULL,
    "action_code" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "application_version_id" UUID,
    "review_id" UUID,
    "result_code" TEXT NOT NULL,
    "result_entity_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_application_command_pkey" PRIMARY KEY ("id")
);

-- Backfill stable application identities and a frozen/editable version for
-- every pre-existing project before the new NOT NULL constraints are applied.
WITH numbered_projects AS (
    SELECT "id", nextval('"project_application_code_sequence"') AS sequence_value
    FROM "project"
    ORDER BY "created_at", "id"
)
UPDATE "project" AS project
SET "application_code" = 'APP-' || lpad(numbered_projects.sequence_value::text, 4, '0')
FROM numbered_projects
WHERE project."id" = numbered_projects."id";

INSERT INTO "project_application_version" (
    "id",
    "project_id",
    "version_no",
    "version_status",
    "project_name",
    "project_summary",
    "lead_organization_name",
    "sponsor_name",
    "principal_investigator_display_text",
    "target_sample_size",
    "disease_area_dictionary_code",
    "disease_area_option_id",
    "research_type_dictionary_code",
    "research_type_option_id",
    "priority_dictionary_code",
    "priority_option_id",
    "created_by_person_id",
    "created_at",
    "updated_at",
    "frozen_at"
)
SELECT
    "id",
    "id",
    1,
    CASE WHEN "status" = 'DRAFT' THEN 'EDITABLE'::"ProjectApplicationVersionStatus" ELSE 'FROZEN'::"ProjectApplicationVersionStatus" END,
    "project_name",
    "project_summary",
    "lead_organization_name",
    "sponsor_name",
    "principal_investigator_display_text",
    "target_sample_size",
    "disease_area_dictionary_code",
    "disease_area_option_id",
    "research_type_dictionary_code",
    "research_type_option_id",
    "priority_dictionary_code",
    "priority_option_id",
    "applicant_person_id",
    "created_at",
    "updated_at",
    CASE WHEN "status" = 'DRAFT' THEN NULL ELSE "updated_at" END
FROM "project";

UPDATE "project"
SET
    "current_application_version_id" = "id",
    "normalized_name_occupancy" = CASE
        WHEN "status" IN ('PENDING_ESTABLISHMENT_REVIEW', 'RETURNED_FOR_REVISION', 'ON_HOLD', 'ACTIVE', 'CLOSING', 'COMPLETED', 'ARCHIVED')
        THEN lower(regexp_replace(btrim("project_name"), '\\s+', ' ', 'g'))
        ELSE NULL
    END;

UPDATE "project_establishment_review"
SET "application_version_id" = "project_id";

ALTER TABLE "project"
    ALTER COLUMN "application_code" SET NOT NULL;

ALTER TABLE "project_establishment_review"
    ALTER COLUMN "application_version_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "role_eligibility_person_id_role_code_status_idx" ON "role_eligibility"("person_id", "role_code", "status");

-- CreateIndex
CREATE INDEX "project_application_version_project_id_version_status_idx" ON "project_application_version"("project_id", "version_status");

-- CreateIndex
CREATE UNIQUE INDEX "project_application_version_project_id_version_no_key" ON "project_application_version"("project_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "project_application_version_project_id_id_key" ON "project_application_version"("project_id", "id");

-- CreateIndex
CREATE INDEX "project_application_version_owner_application_version_id_so_idx" ON "project_application_version_owner"("application_version_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "project_application_version_owner_application_version_id_pe_key" ON "project_application_version_owner"("application_version_id", "person_id");

-- CreateIndex
CREATE INDEX "project_application_version_stage_plan_application_version__idx" ON "project_application_version_stage_plan"("application_version_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "project_application_version_stage_plan_application_version__key" ON "project_application_version_stage_plan"("application_version_id", "template_stage_id");

-- CreateIndex
CREATE INDEX "project_application_activity_project_id_created_at_idx" ON "project_application_activity"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_application_activity_project_id_id_key" ON "project_application_activity"("project_id", "id");

-- CreateIndex
CREATE INDEX "project_application_command_project_id_created_at_idx" ON "project_application_command"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_application_command_actor_person_id_command_id_key" ON "project_application_command"("actor_person_id", "command_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_application_code_key" ON "project"("application_code");

-- CreateIndex
CREATE UNIQUE INDEX "project_current_application_version_id_key" ON "project"("current_application_version_id");

-- Concurrent business invariants that Prisma cannot express.
CREATE UNIQUE INDEX "role_eligibility_one_active_key"
ON "role_eligibility" ("person_id", "role_code")
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "project_application_version_one_editable_key"
ON "project_application_version" ("project_id")
WHERE "version_status" = 'EDITABLE';

CREATE UNIQUE INDEX "project_application_version_one_primary_owner_key"
ON "project_application_version_owner" ("application_version_id")
WHERE "is_primary" = true;

CREATE UNIQUE INDEX "project_normalized_name_occupancy_key"
ON "project" ("normalized_name_occupancy")
WHERE "normalized_name_occupancy" IS NOT NULL
  AND "status" IN ('PENDING_ESTABLISHMENT_REVIEW', 'RETURNED_FOR_REVISION', 'ON_HOLD', 'ACTIVE', 'CLOSING', 'COMPLETED', 'ARCHIVED');

ALTER TABLE "role_eligibility"
  ADD CONSTRAINT "role_eligibility_role_code_check"
  CHECK ("role_code" = 'KEY_SUB_I'),
  ADD CONSTRAINT "role_eligibility_status_time_check"
  CHECK (
    ("status" = 'ACTIVE' AND "ended_by_person_id" IS NULL AND "ended_at" IS NULL)
    OR
    ("status" = 'ENDED' AND "ended_by_person_id" IS NOT NULL AND "ended_at" IS NOT NULL)
  );

ALTER TABLE "project"
  ADD CONSTRAINT "project_formal_fields_complete_check"
  CHECK (
    "status" NOT IN ('ACTIVE', 'CLOSING', 'COMPLETED', 'ARCHIVED')
    OR (
      "project_code" IS NOT NULL
      AND "established_by_person_id" IS NOT NULL
      AND "established_at" IS NOT NULL
      AND "project_summary" IS NOT NULL
      AND "disease_area_option_id" IS NOT NULL
      AND "research_type_option_id" IS NOT NULL
      AND "priority_option_id" IS NOT NULL
      AND "planned_start_date" IS NOT NULL
      AND "planned_end_date" IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE "notification"
  DROP CONSTRAINT "notification_type_source_check";

ALTER TABLE "notification"
  ADD CONSTRAINT "notification_type_source_check" CHECK (
    ("notification_type" = 'ISSUE_MESSAGE' AND "issue_id" IS NOT NULL AND "event_code" LIKE 'ISSUE_%')
    OR ("notification_type" = 'WORKFLOW_REVIEW_NOTICE' AND "workflow_update_id" IS NOT NULL AND "event_code" LIKE 'WORKFLOW_COMPLETION_%')
    OR ("notification_type" = 'PROJECT_REVIEW_NOTICE' AND "project_id" IS NOT NULL AND "event_code" LIKE 'PROJECT_%'
        AND num_nonnulls("project_establishment_review_id", "project_application_activity_id", "project_plan_change_request_id", "project_field_change_request_id", "project_completion_request_id") = 1)
    OR ("notification_type" = 'WORKFLOW_FILL_REMINDER' AND "project_workflow_stage_id" IS NOT NULL AND "event_code" IN ('WORKFLOW_UPDATE_DUE', 'WORKFLOW_MANUAL_REMINDER_SENT'))
    OR ("notification_type" = 'MILESTONE_UPCOMING_REMINDER' AND "project_workflow_stage_id" IS NOT NULL AND "event_code" = 'MILESTONE_UPCOMING')
    OR ("notification_type" = 'MILESTONE_OVERDUE_REMINDER' AND "project_workflow_stage_id" IS NOT NULL AND "event_code" = 'MILESTONE_OVERDUE')
    OR ("notification_type" = 'SYSTEM_NOTICE' AND "event_code" = 'WORKFLOW_EXCEPTION_DIGEST')
  );

CREATE OR REPLACE FUNCTION "prevent_formal_identifier_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'project' THEN
    IF OLD."application_code" IS NOT NULL AND NEW."application_code" IS DISTINCT FROM OLD."application_code" THEN
      RAISE EXCEPTION 'application_code is immutable once assigned';
    END IF;
    IF OLD."project_code" IS NOT NULL AND NEW."project_code" IS DISTINCT FROM OLD."project_code" THEN
      RAISE EXCEPTION 'project_code is immutable once assigned';
    END IF;
  ELSIF TG_TABLE_NAME = 'dictionary' THEN
    IF NEW."dictionary_code" IS DISTINCT FROM OLD."dictionary_code" THEN
      RAISE EXCEPTION 'dictionary_code is immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'dictionary_option' THEN
    IF NEW."dictionary_code" IS DISTINCT FROM OLD."dictionary_code" OR NEW."option_code" IS DISTINCT FROM OLD."option_code" THEN
      RAISE EXCEPTION 'dictionary option codes are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER "project_code_immutable" ON "project";
CREATE TRIGGER "project_code_immutable"
BEFORE UPDATE OF "project_code", "application_code" ON "project"
FOR EACH ROW EXECUTE FUNCTION "prevent_formal_identifier_change"();

CREATE FUNCTION "validate_project_current_application_version"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."current_application_version_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "project_application_version" version
    WHERE version."id" = NEW."current_application_version_id"
      AND version."project_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'current application version must belong to the same project';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "project_current_application_version_scope"
BEFORE INSERT OR UPDATE OF "current_application_version_id" ON "project"
FOR EACH ROW EXECUTE FUNCTION "validate_project_current_application_version"();

CREATE FUNCTION "validate_application_stage_template_scope"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "project_application_version" version
    JOIN "stage_template" stage ON stage."id" = NEW."template_stage_id"
    WHERE version."id" = NEW."application_version_id"
      AND version."lifecycle_template_version_id" = stage."template_version_id"
  ) THEN
    RAISE EXCEPTION 'application stage must belong to the selected template version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "project_application_stage_template_scope"
BEFORE INSERT OR UPDATE ON "project_application_version_stage_plan"
FOR EACH ROW EXECUTE FUNCTION "validate_application_stage_template_scope"();

CREATE FUNCTION "protect_frozen_application_content"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_version_id uuid;
  target_status "ProjectApplicationVersionStatus";
BEGIN
  IF TG_TABLE_NAME = 'project_application_version' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD."version_status" = 'FROZEN' THEN
      RAISE EXCEPTION 'frozen application version is immutable';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  target_version_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."application_version_id" ELSE NEW."application_version_id" END;
  SELECT "version_status" INTO target_status
  FROM "project_application_version"
  WHERE "id" = target_version_id;

  IF target_status = 'FROZEN' THEN
    RAISE EXCEPTION 'frozen application version children are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "project_application_version_immutable"
BEFORE UPDATE OR DELETE ON "project_application_version"
FOR EACH ROW EXECUTE FUNCTION "protect_frozen_application_content"();

CREATE TRIGGER "project_application_owner_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "project_application_version_owner"
FOR EACH ROW EXECUTE FUNCTION "protect_frozen_application_content"();

CREATE TRIGGER "project_application_stage_plan_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "project_application_version_stage_plan"
FOR EACH ROW EXECUTE FUNCTION "protect_frozen_application_content"();

CREATE FUNCTION "validate_application_version_freeze"() RETURNS trigger
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
  WHERE "template_version_id" = NEW."lifecycle_template_version_id"
    AND "enabled" = true;

  SELECT count(*) INTO actual_stage_count
  FROM "project_application_version_stage_plan"
  WHERE "application_version_id" = NEW."id";

  IF required_stage_count = 0 OR actual_stage_count <> required_stage_count THEN
    RAISE EXCEPTION 'frozen application version requires every enabled template stage';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "project_application_version_freeze_guard"
BEFORE UPDATE OF "version_status" ON "project_application_version"
FOR EACH ROW EXECUTE FUNCTION "validate_application_version_freeze"();

CREATE FUNCTION "validate_established_project_atom"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  active_plan_count integer;
  active_primary_count integer;
BEGIN
  IF NEW."status" <> 'ACTIVE' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO active_plan_count
  FROM "project_plan" plan
  JOIN "project_plan_version" version ON version."project_plan_id" = plan."id"
  WHERE plan."project_id" = NEW."id" AND version."status" = 'ACTIVE';

  SELECT count(*) INTO active_primary_count
  FROM "role_assignment"
  WHERE "project_id" = NEW."id"
    AND "role_code" = 'KEY_SUB_I'
    AND "assignment_status" = 'ACTIVE'
    AND "is_primary" = true;

  IF active_plan_count <> 1 OR active_primary_count <> 1 THEN
    RAISE EXCEPTION 'active project requires one active plan and one active primary Key Sub-I';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "project_establishment_atom_guard"
AFTER INSERT OR UPDATE OF "status" ON "project"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "validate_established_project_atom"();

ALTER TABLE "project_application_version"
  ADD CONSTRAINT "project_application_version_number_check"
  CHECK ("version_no" > 0),
  ADD CONSTRAINT "project_application_version_freeze_check"
  CHECK (
    ("version_status" = 'EDITABLE' AND "frozen_at" IS NULL)
    OR
    ("version_status" = 'FROZEN' AND "frozen_at" IS NOT NULL)
  );

ALTER TABLE "project_application_version_owner"
  ADD CONSTRAINT "project_application_version_owner_sort_check"
  CHECK ("sort_order" >= 0);

ALTER TABLE "project_application_version_stage_plan"
  ADD CONSTRAINT "project_application_version_stage_plan_check"
  CHECK (
    "sort_order" >= 0
    AND "planned_start_date" <= "planned_end_date"
  );

ALTER TABLE "project"
  ADD CONSTRAINT "project_application_code_format_check"
  CHECK ("application_code" ~ '^APP-[0-9]{4,}$'),
  ADD CONSTRAINT "project_application_state_name_occupancy_check"
  CHECK (
    CASE
      WHEN "status" IN ('PENDING_ESTABLISHMENT_REVIEW', 'RETURNED_FOR_REVISION', 'ON_HOLD', 'ACTIVE', 'CLOSING', 'COMPLETED', 'ARCHIVED')
      THEN "normalized_name_occupancy" IS NOT NULL
      ELSE "normalized_name_occupancy" IS NULL
    END
  );

-- AddForeignKey
ALTER TABLE "role_eligibility" ADD CONSTRAINT "role_eligibility_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_eligibility" ADD CONSTRAINT "role_eligibility_granted_by_person_id_fkey" FOREIGN KEY ("granted_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_eligibility" ADD CONSTRAINT "role_eligibility_ended_by_person_id_fkey" FOREIGN KEY ("ended_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_current_application_version_id_fkey" FOREIGN KEY ("current_application_version_id") REFERENCES "project_application_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_version" ADD CONSTRAINT "project_application_version_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_version" ADD CONSTRAINT "project_application_version_disease_area_dictionary_code_d_fkey" FOREIGN KEY ("disease_area_dictionary_code", "disease_area_option_id") REFERENCES "dictionary_option"("dictionary_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_version" ADD CONSTRAINT "project_application_version_research_type_dictionary_code__fkey" FOREIGN KEY ("research_type_dictionary_code", "research_type_option_id") REFERENCES "dictionary_option"("dictionary_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_version" ADD CONSTRAINT "project_application_version_priority_dictionary_code_prior_fkey" FOREIGN KEY ("priority_dictionary_code", "priority_option_id") REFERENCES "dictionary_option"("dictionary_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_version" ADD CONSTRAINT "project_application_version_lifecycle_template_version_id_fkey" FOREIGN KEY ("lifecycle_template_version_id") REFERENCES "lifecycle_template_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_version" ADD CONSTRAINT "project_application_version_created_by_person_id_fkey" FOREIGN KEY ("created_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_version_owner" ADD CONSTRAINT "project_application_version_owner_application_version_id_fkey" FOREIGN KEY ("application_version_id") REFERENCES "project_application_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_version_owner" ADD CONSTRAINT "project_application_version_owner_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_version_stage_plan" ADD CONSTRAINT "project_application_version_stage_plan_application_version_fkey" FOREIGN KEY ("application_version_id") REFERENCES "project_application_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_version_stage_plan" ADD CONSTRAINT "project_application_version_stage_plan_template_stage_id_fkey" FOREIGN KEY ("template_stage_id") REFERENCES "stage_template"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_establishment_review" ADD CONSTRAINT "project_establishment_review_project_id_application_versio_fkey" FOREIGN KEY ("project_id", "application_version_id") REFERENCES "project_application_version"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_activity" ADD CONSTRAINT "project_application_activity_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_activity" ADD CONSTRAINT "project_application_activity_project_id_application_versio_fkey" FOREIGN KEY ("project_id", "application_version_id") REFERENCES "project_application_version"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_activity" ADD CONSTRAINT "project_application_activity_project_id_review_id_fkey" FOREIGN KEY ("project_id", "review_id") REFERENCES "project_establishment_review"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_activity" ADD CONSTRAINT "project_application_activity_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_command" ADD CONSTRAINT "project_application_command_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_command" ADD CONSTRAINT "project_application_command_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_command" ADD CONSTRAINT "project_application_command_project_id_application_version_fkey" FOREIGN KEY ("project_id", "application_version_id") REFERENCES "project_application_version"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_application_command" ADD CONSTRAINT "project_application_command_project_id_review_id_fkey" FOREIGN KEY ("project_id", "review_id") REFERENCES "project_establishment_review"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_project_application_activity_id_fkey" FOREIGN KEY ("project_id", "project_application_activity_id") REFERENCES "project_application_activity"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
