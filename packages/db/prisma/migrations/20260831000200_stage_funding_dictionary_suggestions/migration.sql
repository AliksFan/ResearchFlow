CREATE TYPE "DictionaryOptionSuggestionStatus" AS ENUM ('PENDING', 'PROMOTED', 'MERGED', 'REJECTED');

ALTER TABLE "project_application_version"
  ADD COLUMN "funding_record_amount_cny" DECIMAL(14,2),
  ADD COLUMN "disease_area_other_text" TEXT,
  ADD COLUMN "research_type_other_text" TEXT,
  ADD CONSTRAINT "project_application_version_funding_record_amount_cny_check"
    CHECK ("funding_record_amount_cny" IS NULL OR "funding_record_amount_cny" > 0);

ALTER TABLE "project"
  ADD COLUMN "disease_area_other_text" TEXT,
  ADD COLUMN "research_type_other_text" TEXT;

ALTER TABLE "project"
  DROP CONSTRAINT "project_formal_fields_complete_check";

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
    )
  );

CREATE TABLE "project_application_version_stage_plan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "application_version_id" UUID NOT NULL,
  "stage_template_id" UUID NOT NULL,
  "target_completion_date" DATE,
  CONSTRAINT "project_application_version_stage_plan_pkey" PRIMARY KEY ("id")
);

INSERT INTO "project_application_version_stage_plan" (
  "application_version_id",
  "stage_template_id",
  "target_completion_date"
)
SELECT
  node_plan."application_version_id",
  node."stage_template_id",
  max(node_plan."target_completion_date")
FROM "project_application_version_node_plan" AS node_plan
JOIN "workflow_stage_template" AS node
  ON node."id" = node_plan."workflow_stage_template_id"
JOIN "project_application_version" AS application_version
  ON application_version."id" = node_plan."application_version_id"
 AND application_version."lifecycle_template_version_id" = node."template_version_id"
GROUP BY node_plan."application_version_id", node."stage_template_id";

CREATE UNIQUE INDEX "application_stage_plan_version_stage_key"
  ON "project_application_version_stage_plan"("application_version_id", "stage_template_id");
CREATE INDEX "application_stage_plan_version_idx"
  ON "project_application_version_stage_plan"("application_version_id");
ALTER TABLE "project_application_version_stage_plan"
  ADD CONSTRAINT "project_application_version_stage_plan_application_version_id_fkey"
  FOREIGN KEY ("application_version_id") REFERENCES "project_application_version"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_application_version_stage_plan"
  ADD CONSTRAINT "project_application_version_stage_plan_stage_template_id_fkey"
  FOREIGN KEY ("stage_template_id") REFERENCES "stage_template"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

DROP TABLE "project_application_version_node_plan";

INSERT INTO "dictionary" (
  "id", "dictionary_code", "dictionary_name", "description", "enabled", "created_at", "updated_at"
)
VALUES (
  gen_random_uuid(), 'EXTERNAL_CONTACT_CATEGORY', '外部联系人分类', '项目级外部联系人分类', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("dictionary_code") DO NOTHING;

INSERT INTO "dictionary_option" (
  "id", "dictionary_id", "dictionary_code", "option_code", "display_name", "sort_order", "enabled", "created_at", "updated_at"
)
SELECT gen_random_uuid(), dictionary."id", dictionary."dictionary_code", 'OTHER', '其它', 9999, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "dictionary"
WHERE dictionary."dictionary_code" IN ('DISEASE_AREA', 'RESEARCH_TYPE', 'ISSUE_TYPE', 'EXTERNAL_CONTACT_CATEGORY')
ON CONFLICT ("dictionary_code", "option_code") DO NOTHING;

CREATE TABLE "dictionary_option_suggestion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "dictionary_code" TEXT NOT NULL,
  "proposed_display_name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "status" "DictionaryOptionSuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "target_option_id" UUID,
  "reviewed_by_person_id" UUID,
  "reviewed_at" TIMESTAMPTZ(3),
  "review_comment" TEXT,
  "row_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "dictionary_option_suggestion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "dictionary_suggestion_name_key"
  ON "dictionary_option_suggestion"("dictionary_code", "normalized_name");
CREATE INDEX "dictionary_suggestion_status_idx"
  ON "dictionary_option_suggestion"("dictionary_code", "status", "created_at");
ALTER TABLE "dictionary_option_suggestion"
  ADD CONSTRAINT "dictionary_option_suggestion_dictionary_code_fkey"
  FOREIGN KEY ("dictionary_code") REFERENCES "dictionary"("dictionary_code")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "dictionary_option_suggestion"
  ADD CONSTRAINT "dictionary_option_suggestion_dictionary_code_target_option_id_fkey"
  FOREIGN KEY ("dictionary_code", "target_option_id") REFERENCES "dictionary_option"("dictionary_code", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "dictionary_option_suggestion"
  ADD CONSTRAINT "dictionary_option_suggestion_reviewed_by_person_id_fkey"
  FOREIGN KEY ("reviewed_by_person_id") REFERENCES "person"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "dictionary_option_suggestion_source" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "suggestion_id" UUID NOT NULL,
  "application_version_id" UUID,
  "issue_id" UUID,
  "field_code" TEXT NOT NULL,
  "submitted_by_person_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dictionary_option_suggestion_source_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dictionary_option_suggestion_source_exactly_one_parent_check"
    CHECK (num_nonnulls("application_version_id", "issue_id") = 1)
);
CREATE INDEX "dictionary_suggestion_source_suggestion_idx"
  ON "dictionary_option_suggestion_source"("suggestion_id", "created_at");
CREATE UNIQUE INDEX "dictionary_option_suggestion_source_application_field_key"
  ON "dictionary_option_suggestion_source"("application_version_id", "field_code")
  WHERE "application_version_id" IS NOT NULL;
CREATE UNIQUE INDEX "dictionary_option_suggestion_source_issue_field_key"
  ON "dictionary_option_suggestion_source"("issue_id", "field_code")
  WHERE "issue_id" IS NOT NULL;
ALTER TABLE "dictionary_option_suggestion_source"
  ADD CONSTRAINT "dictionary_option_suggestion_source_suggestion_id_fkey"
  FOREIGN KEY ("suggestion_id") REFERENCES "dictionary_option_suggestion"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "dictionary_option_suggestion_source"
  ADD CONSTRAINT "dictionary_option_suggestion_source_application_version_id_fkey"
  FOREIGN KEY ("application_version_id") REFERENCES "project_application_version"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "dictionary_option_suggestion_source"
  ADD CONSTRAINT "dictionary_option_suggestion_source_issue_id_fkey"
  FOREIGN KEY ("issue_id") REFERENCES "issue"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "dictionary_option_suggestion_source"
  ADD CONSTRAINT "dictionary_option_suggestion_source_submitted_by_person_id_fkey"
  FOREIGN KEY ("submitted_by_person_id") REFERENCES "person"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE OR REPLACE FUNCTION "validate_application_version_freeze"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  primary_count integer;
  applicant_count integer;
  disease_option_code text;
  research_option_code text;
BEGIN
  IF NEW."version_status" <> 'FROZEN' OR OLD."version_status" = 'FROZEN' THEN
    RETURN NEW;
  END IF;

  IF NEW."project_summary" IS NULL
     OR NEW."disease_area_option_id" IS NULL
     OR NEW."research_type_option_id" IS NULL
     OR NEW."lifecycle_template_version_id" IS NULL THEN
    RAISE EXCEPTION 'frozen application version is incomplete';
  END IF;

  SELECT "option_code" INTO disease_option_code
  FROM "dictionary_option"
  WHERE "dictionary_code" = 'DISEASE_AREA' AND "id" = NEW."disease_area_option_id" AND "enabled";
  SELECT "option_code" INTO research_option_code
  FROM "dictionary_option"
  WHERE "dictionary_code" = 'RESEARCH_TYPE' AND "id" = NEW."research_type_option_id" AND "enabled";

  IF disease_option_code IS NULL OR research_option_code IS NULL
     OR (disease_option_code = 'OTHER') <> (nullif(btrim(NEW."disease_area_other_text"), '') IS NOT NULL)
     OR (research_option_code = 'OTHER') <> (nullif(btrim(NEW."research_type_other_text"), '') IS NOT NULL) THEN
    RAISE EXCEPTION 'frozen application version has invalid dictionary option details';
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

  RETURN NEW;
END;
$$;
