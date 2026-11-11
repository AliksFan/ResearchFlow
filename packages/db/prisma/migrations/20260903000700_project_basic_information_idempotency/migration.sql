ALTER TABLE "project_field_change_request"
  ADD COLUMN "command_id" UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX "project_field_change_request_submitted_by_person_id_command_id_key"
  ON "project_field_change_request" ("submitted_by_person_id", "command_id");
