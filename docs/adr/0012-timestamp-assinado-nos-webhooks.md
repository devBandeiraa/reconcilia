# ADR 0012: timestamp assinado nos webhooks, com janela de tolerância

- Status: aceito
- Data: 2026-11-08
- Versão: v0.10.0

## Contexto

Desde a v0.4.0 os webhooks chegam com `X-Signature: sha256=<hmac do corpo>`. Sem um tempo
assinado, um corpo capturado continua válido para sempre e pode ser reenviado. A idempotência
pelo banco (`event_id` único) segura o efeito, mas depender só dela deixa um replay passar pela
autenticação. O padrão de mercado (Stripe, por exemplo) assina também um timestamp e recusa
assinaturas antigas.

## Decisão

1. **Formato `X-Signature: t=<unix>,v1=<hex>`**, em que `v1` é o HMAC-SHA256 de `<t>.<corpo>`
   (o corpo bruto) com o segredo. O timestamp entra na assinatura: trocá-lo invalida o HMAC.
2. **Janela de tolerância `WEBHOOK_TOLERANCE_SECONDS`** (padrão 300), nos dois sentidos: uma
   assinatura de mais de 5 minutos atrás ou de mais de 5 minutos no futuro é recusada com 401,
   mesmo com o HMAC certo.
3. **Ordem da conferência:** formato, janela e, por último, o HMAC em tempo constante
   (`timingSafeEqual`).
4. **Mais de um `v1` é aceito** se um deles conferir. Assim dá para trocar o segredo sem janela
   de indisponibilidade (o remetente assina com o antigo e o novo durante a troca). Chaves
   desconhecidas (um `v0`, por exemplo) são ignoradas.
5. **O formato antigo `sha256=` deixa de ser aceito.** O único remetente é o simulador, que passa
   a assinar no formato novo na mesma versão.

## Alternativas consideradas

- **Guardar as assinaturas já vistas (nonce).** Impede replay mesmo dentro da janela, mas exige
  uma tabela a mais e limpeza. A idempotência por `event_id` já cobre o reenvio dentro da janela.
- **Aceitar os dois formatos por um tempo.** Não há remetente antigo para manter; aceitar o
  formato sem timestamp manteria a brecha aberta.

## Consequências

- Os testes provam: fora da janela (passado ou futuro) dá 401; corpo alterado, timestamp trocado,
  formato antigo e header sem `v1` dão 401; dentro da janela e com mais de um `v1` válido, a
  requisição é aceita.
- O relógio importa: o remetente e a api precisam estar com no máximo 5 minutos de diferença.
- A janela não substitui a idempotência: um reenvio dentro dos 5 minutos ainda chega, e quem
  garante uma única aplicação continua sendo o banco.
