-- Dictionary options whose code is OTHER carry both the selected option and
-- its required free-text clarification. Keep text-only, number-only, and
-- date-only changes isolated while allowing that option/text pair.
ALTER TABLE "project_field_change_item"
  DROP CONSTRAINT "project_field_change_item_value_family_check";

ALTER TABLE "project_field_change_item"
  ADD CONSTRAINT "project_field_change_item_value_family_check" CHECK (
    num_nonnulls("old_option_id", "new_option_id") = 0
      AND num_nonnulls("old_value_text", "new_value_text") > 0
      AND "old_value_text" IS DISTINCT FROM "new_value_text"
      AND num_nonnulls("old_number_value", "new_number_value", "old_date_value", "new_date_value") = 0
    OR num_nonnulls("old_option_id", "new_option_id") > 0
      AND (
        "old_option_id" IS DISTINCT FROM "new_option_id"
        OR "old_value_text" IS DISTINCT FROM "new_value_text"
      )
      AND num_nonnulls("old_number_value", "new_number_value", "old_date_value", "new_date_value") = 0
    OR num_nonnulls("old_number_value", "new_number_value") > 0
      AND "old_number_value" IS DISTINCT FROM "new_number_value"
      AND num_nonnulls("old_value_text", "new_value_text", "old_option_id", "new_option_id", "old_date_value", "new_date_value") = 0
    OR num_nonnulls("old_date_value", "new_date_value") > 0
      AND "old_date_value" IS DISTINCT FROM "new_date_value"
      AND num_nonnulls("old_value_text", "new_value_text", "old_option_id", "new_option_id", "old_number_value", "new_number_value") = 0
  );
