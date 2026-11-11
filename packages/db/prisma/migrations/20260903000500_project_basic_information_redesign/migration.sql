-- Retired field-change flows were never exposed. Refuse to erase unexpected
-- business history instead of silently rewriting it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "project_field_change_request"
    WHERE "change_category"::TEXT IN ('ETHICS', 'REGISTRATION', 'CONTRACT', 'FUNDING_AND_BUDGET')
  ) THEN
    RAISE EXCEPTION 'retired project field change requests must be resolved before removing their categories';
  END IF;
END $$;

DELETE FROM "dictionary_option_suggestion_source"
WHERE "suggestion_id" IN (
  SELECT "id" FROM "dictionary_option_suggestion"
  WHERE "dictionary_code" IN ('CONTRACT_STATUS', 'ETHICS_STATUS', 'REGISTRATION_STATUS', 'FUNDING_STATUS')
);
DELETE FROM "dictionary_option_suggestion"
WHERE "dictionary_code" IN ('CONTRACT_STATUS', 'ETHICS_STATUS', 'REGISTRATION_STATUS', 'FUNDING_STATUS');

ALTER TABLE "project" DROP CONSTRAINT "project_contract_status_dictionary_code_contract_status_op_fkey";
ALTER TABLE "project" DROP CONSTRAINT "project_ethics_status_dictionary_code_ethics_status_option_fkey";
ALTER TABLE "project" DROP CONSTRAINT "project_registration_status_dictionary_code_registration_s_fkey";
ALTER TABLE "project" DROP CONSTRAINT "project_funding_status_dictionary_code_funding_status_opti_fkey";

ALTER TABLE "project" RENAME COLUMN "budget_total" TO "funding_record_amount_cny";
ALTER TABLE "project"
  DROP COLUMN "contract_summary",
  DROP COLUMN "contract_status_dictionary_code",
  DROP COLUMN "contract_status_option_id",
  DROP COLUMN "ethics_status_dictionary_code",
  DROP COLUMN "ethics_status_option_id",
  DROP COLUMN "ethics_approval_number",
  DROP COLUMN "registration_status_dictionary_code",
  DROP COLUMN "registration_status_option_id",
  DROP COLUMN "registration_number",
  DROP COLUMN "funding_status_dictionary_code",
  DROP COLUMN "funding_status_option_id",
  DROP COLUMN "budget_currency_code";

DELETE FROM "dictionary_option"
WHERE "dictionary_code" IN ('CONTRACT_STATUS', 'ETHICS_STATUS', 'REGISTRATION_STATUS', 'FUNDING_STATUS');
DELETE FROM "dictionary"
WHERE "dictionary_code" IN ('CONTRACT_STATUS', 'ETHICS_STATUS', 'REGISTRATION_STATUS', 'FUNDING_STATUS');

-- Both enum columns participate in the existing open-request index. Rebuild it
-- after the enum changes so project-status governance keeps the same guard.
DROP INDEX "project_field_change_request_one_active_category_key";

ALTER TABLE "project_field_change_request"
  ALTER COLUMN "change_category" TYPE TEXT USING "change_category"::TEXT;
DROP TYPE "FieldChangeCategory";
CREATE TYPE "FieldChangeCategory" AS ENUM ('BASIC_INFORMATION', 'PROJECT_STATUS');
ALTER TABLE "project_field_change_request"
  ALTER COLUMN "change_category" TYPE "FieldChangeCategory" USING "change_category"::"FieldChangeCategory";

ALTER TABLE "project_field_change_request"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
DROP TYPE "FieldChangeRequestStatus";
CREATE TYPE "FieldChangeRequestStatus" AS ENUM (
  'DRAFT',
  'PENDING_PMO_REVIEW',
  'PENDING_PRIMARY_KEY_SUB_I_REVIEW',
  'RETURNED_FOR_REVISION',
  'ON_HOLD',
  'PENDING_DEAN_DECISION',
  'PENDING_PMO_IMPLEMENTATION',
  'PENDING_PMO_APPLICATION',
  'DEAN_REJECTED_PENDING_PMO_DISPOSITION',
  'APPLIED',
  'STALE',
  'CLOSED'
);
ALTER TABLE "project_field_change_request"
  ALTER COLUMN "status" TYPE "FieldChangeRequestStatus" USING "status"::"FieldChangeRequestStatus",
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "project_field_change_request"
  ADD COLUMN "primary_key_sub_i_person_id_snapshot" UUID;

ALTER TABLE "project_field_change_request"
  ADD CONSTRAINT "basic_information_request_status_check" CHECK (
    "change_category" <> 'BASIC_INFORMATION'
    OR "status" IN (
      'DRAFT', 'PENDING_PMO_REVIEW', 'PENDING_PRIMARY_KEY_SUB_I_REVIEW',
      'RETURNED_FOR_REVISION', 'APPLIED', 'STALE', 'CLOSED'
    )
  );

CREATE UNIQUE INDEX "project_field_change_request_one_active_category_key"
ON "project_field_change_request" ("project_id", "change_category")
WHERE "status" NOT IN ('APPLIED', 'STALE', 'CLOSED');

ALTER TABLE "project_governance_setting"
  DROP COLUMN "budget_change_ratio_threshold",
  DROP COLUMN "budget_change_amount_threshold";
ALTER TABLE "project_governance_setting"
  ADD CONSTRAINT "project_governance_setting_values_check" CHECK (
    "suspension_days_threshold" IS NULL OR "suspension_days_threshold" > 0
  );
