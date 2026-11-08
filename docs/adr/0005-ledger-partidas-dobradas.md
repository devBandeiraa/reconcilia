# ADR 0005: ledger em partidas dobradas com garantias no banco

- Status: aceito
- Data: 2026-11-08
- Fase: 5 (v0.5.0)

## Contexto

A regra do projeto é que **todo movimento de dinheiro passa pelo ledger e soma zero por
transactionId**. Um ledger que pode ficar desbalanceado, ser editado depois ou receber o mesmo
movimento duas vezes não serve como fonte de verdade. Isso vale especialmente aqui, onde a
ingestão recebe webhooks duplicados e a fase 8 vai reprocessar eventos.

## Decisão

Ledger em partidas dobradas com duas tabelas e as garantias no banco, seguindo a linha do ADR 0002
(o código valida, o banco garante).

1. **Cabeçalho e lançamentos.** `ledger_transactions` (`transaction_id` como PK, descrição e data)
   e `ledger_entries` (conta, direção e valor positivo), com FK para o cabeçalho.
2. **Idempotência pelo `transaction_id`.** Ele vem do evento (`capture:<eventId>`,
   `refund:<eventId>`). O `post` insere o cabeçalho com `ON CONFLICT DO NOTHING` (`createMany`
   com `skipDuplicates`). Se já existia, devolve `already-posted` e não grava lançamentos. Isso
   cobre o reprocessamento mesmo que o `processed_at` do evento seja zerado.
3. **Soma zero no COMMIT.** Um `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` em
   `ledger_entries` confere, para cada `transaction_id` tocado, que existem pelo menos 2
   lançamentos e que a soma com sinal (débito +, crédito −) é zero. Diferido porque os lançamentos
   de uma transação entram um a um; a conferência espera todos.
4. **Append-only.** Triggers recusam UPDATE e DELETE em `ledger_entries` e `ledger_transactions`.
   Correção é um novo lançamento de estorno, como num livro contábil.
5. **Validação no serviço antes do banco.** `LedgerService.post` exige 2+ lançamentos, centavos
   inteiros positivos e débitos = créditos, e lança `LedgerUnbalancedError` antes de gravar. O
   trigger é a rede de segurança para qualquer caminho que pule o serviço.
6. **Mesma transação do worker.** O ledger recebe o `tx` do worker: marcar o evento como aplicado,
   mudar o pedido e lançar no ledger é um único COMMIT.
7. **Contas.** Mantidas as do roteiro: captura = débito `GATEWAY_RECEIVABLE` / crédito
   `ORDER_REVENUE`; estorno = débito `REFUNDS` (redutora da receita) / crédito
   `GATEWAY_RECEIVABLE`. `ERP_ADJUSTMENTS` fica reservada para a fase 8. O estorno entrou nesta
   fase porque um `charge.refunded` já era aceito pela ingestão e, sem ele, seria um movimento de
   dinheiro fora do ledger.
8. **Saldo consistente.** `GET /ledger/balance` lê as somas e as contagens num único snapshot
   `REPEATABLE READ`. O total é a soma dos saldos (débitos − créditos) e deve ser sempre 0.

## Alternativas consideradas

- **Uma tabela só com valor com sinal**: mais simples, mas perde a leitura contábil
  (débito/crédito) e não tem onde ancorar a idempotência por transação.
- **Unique em `(transaction_id, account, direction)`**: evita parte das duplicatas, mas uma
  transação com dois lançamentos na mesma conta e direção seria barrada, e nada impede uma
  transação incompleta.
- **Só validação no código**: um script ou uma correção manual passaria por fora. O trigger custa
  uma consulta indexada por transação.
- **Saldos materializados**: desnecessário no volume da demo. Somar os lançamentos é a verdade, e
  um cache de saldo seria mais uma coisa para ficar inconsistente.

## Consequências

- O ADR 0002 preferia CHECK e UNIQUE a triggers. Aqui o trigger é a única forma de expressar uma
  regra entre linhas (a soma zero). Ele fica documentado na migration e testado em SQL puro.
- Os testes esvaziam o ledger com `TRUNCATE`, que não dispara triggers de linha. Em produção,
  não há como apagar lançamentos pela aplicação.
- Pedidos pagos antes da v0.5.0 não têm lançamento: o ledger começa a valer nesta versão.
