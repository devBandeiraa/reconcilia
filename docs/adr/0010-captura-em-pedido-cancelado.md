# ADR 0010: captura em pedido cancelado vira caso, e o estorno é um por cobrança

- Status: aceito
- Data: 2026-11-08
- Versão: v0.10.0

## Contexto

O worker aplicava toda captura do gateway: se o pedido estava `PENDING`, ia para `PAID`; se já
não estava, a captura entrava no ledger sem aviso. Com o pedido `CANCELED`, isso é dinheiro
recebido por um pedido cancelado, exatamente o tipo de problema que o Reconcilia existe para
encontrar. Além disso, não havia como um pedido chegar a `CANCELED`: a loja só mandava
`order.created`.

## Decisão

1. **A loja manda `order.canceled`.** O cancelamento é um `UPDATE` condicional
   (`PENDING → CANCELED`, com `canceled_at`). Reenviar não muda nada. Cancelar um pedido que ainda
   não existe responde 409, para a loja tentar de novo.
2. **O ledger continua registrando a captura.** O dinheiro entrou de fato no gateway; esconder a
   captura do ledger deixaria o recebível errado. Quem aponta o problema é a conciliação.
3. **A conciliação abre `CAPTURE_ON_CANCELED_ORDER`** quando o pedido está `CANCELED`, o extrato
   do gateway tem captura dele e os `charge.refunded` recebidos não cobrem o valor capturado. A
   leitura é pelo extrato, então o resultado não depende do tempo do worker. O índice único
   parcial e a regra de não reabrir casos decididos (ADR 0006 e 0008) valem como para os outros
   tipos.
4. **O agente pode sugerir `REFUND_CAPTURE { chargeId }`.** O diagnóstico só é aceito se a
   cobrança está no extrato do pedido e o pedido está `CANCELED`. O valor do estorno não vem do
   modelo: vem do extrato.
5. **Aprovado, o backend lança o estorno**: débito `REFUNDS`, crédito `GATEWAY_RECEIVABLE`, com
   `transactionId = refund-capture:<chargeId>`. O id vem da cobrança, não da ação: mesmo que o caso
   seja investigado e aprovado de novo, o ledger devolve `already-posted`.
6. **O simulador ganha a falha `--canceled`** (padrão 0.1): `order.canceled` logo depois do
   `order.created`, e o gateway captura assim mesmo. O gabarito lista os casos novos.

## Alternativas consideradas

- **Não lançar a captura de pedido cancelado no ledger.** O ledger deixaria de refletir o que o
  gateway deve de verdade, e a divergência sumiria do dado em vez de virar caso.
- **Recusar a captura no worker (erro e DLQ).** O evento ficaria tentando de novo até a dead letter
  queue sem que ninguém investigasse; a DLQ é para falha técnica, não para divergência de negócio.
- **Estornar pelo gateway (pedir o estorno e esperar o `charge.refunded`).** É o que um gateway
  real exigiria. Aqui o gateway é simulado e a tarefa pedia o lançamento direto; fica registrado
  como limitação.

## Consequências

- Os testes provam: o caso abre para os pedidos do gabarito; o estorno aprovado zera o
  `GATEWAY_RECEIVABLE` das transações daquele pedido; duas aprovações em paralelo e uma segunda
  ação estornam uma vez só; o total do ledger continua 0.
- Limitação: se o gateway real mandar depois um `charge.refunded` da mesma cobrança, o worker
  lançaria `refund:<eventId>`, um segundo estorno. Com um gateway real, o `REFUND_CAPTURE` pediria
  o estorno à API dele e o lançamento viria do webhook.
- Com `--canceled 0.1` como padrão, a mesma seed passa a gerar casos do tipo novo em pedidos que
  antes saíam "sem falha". A sequência sorteada não muda: os outros casos continuam os mesmos.
- O prompt do agente vai para `system.v2.md`; o `system.v1.md` fica como histórico.
