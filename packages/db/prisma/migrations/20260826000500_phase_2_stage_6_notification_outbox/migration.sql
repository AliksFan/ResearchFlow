DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "notification" GROUP BY "event_key", "recipient_person_id", "recipient_role_code" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'STAGE_6_NOTIFICATION_EVENT_KEY_DUPLICATES_REQUIRE_REVIEW';
  END IF;
  IF EXISTS (SELECT 1 FROM "notification" WHERE "recipient_role_code" IS NULL) THEN
    RAISE EXCEPTION 'STAGE_6_NOTIFICATION_RECIPIENT_ROLE_SNAPSHOT_MISSING_REQUIRES_REVIEW';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "notification_outbox" o
    JOIN "notification" n ON n."id" = o."notification_id"
    WHERE n."recipient_person_id" <> o."recipient_person_id"
  ) THEN
    RAISE EXCEPTION 'STAGE_6_OUTBOX_RECIPIENT_SNAPSHOT_MISMATCH_REQUIRES_REVIEW';
  END IF;
END $$;

ALTER TABLE "notification_outbox"
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lease_owner" TEXT,
  ADD COLUMN "lease_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "last_error_code" TEXT;

ALTER TABLE "notification" ALTER COLUMN "recipient_role_code" SET NOT NULL;
CREATE UNIQUE INDEX "notification_id_recipient_person_id_key" ON "notification"("id", "recipient_person_id");

ALTER TABLE "notification_outbox" DROP CONSTRAINT "notification_outbox_notification_id_fkey";
ALTER TABLE "notification_outbox"
  ADD CONSTRAINT "notification_outbox_notification_id_recipient_person_id_fkey"
  FOREIGN KEY ("notification_id", "recipient_person_id")
  REFERENCES "notification"("id", "recipient_person_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "notification_outbox_lease_expires_at_idx"
  ON "notification_outbox"("lease_expires_at");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "notification_outbox" WHERE "status" = 'PROCESSING') THEN
    RAISE EXCEPTION 'STAGE_6_PROCESSING_OUTBOX_REQUIRES_REVIEW';
  END IF;
END $$;

ALTER TABLE "notification_outbox"
  ADD CONSTRAINT "notification_outbox_attempt_count_check"
  CHECK ("attempt_count" >= 0 AND "attempt_count" <= "max_attempts"),
  ADD CONSTRAINT "notification_outbox_lease_state_check"
  CHECK (
    ("status" = 'PROCESSING' AND "lease_owner" IS NOT NULL AND "lease_expires_at" IS NOT NULL)
    OR
    ("status" <> 'PROCESSING' AND "lease_owner" IS NULL AND "lease_expires_at" IS NULL)
  );

ALTER TABLE "file_asset"
  ADD COLUMN "cleanup_attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cleanup_lease_owner" TEXT,
  ADD COLUMN "cleanup_lease_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "cleanup_next_attempt_at" TIMESTAMPTZ(3),
  ADD COLUMN "cleanup_last_error_code" TEXT;

CREATE INDEX "file_asset_cleanup_next_attempt_at_cleanup_lease_expires_at_idx"
  ON "file_asset"("cleanup_next_attempt_at", "cleanup_lease_expires_at");

ALTER TABLE "file_asset"
  ADD CONSTRAINT "file_asset_cleanup_attempt_count_check" CHECK ("cleanup_attempt_count" >= 0 AND "cleanup_attempt_count" <= 5),
  ADD CONSTRAINT "file_asset_cleanup_lease_pair_check" CHECK (
    ("cleanup_lease_owner" IS NULL AND "cleanup_lease_expires_at" IS NULL)
    OR ("cleanup_lease_owner" IS NOT NULL AND "cleanup_lease_expires_at" IS NOT NULL)
  );

ALTER TABLE "reminder_run"
  ADD COLUMN "max_attempts" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "next_attempt_at" TIMESTAMPTZ(3),
  ADD COLUMN "lease_owner" TEXT,
  ADD COLUMN "lease_expires_at" TIMESTAMPTZ(3);

CREATE INDEX "reminder_run_lease_expires_at_next_attempt_at_idx"
  ON "reminder_run"("lease_expires_at", "next_attempt_at");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "reminder_run" WHERE "status" = 'RUNNING') THEN
    RAISE EXCEPTION 'STAGE_6_RUNNING_REMINDER_RUN_REQUIRES_REVIEW';
  END IF;
  IF EXISTS (SELECT 1 FROM "reminder_run" WHERE "attempt_count" > 5) THEN
    RAISE EXCEPTION 'STAGE_6_REMINDER_ATTEMPT_COUNT_REQUIRES_REVIEW';
  END IF;
END $$;

ALTER TABLE "reminder_run"
  ADD CONSTRAINT "reminder_run_attempt_count_check" CHECK ("attempt_count" >= 0 AND "attempt_count" <= "max_attempts"),
  ADD CONSTRAINT "reminder_run_lease_state_check" CHECK (
    ("status" = 'RUNNING' AND "lease_owner" IS NOT NULL AND "lease_expires_at" IS NOT NULL)
    OR ("status" <> 'RUNNING' AND "lease_owner" IS NULL AND "lease_expires_at" IS NULL)
  );
