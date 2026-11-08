# ADR 0006: conciliação por pedido, independente do tempo do worker

- Status: aceito
- Data: 2026-11-08
- Fase: 6 (v0.6.0)

## Contexto

A conciliação transforma divergências entre loja, gateway e ERP em casos, que o agente vai
investigar e uma pessoa vai resolver. Ela precisa ser:

- **exata:** com a seed fixa do simulador, abrir exatamente os casos do gabarito, nem mais nem
  menos;
- **idempotente:** rodar a cada 5 minutos sem duplicar casos;
- **independente do tempo do worker:** a ingestão é assíncrona, e no instante em que a conciliação
  roda pode haver capturas recebidas que ainda não foram aplicadas.

## Decisão

1. **Regras por pedido:**
   - `PAYMENT_WITHOUT_ORDER`: o extrato tem a captura, o pedido está `PENDING` **e nenhum webhook
     `charge.captured` desse pedido foi recebido**.
   - `DUPLICATE_WEBHOOK`: algum evento do gateway do pedido tem `received_count > 1`.
   - `AMOUNT_MISMATCH`: o valor capturado (extrato), o total do pedido e a soma dos
     `PAYMENT_RECORDED` do ERP não são os três iguais.
2. **A condição "nenhum `charge.captured` recebido"** separa "o webhook se perdeu" de "o webhook
   chegou e está na fila". Sem ela, conciliar logo depois de uma simulação marcaria como
   "pagamento sem pedido" todo pedido cuja captura ainda não foi aplicada. Um evento que chegou mas
   falhou de vez está na DLQ, que é outro problema.
3. **O valor do gateway vem do extrato**, não do webhook: o extrato tem todas as capturas,
   inclusive as que nunca chegaram por webhook.
4. **Abrir é idempotente pelo banco.** `createMany` com `skipDuplicates` (`INSERT ... ON CONFLICT
DO NOTHING`) contra o índice único parcial `(order_id, type) WHERE status = 'OPEN'`. A
   divergência que já tem caso aberto aparece em `alreadyOpen`.
5. **O extrato é lido por uma interface** (`GatewayStatementSource`). Hoje a implementação lê o
   extrato simulado (ADR 0003); num gateway real, só ela muda.
6. **Agendamento no pg-boss.** `schedule('reconciliation', '*/5 * * * *')` numa fila `singleton`.
   Rodadas concorrentes (o cron e um `POST /reconcile`) são seguras por causa do `ON CONFLICT`. O
   intervalo vem de `RECONCILIATION_CRON`; `off` desliga o agendamento na instância, o que os
   testes usam.

## Alternativas consideradas

- **Só "pedido `PENDING` com captura no extrato"**, ao pé da letra do roteiro: depende do worker
  já ter aplicado tudo e quebra o teste do gabarito logo após a simulação.
- **Esperar a fila esvaziar antes de conciliar**: acopla a conciliação à fila e não resolve eventos
  na DLQ.
- **SQL único com os joins no extrato**: mais rápido, mas amarra a conciliação à tabela simulada e
  perde a troca da fonte do extrato.

## Consequências

- A conciliação é validada pelo teste mais forte do projeto: os casos abertos batem exatamente com o
  gabarito, também quando ela roda antes de o worker terminar.
- **Reabertura:** um caso resolvido pode ser reaberto se a divergência continuar no dado (um
  `received_count > 1` não volta a 1). A resolução só existe a partir da fase 8, então a regra de
  "não reabrir o que uma pessoa resolveu" entra lá.
- Pedidos que não existem na loja não geram caso, porque o caso exige o pedido (FK). Se o webhook da
  loja se perder, isso fica fora do escopo das três falhas simuladas.
