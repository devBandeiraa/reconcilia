-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentEventType" AS ENUM ('AUTHORIZED', 'CAPTURED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ErpEventType" AS ENUM ('PAYMENT_RECORDED', 'REFUND_RECORDED', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LedgerAccount" AS ENUM ('GATEWAY_RECEIVABLE', 'ORDER_REVENUE', 'REFUNDS', 'ERP_ADJUSTMENTS');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('PAYMENT_WITHOUT_ORDER', 'DUPLICATE_WEBHOOK', 'AMOUNT_MISMATCH');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "InvestigationStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ActionKind" AS ENUM ('REPROCESS_WEBHOOK', 'MARK_ORDER_PAID', 'FLAG_ERP_DIVERGENCE', 'IGNORE_DUPLICATE');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "total_cents" INTEGER NOT NULL,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "order_external_id" TEXT NOT NULL,
    "type" "PaymentEventType" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "received_count" INTEGER NOT NULL DEFAULT 1,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_events" (
    "id" UUID NOT NULL,
    "event_id" TEXT NOT NULL,
    "order_external_id" TEXT NOT NULL,
    "type" "ErpEventType" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "received_count" INTEGER NOT NULL DEFAULT 1,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erp_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "account" "LedgerAccount" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" "CaseType" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investigations" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "status" "InvestigationStatus" NOT NULL DEFAULT 'QUEUED',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "diagnosis" TEXT,
    "suggested_action" JSONB,
    "confidence" DOUBLE PRECISION,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investigations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actions" (
    "id" UUID NOT NULL,
    "investigation_id" UUID NOT NULL,
    "kind" "ActionKind" NOT NULL,
    "params" JSONB NOT NULL,
    "status" "ActionStatus" NOT NULL DEFAULT 'PENDING',
    "decided_at" TIMESTAMPTZ(3),
    "executed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_external_id_key" ON "orders"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_event_id_key" ON "payment_events"("event_id");

-- CreateIndex
CREATE INDEX "payment_events_order_external_id_idx" ON "payment_events"("order_external_id");

-- CreateIndex
CREATE UNIQUE INDEX "erp_events_event_id_key" ON "erp_events"("event_id");

-- CreateIndex
CREATE INDEX "erp_events_order_external_id_idx" ON "erp_events"("order_external_id");

-- CreateIndex
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries"("transaction_id");

-- CreateIndex
CREATE INDEX "cases_order_id_idx" ON "cases"("order_id");

-- CreateIndex
CREATE INDEX "cases_status_type_idx" ON "cases"("status", "type");

-- CreateIndex
CREATE UNIQUE INDEX "cases_one_open_per_order_type" ON "cases"("order_id", "type") WHERE ("status" = 'OPEN');

-- CreateIndex
CREATE INDEX "investigations_case_id_idx" ON "investigations"("case_id");

-- CreateIndex
CREATE INDEX "actions_investigation_id_idx" ON "actions"("investigation_id");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_investigation_id_fkey" FOREIGN KEY ("investigation_id") REFERENCES "investigations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CHECKs (escritos à mão: o schema do Prisma não representa CHECK constraints).
-- Dinheiro em centavos: o ledger só aceita valores positivos (a direção diz o sinal);
-- os demais valores aceitam zero, nunca negativo. Ver docs/adr/0002-garantias-no-banco.md.
-- ---------------------------------------------------------------------------
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_total_cents_check" CHECK ("total_cents" >= 0),
  ADD CONSTRAINT "orders_installments_check" CHECK ("installments" >= 1);

ALTER TABLE "payment_events"
  ADD CONSTRAINT "payment_events_amount_cents_check" CHECK ("amount_cents" >= 0),
  ADD CONSTRAINT "payment_events_received_count_check" CHECK ("received_count" >= 1);

ALTER TABLE "erp_events"
  ADD CONSTRAINT "erp_events_amount_cents_check" CHECK ("amount_cents" >= 0),
  ADD CONSTRAINT "erp_events_received_count_check" CHECK ("received_count" >= 1);

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_amount_cents_check" CHECK ("amount_cents" > 0);

ALTER TABLE "investigations"
  ADD CONSTRAINT "investigations_confidence_check"
  CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));
