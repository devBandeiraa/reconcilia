-- CreateTable
CREATE TABLE "ledger_transactions" (
    "transaction_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("transaction_id")
);

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "ledger_transactions"("transaction_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Garantias do ledger escritas à mão (o schema do Prisma não representa triggers).
-- Ver docs/adr/0005-ledger-partidas-dobradas.md.
-- ---------------------------------------------------------------------------

-- 1. Partidas dobradas: no COMMIT, cada transaction_id tocado precisa ter pelo menos 2
--    lançamentos e soma com sinal (DEBIT +, CREDIT -) igual a zero. DEFERRABLE INITIALLY
--    DEFERRED: a checagem espera todos os lançamentos da transação serem inseridos.
CREATE FUNCTION "ledger_check_balanced"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  tx_id text := NEW.transaction_id;
  entry_count integer;
  signed_sum bigint;
BEGIN
  SELECT count(*),
         COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount_cents ELSE -amount_cents END), 0)
    INTO entry_count, signed_sum
    FROM "ledger_entries"
   WHERE transaction_id = tx_id;

  IF entry_count < 2 OR signed_sum <> 0 THEN
    RAISE EXCEPTION 'ledger: transação % desbalanceada (lançamentos: %, soma com sinal: %)',
      tx_id, entry_count, signed_sum
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ledger_entries_balanced"
  AFTER INSERT ON "ledger_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "ledger_check_balanced"();

-- 2. Append-only: lançamento não se altera nem se apaga; correção é um lançamento de estorno.
CREATE FUNCTION "ledger_reject_changes"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger: % em % não é permitido (o ledger é append-only; corrija com um estorno)',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER "ledger_entries_append_only"
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION "ledger_reject_changes"();

CREATE TRIGGER "ledger_transactions_append_only"
  BEFORE UPDATE OR DELETE ON "ledger_transactions"
  FOR EACH ROW EXECUTE FUNCTION "ledger_reject_changes"();
