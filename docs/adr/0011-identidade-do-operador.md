# ADR 0011: quem decide vem de um token de operador assinado

- Status: aceito
- Data: 2026-11-08
- Versão: v0.10.0

## Contexto

Até a v0.9.0, aprovar e recusar recebiam `decidedBy` no corpo. Na demo pública, qualquer pessoa
aprovaria com qualquer nome, e a trilha de auditoria registraria o nome digitado como se fosse
uma identidade. Ao mesmo tempo, a demo não pode exigir cadastro nem senha: quem avalia o projeto
precisa clicar e ver o fluxo em um minuto, e o projeto tem custo zero (sem provedor de
identidade).

## Decisão

1. **`POST /session { operator }`** devolve um token `<payload>.<assinatura>` em base64url. O
   payload é `{ op, exp }`; a assinatura é HMAC-SHA256 do payload com `SESSION_SECRET`. Validade
   de 24h. Só `node:crypto`, sem dependência nova.
2. **Aprovar e recusar exigem `Authorization: Bearer <token>`.** Um guard confere a assinatura em
   tempo constante, o formato e a expiração; sem token válido, a resposta é 401 e nada muda.
3. **`decidedBy` e a auditoria vêm do token.** Um `decidedBy` no corpo é aceito e ignorado, para
   não quebrar clientes antigos sem deixar o corpo decidir quem é a pessoa.
4. **`SESSION_SECRET` é validado na subida**, como o `WEBHOOK_SECRET`: em produção, a api não sobe
   com o segredo de desenvolvimento nem com menos de 32 caracteres.
5. **Na web**, a primeira decisão pede o nome de operador, e o token fica no navegador por 24h. O
   cabeçalho mostra quem está decidindo. Com 401, a sessão é descartada e o nome é pedido de novo.

## Alternativas consideradas

- **JWT com biblioteca.** O formato é o mesmo na prática (payload e HMAC), mas traria uma
  dependência e a superfície de algoritmos (`alg: none`, troca de algoritmo) sem ganho para um
  token de um campo só.
- **Login de verdade (OAuth, senha).** Exige provedor ou cadastro, e afasta quem só quer ver a
  demo. Fica para quando houver usuários reais.
- **Cookie de sessão.** A web chama a api em outro domínio (ADR 0009); cookie entre domínios
  exigiria `SameSite=None`, CSRF e CORS com credenciais. O header Bearer evita tudo isso.

## Consequências

- Os testes provam: sem token, com token adulterado, expirado ou assinado com outro segredo, a
  resposta é 401 e a ação segue `PENDING`; com token, a auditoria registra o operador do token
  mesmo quando o corpo traz outro nome.
- É identificação de demonstração, não autenticação: qualquer pessoa escolhe qualquer nome. O que
  muda é que o nome fica amarrado a uma sessão assinada pela api, e não a um campo livre em cada
  requisição.
- Não há revogação: um token vale até expirar. Trocar o `SESSION_SECRET` invalida todos.
