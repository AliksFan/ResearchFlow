-- CreateEnum
CREATE TYPE "WorkerHeartbeatStatus" AS ENUM ('STARTING', 'RUNNING', 'STOPPED');

-- CreateTable
CREATE TABLE "worker_heartbeat" (
    "id" UUID NOT NULL,
    "worker_id" TEXT NOT NULL,
    "process_id" INTEGER NOT NULL,
    "status" "WorkerHeartbeatStatus" NOT NULL DEFAULT 'STARTING',
    "enabled_task_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
    "stopped_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "worker_heartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "worker_heartbeat_worker_id_key" ON "worker_heartbeat"("worker_id");

-- CreateIndex
CREATE INDEX "worker_heartbeat_status_last_seen_at_idx" ON "worker_heartbeat"("status", "last_seen_at");
