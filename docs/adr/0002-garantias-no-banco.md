# ADR 0002: garantias no banco, não só no código

- Status: aceito
- Data: 2026-11-07
- Fase: 2 (v0.2.0)

## Contexto

O Reconcilia lida com dinheiro. Os erros que mais custam caro são os de concorrência e de dado
inválido: o mesmo webhook processado duas vezes em paralelo, dois casos abertos para a mesma
divergência, um lançamento de valor zero ou negativo no ledger.

Uma checagem só no código (`if (await exists()) return`) não resolve concorrência: dois processos
fazem a leitura ao mesmo tempo, os dois veem "não existe" e os dois gravam. Fila, singleton key e
locks na aplicação reduzem a chance, mas não dão garantia, e qualquer caminho novo (um script,
um job, uma correção manual) pode passar por fora deles.

## Decisão

As regras que não podem ser quebradas viram restrições do PostgreSQL. O código continua validando
antes (com Zod), para dar mensagens boas, mas a última palavra é do banco.

| Regra                                      | Como o banco garante                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| Um webhook do gateway é gravado uma vez só | `UNIQUE (event_id)` em `payment_events`                                        |
| Um evento do ERP é gravado uma vez só      | `UNIQUE (event_id)` em `erp_events`                                            |
| Um pedido externo existe uma vez só        | `UNIQUE (external_id)` em `orders`                                             |
| Um só caso aberto por (pedido, tipo)       | Índice único **parcial** `(order_id, type) WHERE status = 'OPEN'`              |
| Lançamento de ledger tem valor positivo    | `CHECK (amount_cents > 0)`; o sinal vem da direção (DEBIT/CREDIT)              |
| Valores nunca negativos                    | `CHECK (amount_cents >= 0)` em eventos e `CHECK (total_cents >= 0)` em pedidos |
| Contadores e parcelas coerentes            | `CHECK (received_count >= 1)` e `CHECK (installments >= 1)`                    |
| Confiança do agente entre 0 e 1            | `CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1)`                     |
| Registro financeiro não some em cascata    | FKs com `ON DELETE RESTRICT`                                                   |

Dinheiro é `integer` em centavos e datas são `timestamptz` (UTC). Status e tipos são enums do
Postgres, não texto livre.

### Como isso convive com o Prisma 7

- O índice parcial é declarado no schema com o preview feature `partialIndexes`
  (`@@unique([orderId, type], where: { status: "OPEN" })`). Como o Prisma conhece o índice, as
  próximas migrations não tentam apagá-lo.
- O Prisma não representa CHECK no schema. Os CHECKs são escritos à mão no fim da migration
  (`migrate dev --create-only` e edição). O `prisma migrate diff` contra o banco sai vazio, ou
  seja, o Prisma não tenta desfazê-los.
- Eventos do gateway e do ERP **não** têm FK para `orders`: o evento bruto precisa ser gravado
  mesmo que o pedido ainda não exista, e é a conciliação que transforma isso em caso.

### Verificação

- Testes contra o banco real ([`guarantees.test.ts`](../../apps/api/test/db/guarantees.test.ts)):
  `event_id` duplicado falha (P2002), dois casos abertos iguais falham, um caso resolvido mais um
  aberto passam (prova de que o índice é parcial) e um lançamento de valor 0 falha no CHECK.
- O DDL aplicado passou pelo `schema_analyzer.py` (skill database-designer), com a estrutura lida
  do `information_schema`: nenhuma tabela sem PK, nenhuma FK faltando. Os avisos que sobraram são
  as colunas `jsonb`, mantidas de propósito: `payload` guarda o webhook bruto como chegou, para
  auditoria, e `steps`, `suggested_action` e `params` são saídas do agente validadas por Zod.

## Alternativas consideradas

- **Só validação no código**: não resiste a concorrência nem a caminhos que pulam a aplicação.
- **Índice parcial escrito à mão em SQL**: funciona, mas o Prisma não o conhece e pode gerar um
  `DROP INDEX` numa migration futura. Fica como plano B se o preview feature mudar.
- **Triggers para as regras**: mais poderosos, mas escondem lógica no banco. CHECK e UNIQUE são
  declarativos e aparecem direto no `\d` da tabela.

## Consequências

- Erros de violação chegam como exceção do banco (P2002 para unique, erro de CHECK com o nome da
  constraint). As próximas fases tratam isso como resultado esperado. Exemplo: um webhook
  duplicado vira `200 {duplicate: true}`, não `500`.
- Toda constraint nova precisa de um teste que a viole de propósito.
- O ID dos registros é um UUID v7 gerado pelo Prisma. Inserts em SQL puro precisam informar o
  `id`, porque o PostgreSQL 17 ainda não tem `uuidv7()` nativo.
