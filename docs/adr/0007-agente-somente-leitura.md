# ADR 0007: agente de IA somente leitura, com limites garantidos fora do modelo

- Status: aceito
- Data: 2026-11-08
- Fase: 7 (v0.7.0)

## Contexto

O agente investiga casos de divergência de pagamento e sugere uma ação. Um modelo de linguagem
erra, inventa ids e pode ser induzido por dados estranhos. Num sistema financeiro, a pergunta não
é "o modelo vai se comportar?", mas "o que acontece quando ele não se comportar?". Além disso, o
projeto tem custo zero: o plano gratuito do Gemini tem cota baixa, e a demo precisa funcionar sem
ela.

## Decisão

Os limites do agente são impostos pelo backend e pelo banco, nunca pedidos ao modelo.

1. **Só leitura, garantido pelo Postgres.** Cada ferramenta roda numa transação
   `SET TRANSACTION READ ONLY`. Uma escrita ali dentro falha no banco, mesmo que um bug tente. Quem
   grava a investigação e a ação é o backend, depois do loop, a partir do resultado validado.
2. **O pedido vem do caso.** As ferramentas não têm parâmetros: o backend injeta o pedido do caso.
   A ação sugerida não tem `orderId`; na execução (fase 8), ele sai do caso.
3. **Saída validada por schema e conferida contra os dados.** O `submitDiagnosis` passa por Zod
   (`params` estritos por tipo de ação) e por uma conferência: `chargeId` precisa estar no extrato
   do pedido, `eventId` precisa ser um webhook do pedido e os valores do `FLAG_ERP_DIVERGENCE`
   precisam bater com o extrato e o ERP. Um diagnóstico inválido volta ao modelo com o erro uma
   vez; na segunda, a investigação fica `FAILED`.
4. **Loop limitado.** No máximo 8 chamadas ao modelo por investigação.
5. **Ações só depois de aprovação humana.** O resultado vira uma `action` `PENDING`; nada é
   executado nesta fase.
6. **Interface neutra (`LlmClient`).** O loop não conhece tipos do Gemini. Há três
   implementações:
   - `GeminiClient`: SDK oficial `@google/genai`, function calling em modo `ANY`, temperatura 0, e
     guarda o conteúdo original da resposta por causa do `thoughtSignature`.
   - `FakeLlmClient`: roteirizado, é o único usado nos testes.
   - `ReplayLlmClient`: o modo demonstração.
7. **Falhas do modelo viram status, não exceção.**
   - 429 (cota) dá `FAILED` na hora, com o motivo.
   - 5xx tem até 3 tentativas curtas (até 8s de espera) e timeout de 60s.
   - O retry padrão do SDK (5 tentativas, até 60s, inclusive no 429) foi substituído: ele deixava
     a investigação minutos em `RUNNING` com a cota esgotada.
8. **Uma investigação ativa por caso**, por índice único parcial. Uma investigação interrompida
   (a api reiniciou) vira `FAILED` na subida.
9. **Modo demonstração por padrão (`DEMO_REPLAY=true`).** Roteiros por tipo de caso: as
   ferramentas rodam de verdade e o diagnóstico é preenchido com os dados delas e passa pela mesma
   validação. A demo funciona sem chave e sem cota.
10. **Ferramentas: `getGatewayStatement` no lugar de `getStock`.** O modelo de dados não tem
    produto nem estoque. O extrato do gateway é a evidência central do `PAYMENT_WITHOUT_ORDER`.

## Resultado no aceite (Gemini real)

| Caso                    | Ação                                       | Rodadas | Tempo |
| ----------------------- | ------------------------------------------ | ------- | ----- |
| `AMOUNT_MISMATCH`       | `FLAG_ERP_DIVERGENCE` (20960 contra 22213) | 3       | 42s   |
| `PAYMENT_WITHOUT_ORDER` | `MARK_ORDER_PAID` (`ch_S5005-0006`)        | 5       | 23s   |
| `DUPLICATE_WEBHOOK`     | `IGNORE_DUPLICATE` (recebido 5 vezes)      | 2       | 9s    |

Antes disso, no mesmo dia:

- **`gemini-3.8-flash`:** 503 ("high demand") e 504 seguidos.
- **`gemini-3.7-flash`:** 504, depois 429.
- **`gemini-2.5-flash`:** 404 ("no longer available to new users").

O padrão ficou `gemini-3.5-flash`, que respondeu de forma estável. O modelo é configurável por
`GEMINI_MODEL`.

## Alternativas consideradas

- **Pedir no prompt para não escrever ou não inventar**: necessário, mas não é garantia.
- **Ferramentas com `orderId` como parâmetro**: abre a porta para o modelo consultar ou agir sobre
  outro pedido.
- **Deixar o agente executar a ação**: viola a regra de aprovação humana.
- **Gravar investigações reais como fixtures**: ainda não havia chave quando os roteiros foram
  escritos. Eles seguem o formato de uma investigação real e podem ser substituídos por gravações.

## Consequências

- Os testes provam os limites sem chamar o modelo: o banco fica idêntico (md5 de todas as
  tabelas) antes e depois das ferramentas, e uma escrita dentro da transação delas é recusada.
- A demo pública não depende de cota: com `DEMO_REPLAY=true`, ela funciona do mesmo jeito.
- A recuperação de investigações interrompidas pressupõe uma instância só da api, que é o caso do
  deploy. Com várias instâncias, seria preciso um heartbeat por investigação.
