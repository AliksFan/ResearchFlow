-- The baseline function accessed fields from unrelated tables when the first
-- condition was false. Branch on the trigger table before reading its record.
CREATE OR REPLACE FUNCTION "prevent_formal_identifier_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'project' THEN
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
