# ADR 0004: fila no próprio Postgres (pg-boss)

- Status: aceito
- Data: 2026-11-07
- Fase: 4 (v0.4.0)

## Contexto

Cada webhook do gateway precisa ser aplicado **exatamente uma vez**: marcar o pedido como pago
e, a partir da fase 5, lançar no ledger. A aplicação deve sair do caminho da requisição, para
o gateway receber resposta rápida, e precisa de retry com backoff e de um lugar para os eventos
que não deram certo.

O projeto tem restrição de custo zero e roda em plano gratuito (Render Free para a api, Neon
para o banco). Cada serviço a mais é mais uma conta, um limite e um ponto de falha.

## Decisão

**pg-boss** (12.38) no mesmo Postgres do app, no schema `pgboss`, com o worker rodando no mesmo
processo da api.

1. **Enfileiramento transacional.** O webhook é gravado (`INSERT ... ON CONFLICT DO UPDATE`) e o
   job é criado na **mesma transação**, com o adaptador `fromPrisma(tx)` do pg-boss. Se o
   processo cair entre gravar e enfileirar, a transação inteira volta. Isso elimina o problema
   clássico do "dual write" (banco e fila separados), que exigiria um outbox.
2. **A fila é otimização, não garantia.** A policy `exclusive` com `singletonKey = eventId`
   impede dois jobs vivos para o mesmo evento (o índice único é do próprio pg-boss). A garantia
   final continua no banco: `UPDATE payment_events SET processed_at = now() WHERE id = $1 AND
processed_at IS NULL`, na transação que aplica. Com 0 linhas, o evento já foi aplicado.
3. **Retry e DLQ por job:** `retryLimit` (padrão 5), `retryDelay` com `retryBackoff`
   exponencial (teto de 300s) e `deadLetter`. As opções vão em cada job, então valem mesmo se a
   fila já existir com outras configurações.
4. **Worker em lote com liquidação por job:** `batchSize: 10`, `burstWhenBatchFull` e
   `perJobResults`. A falha de um evento marca só aquele job. Com `batchSize: 1`, o worker
   esperava o intervalo de polling entre jobs: medido com o simulador, 190 eventos levavam
   minutos. Em lote, a fila esvazia 2s depois do envio.
5. **Só os eventos do gateway passam pela fila.** Eventos do ERP têm a mesma ingestão
   idempotente, mas não mudam estado (a conciliação só os lê), então não há o que aplicar.

## Alternativas consideradas

- **Redis + BullMQ**: um serviço a mais (e pago, ou com limites apertados no plano gratuito).
  Também perde o enfileiramento transacional: o job iria para o Redis fora da transação do
  Postgres, exigindo um outbox.
- **Processar na própria requisição**: sem retry com backoff, sem DLQ, e o gateway esperaria a
  aplicação terminar.
- **Tabela de outbox + polling próprio**: é o que o pg-boss já faz, com locks
  (`FOR UPDATE SKIP LOCKED`), retry, DLQ e manutenção prontos.

## Consequências

- Um serviço a menos para operar e pagar. O backup do banco inclui a fila.
- A fila compete com o app pelas conexões do Postgres. Na Neon, a conexão do pg-boss deve passar
  pelo pooler. A verificação de compatibilidade com o modo de pool fica para a fase 10 (deploy).
- `GET /admin/dlq` mostra os eventos que esgotaram as tentativas, com a mensagem do último erro.
  Reprocessá-los é a ação `REPROCESS_WEBHOOK` da fase 8.
- O teste de fila precisa esperar retries reais. Nos testes, o retry usa atraso de 1s e 2
  tentativas extras, e a suíte limpa as filas uma de cada vez: apagar todas de uma vez cruzava
  locks com o worker em polling (deadlock).
