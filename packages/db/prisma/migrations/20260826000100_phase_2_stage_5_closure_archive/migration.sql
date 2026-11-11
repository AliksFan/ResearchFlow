-- Stage 5 intentionally refuses to reinterpret Stage 4 implementation rows.
-- The approved deployment procedure must first prove these tables are empty.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "issue_implementation_submission") THEN
    RAISE EXCEPTION 'stage 5 migration requires an approved history-preservation plan when issue implementation submissions exist';
  END IF;
  IF EXISTS (SELECT 1 FROM "issue" WHERE "invalid_close_explanation" IS NOT NULL) THEN
    RAISE EXCEPTION 'stage 5 migration requires an approved history-preservation plan when invalid close explanations exist';
  END IF;
END $$;

ALTER TABLE "issue" ALTER COLUMN "expected_support" DROP NOT NULL;
ALTER TABLE "issue" DROP COLUMN "invalid_close_explanation";
ALTER TABLE "issue_dean_decision" ALTER COLUMN "pmo_implementation_instruction" DROP NOT NULL;
ALTER TABLE "issue_implementation_submission" RENAME COLUMN "result_detail" TO "result_summary";
ALTER TABLE "issue_implementation_review" ALTER COLUMN "comment" DROP NOT NULL;
