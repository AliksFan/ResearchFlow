-- CreateEnum
CREATE TYPE "CredentialTokenPurpose" AS ENUM ('ACTIVATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "AuthRateLimitDimension" AS ENUM ('LOGIN_NAME', 'SOURCE_IP');

-- CreateEnum
CREATE TYPE "RoleAssignmentGrantSource" AS ENUM ('SYSTEM_BOOTSTRAP', 'PMO_ACTION');

-- AlterTable
ALTER TABLE "person" ADD COLUMN     "failed_login_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failed_login_window_started_at" TIMESTAMPTZ(3),
ADD COLUMN     "locked_until" TIMESTAMPTZ(3),
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "password_changed_at" TIMESTAMPTZ(3),
ALTER COLUMN "password_hash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "role_assignment" ADD COLUMN     "grant_source" "RoleAssignmentGrantSource" NOT NULL DEFAULT 'PMO_ACTION',
ALTER COLUMN "granted_by_person_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "auth_credential_token" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "purpose" "CredentialTokenPurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_credential_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_history" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_rate_limit" (
    "id" UUID NOT NULL,
    "dimension" "AuthRateLimitDimension" NOT NULL,
    "key_hash" TEXT NOT NULL,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMPTZ(3),
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_rate_limit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_credential_token_token_hash_key" ON "auth_credential_token"("token_hash");

-- CreateIndex
CREATE INDEX "auth_credential_token_person_id_purpose_expires_at_idx" ON "auth_credential_token"("person_id", "purpose", "expires_at");

-- CreateIndex
CREATE INDEX "auth_credential_token_expires_at_idx" ON "auth_credential_token"("expires_at");

-- CreateIndex
CREATE INDEX "password_history_person_id_created_at_idx" ON "password_history"("person_id", "created_at");

-- CreateIndex
CREATE INDEX "auth_rate_limit_locked_until_idx" ON "auth_rate_limit"("locked_until");

-- CreateIndex
CREATE UNIQUE INDEX "auth_rate_limit_dimension_key_hash_key" ON "auth_rate_limit"("dimension", "key_hash");

-- AddForeignKey
ALTER TABLE "auth_credential_token" ADD CONSTRAINT "auth_credential_token_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Authentication constraints that Prisma Schema cannot express.
ALTER TABLE "person"
ADD CONSTRAINT "person_login_name_format_check" CHECK (
  char_length("login_name") BETWEEN 3 AND 50
  AND "login_name" = lower("login_name")
  AND "login_name" ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$'
  AND "login_name" !~ '[._-]{2}'
),
ADD CONSTRAINT "person_failed_login_count_nonnegative_check" CHECK ("failed_login_count" >= 0);

ALTER TABLE "auth_credential_token"
ADD CONSTRAINT "auth_credential_token_hash_nonempty_check" CHECK (length("token_hash") > 0),
ADD CONSTRAINT "auth_credential_token_expiry_check" CHECK ("expires_at" > "created_at");

ALTER TABLE "password_history"
ADD CONSTRAINT "password_history_hash_nonempty_check" CHECK (length("password_hash") > 0);

ALTER TABLE "auth_rate_limit"
ADD CONSTRAINT "auth_rate_limit_key_hash_nonempty_check" CHECK (length("key_hash") > 0),
ADD CONSTRAINT "auth_rate_limit_failure_count_nonnegative_check" CHECK ("failure_count" >= 0);

ALTER TABLE "role_assignment"
ADD CONSTRAINT "role_assignment_grant_source_check" CHECK (
  (
    "grant_source" = 'SYSTEM_BOOTSTRAP'
    AND "granted_by_person_id" IS NULL
    AND "role_code" = 'PMO'
    AND "project_id" IS NULL
  )
  OR
  (
    "grant_source" = 'PMO_ACTION'
    AND "granted_by_person_id" IS NOT NULL
  )
);

CREATE UNIQUE INDEX "auth_credential_token_one_open_per_purpose_key"
ON "auth_credential_token" ("person_id", "purpose")
WHERE "consumed_at" IS NULL AND "revoked_at" IS NULL;

CREATE UNIQUE INDEX "role_assignment_single_system_bootstrap_key"
ON "role_assignment" ("grant_source")
WHERE "grant_source" = 'SYSTEM_BOOTSTRAP';
