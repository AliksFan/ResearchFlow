CREATE OR REPLACE FUNCTION "validate_application_version_freeze"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  primary_count integer;
  applicant_count integer;
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
