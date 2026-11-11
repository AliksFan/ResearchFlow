-- The target-sample-size feature was never activated. Refuse to erase any
-- unexpected historical request instead of silently rewriting audit history.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "project_field_change_request"
    WHERE "change_category" = 'TARGET_SAMPLE_SIZE'
  ) THEN
    RAISE EXCEPTION 'TARGET_SAMPLE_SIZE field change requests must be resolved before removing the feature';
  END IF;
END $$;

ALTER TABLE "project_field_change_request"
  ALTER COLUMN "change_category" TYPE TEXT
  USING "change_category"::TEXT;

DROP TYPE "FieldChangeCategory";
CREATE TYPE "FieldChangeCategory" AS ENUM (
  'PROJECT_STATUS',
  'ETHICS',
  'REGISTRATION',
  'CONTRACT',
  'FUNDING_AND_BUDGET'
);

ALTER TABLE "project_field_change_request"
  ALTER COLUMN "change_category" TYPE "FieldChangeCategory"
  USING "change_category"::"FieldChangeCategory";

ALTER TABLE "project_governance_setting"
  DROP COLUMN "sample_size_change_ratio_threshold",
  DROP COLUMN "sample_size_change_amount_threshold";
