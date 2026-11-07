-- CreateTable
CREATE TABLE "sim_gateway_statement" (
    "id" UUID NOT NULL,
    "charge_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "order_external_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "captured_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sim_gateway_statement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sim_gateway_statement_charge_id_key" ON "sim_gateway_statement"("charge_id");

-- CreateIndex
CREATE INDEX "sim_gateway_statement_order_external_id_idx" ON "sim_gateway_statement"("order_external_id");

-- CHECK escrito à mão (ver docs/adr/0002-garantias-no-banco.md).
ALTER TABLE "sim_gateway_statement"
  ADD CONSTRAINT "sim_gateway_statement_amount_cents_check" CHECK ("amount_cents" >= 0);
