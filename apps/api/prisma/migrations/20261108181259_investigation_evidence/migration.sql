-- AlterTable
ALTER TABLE "investigations" ADD COLUMN     "evidence" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE UNIQUE INDEX "investigations_one_active_per_case" ON "investigations"("case_id") WHERE (status IN ('QUEUED', 'RUNNING'));

