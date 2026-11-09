# ADR 0013: identidade visual, regra de cor e capturas geradas por script

- Status: aceito
- Data: 2026-11-09
- Versão: v0.11.0

## Contexto

A interface da v0.9.0 usava o tema padrão do shadcn/ui: todas as variáveis eram cinza puro, sem
cor de marca, e cada linha da lista de casos tinha dois selos coloridos. O âmbar de "duplicado" e
o laranja de "Aberto" quase se confundiam, e o ciano de "pagamento sem pedido" era o mesmo da
barra de confiança do agente. A mesma cor tinha dois sentidos, e cor demais deixava de comunicar.
As capturas do README eram da v0.8.0 e foram tiradas à mão.

## Decisão

1. **A cor da marca é o verde do conciliado** (`#3fb950` no escuro, `#1a7f37` no claro, para
   passar AA sobre branco). Ela é `--primary` e `--ring`: botão principal, foco, seleção e a barra
   de confiança do agente.
2. **Cor só para status**, com tokens semânticos:
   - `--status-attention` (âmbar): **Aberto** e o evento duplicado da linha do tempo;
   - `--status-ok` (verde): **Resolvido** e o ledger fechando em zero;
   - `--status-muted` (cinza): **Descartado**.
3. **Tipos de divergência são neutros:** ícone do lucide e rótulo, sem cor própria, nos selos e
   nos contadores. Quando o filtro já fixa o status, a linha mostra o status como texto, sem selo.
4. **Nenhuma cor fixa do Tailwind nas telas** (`text-sky-300`, `bg-amber-500`…): tudo passa pelos
   tokens do `globals.css`.
5. **O tema segue o sistema** (`prefers-color-scheme`), sem a classe `.dark` fixa. A variante
   `dark:` do Tailwind passa a ser a media query, então não há flash na carga nem script.
6. **Contraste verificado**: 15 pares por tema (texto, texto discreto, botão, selos sobre o fundo
   tingido, erro, foco e barra). Texto passa 4,5:1 e elementos de interface passam 3:1. O anel de
   foco dos componentes usa a cor cheia (antes era 50%, que não garantia 3:1).
7. **Símbolo**: um sinal de igual cujo traço de baixo vira um visto ("bateu" vira "conferido").
   Favicon em `app/icon.svg` com fundo escuro, para ler em abas claras e escuras; logo no
   cabeçalho; `docs/img/logo.svg` troca a cor da palavra conforme o tema do GitHub.
8. **Prévia de link** com `ImageResponse` do Next (`app/opengraph-image.tsx` e
   `app/twitter-image.tsx`, 1200×630), sem serviço externo.
9. **Capturas por script** (`apps/web/scripts/capturas.ts`, Playwright): o GIF percorre o fluxo
   real a partir de um banco vazio, e as quatro capturas saem do mesmo estado. O GIF é montado dos
   quadros com `pngjs` e `gifenc`, porque o ffmpeg que vem com o Playwright não gera GIF. O script
   roda com Node puro (remoção de tipos do Node 24), sem `tsx`.

## Alternativas consideradas

- **Uma cor por tipo de divergência, só mais distantes entre si.** Continuaria havendo dois selos
  coloridos por linha, e o tipo não é algo que pede ação; o status é.
- **Só tema escuro.** Os tokens claros do shadcn continuariam lá sem uso nem verificação. Seguir o
  sistema faz os dois conjuntos valerem e serem conferidos.
- **Gravar vídeo e converter para GIF.** Exigiria um ffmpeg completo instalado; os quadros
  escolhidos também deixam o GIF menor (cerca de 260 KB, contra 830 KB do anterior).

## Consequências

- Uma cor nova na interface precisa de um sentido e de um token; a lista de usos está no README.
- As capturas ficam reproduzíveis: mudou a tela, roda-se o script de novo.
- O script de capturas não roda no CI (precisa de api, web e navegador); falha se algum passo do
  fluxo não aparecer.
- A prévia de link usa a fonte padrão do `ImageResponse`, num peso só.
