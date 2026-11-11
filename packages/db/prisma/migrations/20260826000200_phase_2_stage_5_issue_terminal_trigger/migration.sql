-- Stage 5 removed invalid_close_explanation from issue. Keep the deferred
-- terminal-state constraint aligned with the simplified close-invalid matrix.
CREATE OR REPLACE FUNCTION "validate_issue_terminal_state"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_project_id uuid;
  target_issue_id uuid;
  current_state "IssueHandlingStateCode";
  issue_row record;
BEGIN
  IF TG_TABLE_NAME = 'issue' THEN
    target_project_id := NEW."project_id";
    target_issue_id := NEW."id";
  ELSE
    target_project_id := NEW."project_id";
    target_issue_id := NEW."issue_id";
  END IF;

  SELECT * INTO issue_row FROM "issue"
  WHERE "project_id" = target_project_id AND "id" = target_issue_id;

  SELECT "state_code" INTO current_state FROM "issue_handling_state"
  WHERE "project_id" = target_project_id AND "issue_id" = target_issue_id AND "exited_at" IS NULL;

  IF current_state = 'RESOLVED' THEN
    IF issue_row."resolved_at" IS NULL OR issue_row."resolution_method" IS NULL OR issue_row."resolved_by_person_id" IS NULL OR issue_row."closed_at" IS NOT NULL THEN
      RAISE EXCEPTION 'resolved issue fields are inconsistent with current handling state';
    END IF;
  ELSIF current_state = 'CLOSED_INVALID' THEN
    IF issue_row."closed_at" IS NULL OR issue_row."invalid_close_reason_code" IS NULL THEN
      RAISE EXCEPTION 'invalidly closed issue fields are incomplete';
    END IF;
  ELSE
    IF issue_row."resolved_at" IS NOT NULL OR issue_row."closed_at" IS NOT NULL THEN
      RAISE EXCEPTION 'non-terminal issue cannot carry terminal timestamps';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
