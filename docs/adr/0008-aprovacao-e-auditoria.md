# ADR 0008: aprovação humana, execução exatamente uma vez e auditoria append-only

- Status: aceito
- Data: 2026-11-08
- Fase: 8 (v0.8.0)

## Contexto

O agente sugere uma ação; uma pessoa decide; o backend executa. A execução mexe em dinheiro
(marca pedido como pago e lança no ledger) e em sistemas externos (reenfileira eventos, pede
ajuste ao ERP). Duas pessoas podem clicar "Aprovar" ao mesmo tempo, a mesma pessoa pode clicar
duas vezes, e o efeito pode falhar no meio. Em todos esses casos, o resultado precisa ser o de uma
única execução, e cada decisão precisa ficar registrada.

## Decisão

1. **Duas transições condicionais, garantidas pelo banco.**
   - Aprovar é `UPDATE actions SET status = 'APPROVED' ... WHERE status = 'PENDING'`.
   - Executar começa com `UPDATE actions SET status = 'EXECUTED' WHERE id = $1 AND status =
'APPROVED'`. Com duas chamadas ao mesmo tempo, a segunda espera o lock da linha, reavalia o
     `WHERE` e encontra 0 linhas: sai sem efeito.
2. **Efeito, caso resolvido e auditoria no mesmo COMMIT**, com um único horário. Se o efeito
   falhar, a transação inteira volta: a ação segue `APPROVED`, a falha vai para a auditoria
   (fora da transação) e a resposta é 422. Aprovar de novo tenta outra vez.
3. **Efeitos idempotentes por si mesmos**, para que reexecutar seja seguro:
   - **`MARK_ORDER_PAID`:**
     - o pedido passa a `PAID` com um UPDATE condicional (`PENDING → PAID`);
     - o ledger usa `capture:<eventId do extrato>`, o mesmo `transactionId` que o worker usaria;
     - se o webhook perdido chegar depois, o ledger devolve `already-posted`.
   - **`REPROCESS_WEBHOOK`:** só reenfileira um evento ainda não aplicado. O worker continua
     garantindo uma única aplicação.
   - **`FLAG_ERP_DIVERGENCE`:** a chamada ao ERP é idempotente por `actionId` (único na caixa de
     entrada do ERP simulado).
   - **`IGNORE_DUPLICATE`:** não tem efeito além de encerrar o caso.
4. **O pedido vem do caso**, nunca dos `params` da ação (que vieram do modelo).
5. **Trilha de auditoria append-only.** A tabela `audit_log` registra `APPROVED`, `REJECTED`,
   `EXECUTED` e `EXECUTION_FAILED`, com quem, quando e os detalhes (o resultado ou o erro). Um
   trigger recusa UPDATE e DELETE, como no ledger.
6. **Recusar** é `PENDING → REJECTED` condicional. Nada é executado, e o caso continua `OPEN`.
7. **Não reabrir o que uma pessoa decidiu.** A conciliação ignora divergências cujo caso foi
   `RESOLVED` ou `DISMISSED`. Sem isso, um `IGNORE_DUPLICATE` ou um `FLAG_ERP_DIVERGENCE` aprovado
   voltaria a cada 5 minutos, porque o dado continua igual.
8. **ERP simulado atrás de uma interface** (`ErpAdjustmentSink`), como o extrato do gateway (ADR
   0003). Num ERP real, só a implementação muda.

## Alternativas consideradas

- **Lock de aplicação (mutex) ou fila para as aprovações**: não resistem a duas instâncias nem a
  um reinício. O `UPDATE` condicional resiste.
- **Executar fora da transação e marcar depois**: uma queda entre os dois passos deixaria o efeito
  feito e a ação `APPROVED`, e a próxima aprovação executaria de novo.
- **Auditoria só em log de aplicação**: some com a rotação dos logs e pode ser editada. A tabela
  append-only fica no mesmo backup do dado auditado.

## Consequências

- Os testes provam o "exatamente uma vez": duas aprovações em paralelo deixam um `APPROVED`, um
  `EXECUTED` e 2 lançamentos no ledger.
- Não há login ainda: `decidedBy` é informado na requisição. A auditoria registra o nome
  informado, não uma identidade verificada.
- O detector de breaking changes acusa o campo novo `alreadyResolved` na resposta do
  `POST /reconcile` como "obrigatório". Acrescentar um campo a uma resposta não quebra os clientes;
  a regra do script vale para requisições.
