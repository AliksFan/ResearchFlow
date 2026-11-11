-- Remove dictionary suggestions before removing their dictionary.
DELETE FROM "dictionary_option_suggestion_source"
WHERE "suggestion_id" IN (
  SELECT "id" FROM "dictionary_option_suggestion" WHERE "dictionary_code" = 'PROJECT_PRIORITY'
);

DELETE FROM "dictionary_option_suggestion" WHERE "dictionary_code" = 'PROJECT_PRIORITY';

-- Remove direct project references before deleting priority options.
ALTER TABLE "project" DROP CONSTRAINT "project_priority_dictionary_code_priority_option_id_fkey";
ALTER TABLE "project_application_version" DROP CONSTRAINT "project_application_version_priority_dictionary_code_prior_fkey";

ALTER TABLE "project"
  DROP COLUMN "principal_investigator_display_text",
  DROP COLUMN "priority_dictionary_code",
  DROP COLUMN "priority_option_id",
  DROP COLUMN "target_sample_size",
  DROP COLUMN "enrolled_count";

ALTER TABLE "project_application_version"
  DROP COLUMN "principal_investigator_display_text",
  DROP COLUMN "priority_dictionary_code",
  DROP COLUMN "priority_option_id",
  DROP COLUMN "target_sample_size";

DELETE FROM "dictionary_option" WHERE "dictionary_code" = 'PROJECT_PRIORITY';
DELETE FROM "dictionary" WHERE "dictionary_code" = 'PROJECT_PRIORITY';
