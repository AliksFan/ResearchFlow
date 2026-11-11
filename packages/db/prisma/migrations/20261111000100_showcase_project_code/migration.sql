-- Showcase-only adaptation for fresh, fictional databases.
-- Historical migrations remain byte-identical for baseline integrity.
-- Intentionally fails if real/legacy established project records are present.
BEGIN;
ALTER TABLE "project" DROP CONSTRAINT "project_code_establishment_check";
ALTER TABLE "project" ADD CONSTRAINT "project_code_establishment_check" CHECK (
  ("established_at" IS NULL AND "project_code" IS NULL)
  OR ("established_at" IS NOT NULL AND "project_code" ~ '^DEMO-[0-9]{3,}$')
);
COMMIT;