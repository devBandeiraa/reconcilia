-- CreateEnum
CREATE TYPE "AuditEvent" AS ENUM ('APPROVED', 'REJECTED', 'EXECUTED', 'EXECUTION_FAILED');

-- AlterTable
ALTER TABLE "actions" ADD COLUMN     "decided_by" TEXT,
ADD COLUMN     "execution_result" JSONB,
ADD COLUMN     "rejection_reason" TEXT;

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "event" "AuditEvent" NOT NULL,
    "actor" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_erp_adjustments" (
    "id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "order_external_id" TEXT NOT NULL,
    "expected_cents" INTEGER NOT NULL,
    "erp_cents" INTEGER NOT NULL,
    "difference_cents" INTEGER NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_erp_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_case_id_idx" ON "audit_log"("case_id");

-- CreateIndex
CREATE INDEX "audit_log_action_id_idx" ON "audit_log"("action_id");

-- CreateIndex
CREATE UNIQUE INDEX "sim_erp_adjustments_action_id_key" ON "sim_erp_adjustments"("action_id");

-- CreateIndex
CREATE INDEX "sim_erp_adjustments_order_external_id_idx" ON "sim_erp_adjustments"("order_external_id");

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Escrito à mão (ver docs/adr/0008-aprovacao-e-auditoria.md).
-- ---------------------------------------------------------------------------
ALTER TABLE "sim_erp_adjustments"
  ADD CONSTRAINT "sim_erp_adjustments_cents_check" CHECK ("expected_cents" >= 0 AND "erp_cents" >= 0);

-- Trilha de auditoria append-only: o que foi decidido e executado não se altera nem se apaga.
CREATE FUNCTION "audit_reject_changes"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log: % não é permitido (a trilha de auditoria é append-only)', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER "audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_reject_changes"();
