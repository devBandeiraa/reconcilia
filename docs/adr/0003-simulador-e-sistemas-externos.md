# ADR 0003: simulador determinístico e sistemas externos simulados

- Status: aceito
- Data: 2026-11-07
- Fase: 3 (v0.3.0)

## Contexto

O Reconcilia precisa de tráfego realista com as três falhas (webhook perdido, webhook duplicado e
valor divergente no ERP) para provar a ingestão, o ledger e a conciliação. A conciliação da fase 6
será validada contra um **gabarito**: a lista exata de casos que ela deve abrir. Isso só funciona
se o tráfego for reproduzível.

Além disso, uma das falhas (o webhook perdido) só pode ser descoberta comparando com uma fonte que
não seja o webhook: o extrato do gateway. Num gateway real, isso vem da API de conciliação dele.
Aqui, o gateway não existe.

## Decisão

1. **Gerador determinístico, sem dependência.** PRNG mulberry32 semeado. Cada pedido consome
   sempre 4 sorteios, então a mesma seed dá o mesmo cenário e `--orders 20` é exatamente o
   começo de `--orders 50`. Os IDs vêm da seed (`S1-0001`, `evt_S1-0001_captured`): rodar a
   mesma seed de novo é um reenvio, não dados novos.
2. **No máximo uma falha por pedido**, para o gabarito ser inequívoco. As taxas são validadas
   (soma ≤ 1).
3. **Contratos externos próprios.** Loja (`order.created`), gateway (`charge.*`) e ERP
   (`*.recorded`) falam no formato deles, definidos com Zod em `packages/shared`. A api traduz
   para o modelo interno, como faria com sistemas reais.
4. **Tudo chega por HTTP assinado** (HMAC-SHA256 do corpo bruto no `X-Signature`), inclusive o
   que a api dispara para si mesma no `POST /simulate`. Assim, o simulador exercita exatamente o
   caminho de um sistema externo.
5. **O gerador é uma biblioteca** (`@reconcilia/simulator`, compilada para `dist/`). O CLI e o
   `POST /simulate` são camadas finas sobre ela.
6. **O extrato do gateway simulado mora na tabela `sim_gateway_statement`**, exposta por
   `POST/GET /sim/gateway/statement` num módulo separado (`SimulationModule`). O prefixo `sim_`
   marca que ela representa um sistema externo. A conciliação lê o extrato pelo `GET`, como leria
   a API de um gateway.

## Alternativas consideradas

- **Simulador escrevendo direto no banco**: mais rápido, mas não testa nada da ingestão.
- **Extrato num arquivo JSON gerado pelo CLI**: não funciona no `POST /simulate` em produção
  (Render tem disco efêmero) e a api precisaria ler arquivos.
- **CLI servindo o extrato por HTTP**: o CLI termina quando acaba de enviar.
- **Recalcular o extrato a partir da seed**: acopla a conciliação ao simulador. Num cenário real
  ela não teria a seed.
- **Biblioteca de PRNG (seedrandom etc.)**: dez linhas resolvem, sem dependência.

## Consequências

- O gabarito é a fonte de verdade dos testes da fase 6: com a seed fixa, os casos abertos devem
  bater exatamente com ele.
- Trocar o gateway simulado por um real exige só implementar a leitura do extrato da API dele no
  lugar do `GET /sim/gateway/statement`.
- Este ADR ocupa o número 0003. Os ADRs das fases seguintes (fila, ledger, agente, RAG) ficam com
  a numeração deslocada em um em relação ao roteiro original.
